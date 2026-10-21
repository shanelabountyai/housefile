// Task 2.4 (D-12, D-14, D-35, D-46, D-55): commit a stored preview. The only input is the batch id. The stored plan
// is re-hashed (PLAN_TAMPERED), the state is re-hashed against beforeHash (STATE_MOVED), then one transaction
// writes exactly the plan: NEW rows → constituent + version 1; MERGE rows → MergeEvent + survivorship version +
// gift; REVIEW rows → ReviewItems for every tied candidate; rows whose target is still in review → ReviewItems
// with candidateRowIndex (D-55). Every row is tagged with the batch (directly, or through its MergeEvent).
import type { ConstituentVersion, PrismaClient } from '@/generated/prisma/client';
import { sha256Hex } from '../lib/canonical';
import { parseCsv } from '../import/csv';
import type { Field } from '../import/map';
import type { Alias, Alternate, FieldChange, Preview } from '../import/preview';
import type { ImportRow } from '../import/validate';
import { latestVersion, loadEffectiveConstituent, loadEffectiveState, type Tx } from './db-state';
import type { StoredMap, StoredRows } from './preview';
import { effectiveStateHash, META_FIELDS, type AliasEntry, type AlternateEntry, type FieldMeta } from './state';

export type CommitStatus = 'COMMITTED' | 'ALREADY_COMMITTED' | 'STATE_MOVED' | 'PLAN_TAMPERED';
export type Written = { constituents: number; versions: number; gifts: number; giftsPending: number; giftsSkipped: number; mergeEvents: number; reviewItems: number; reviewRows: number; pendingTargetRows: number; pendingTargetItems: number };
export type CommitResult = { status: CommitStatus; batchId: string; written: Written; expected?: string; actual?: string };

const ZERO: Written = { constituents: 0, versions: 0, gifts: 0, giftsPending: 0, giftsSkipped: 0, mergeEvents: 0, reviewItems: 0, reviewRows: 0, pendingTargetRows: 0, pendingTargetItems: 0 };
const pad = (n: number, w: number) => String(n).padStart(w, '0');

export async function commitBatch(db: PrismaClient, input: { batchId: string; userId: string }): Promise<CommitResult> {
  const { batchId, userId } = input;
  return db.$transaction(
    async (tx) => {
      const batch = await tx.importBatch.findUniqueOrThrow({ where: { id: batchId } });
      if (await tx.importBatchEvent.findFirst({ where: { importBatchId: batchId, kind: 'COMMITTED' } })) return { status: 'ALREADY_COMMITTED' as const, batchId, written: { ...ZERO } };
      const planHash = sha256Hex(batch.plan);
      if (planHash !== batch.planHash) return { status: 'PLAN_TAMPERED' as const, batchId, written: { ...ZERO }, expected: batch.planHash, actual: planHash };
      const actual = effectiveStateHash(await loadEffectiveState(tx, batch.orgId));
      if (actual !== batch.beforeHash) return { status: 'STATE_MOVED' as const, batchId, written: { ...ZERO }, expected: batch.beforeHash, actual };
      const written = await applyPlan(tx, batch);
      await tx.importBatchEvent.create({ data: { orgId: batch.orgId, importBatchId: batchId, kind: 'COMMITTED', userId } });
      return { status: 'COMMITTED' as const, batchId, written };
    },
    { timeout: 120_000, isolationLevel: 'Serializable' },
  );
}

type Batch = { id: string; orgId: string; fileName: string; rawBytes: Uint8Array; map: unknown; rows: unknown; plan: unknown };

/** Next free number for business ids of the form <prefix><digits> in this org (ids are never reused: rows are never deleted). */
async function nextSeq(tx: Tx, table: 'Constituent' | 'Gift' | 'Household', col: 'businessId' | 'giftRef', prefix: string, orgId: string): Promise<number> {
  const [r] = await tx.$queryRawUnsafe<{ m: number | null }[]>(`SELECT max(substring("${col}" from 2)::int) AS m FROM "${table}" WHERE "orgId" = $1::uuid AND "${col}" ~ $2`, orgId, `^${prefix}[0-9]+$`);
  return (r?.m ?? 0) + 1;
}

const groupBy = <T>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
};

/** The version columns worth carrying from one version to the next. */
function carry(v: ConstituentVersion) {
  return {
    orgId: v.orgId, constituentId: v.constituentId, status: v.status,
    firstName: v.firstName, middleName: v.middleName, lastName: v.lastName, suffix: v.suffix,
    email: v.email, phone: v.phone, addressLine1: v.addressLine1, addressLine2: v.addressLine2, city: v.city, state: v.state, zip: v.zip,
    dob: v.dob, householdId: v.householdId,
    fieldMeta: { ...(v.fieldMeta as FieldMeta) }, aliases: [...(v.aliases as AliasEntry[])], alternates: [...(v.alternates as AlternateEntry[])],
  };
}

async function applyPlan(tx: Tx, batch: Batch): Promise<Written> {
  const orgId = batch.orgId;
  const batchId = batch.id;
  const plan = batch.plan as unknown as Preview;
  const stored = batch.rows as unknown as StoredRows;
  const map = (batch.map as StoredMap).fields;
  const parsed = parseCsv(new Uint8Array(batch.rawBytes));
  const cell = (row: ImportRow, f: Field): string => {
    const h = map[f];
    return h ? (parsed.rows[row.index]?.cells[h] ?? '').trim() : '';
  };
  const sourceOf = (rowId: string) => `${batch.fileName}#${rowId}`;
  const rowsById = new Map(stored.rows.map((r) => [r.id, r]));
  const giftOf = new Map(plan.gifts.map((g) => [g.rowId, g]));
  const changesOf = groupBy(plan.changes, (c) => c.rowId);
  const alternatesOf = groupBy(plan.alternates, (a) => a.rowId);
  const aliasesOf = groupBy(plan.aliases, (a) => a.rowId);
  const pending = new Map(plan.pending.map((p) => [p.rowId, p]));

  const consByBiz = new Map((await tx.constituent.findMany({ where: { orgId }, select: { id: true, businessId: true } })).map((c) => [c.businessId, c.id]));
  const rowTarget = new Map<string, string>(); // row id → the constituent it became or merged into
  const resolve = (target: string): string | undefined => consByBiz.get(target) ?? rowTarget.get(target);
  let nextC = await nextSeq(tx, 'Constituent', 'businessId', 'C', orgId);
  let nextG = await nextSeq(tx, 'Gift', 'giftRef', 'G', orgId);
  const funds = new Map<string, string>();
  const fundId = async (code: string) => {
    let id = funds.get(code);
    if (!id) funds.set(code, (id = (await tx.fund.upsert({ where: { orgId_code: { orgId, code } }, create: { orgId, code }, update: {} })).id));
    return id;
  };

  const w: Written = { ...ZERO, giftsSkipped: plan.skippedGifts.length };

  /** The row's own values as version columns (NEW rows, and the fields a merge takes from the row). */
  const rowFields = (row: ImportRow) => {
    const n = row.record.name; // parsed (folded) parts stand in when the file has one full-name column
    return {
      firstName: cell(row, 'first') || n.first, middleName: cell(row, 'middle') || n.middle, lastName: cell(row, 'last') || n.last, suffix: cell(row, 'suffix') || n.suffix,
      email: cell(row, 'email'), phone: cell(row, 'phone'),
      addressLine1: cell(row, 'line1'), addressLine2: cell(row, 'line2'), city: cell(row, 'city'), state: cell(row, 'state'), zip: cell(row, 'zip'),
      dob: row.record.dob ? new Date(row.record.dob) : null,
    };
  };

  const addGift = async (row: ImportRow, constituentId: string): Promise<string | null> => {
    const g = giftOf.get(row.id);
    if (!g) return null;
    const giftRef = `G${pad(nextG++, 5)}`;
    await tx.gift.create({ data: { orgId, giftRef, constituentId, giftDate: new Date(g.giftDate), amountCents: g.cents, fundId: await fundId(g.fundCode), externalRef: g.externalRef, importBatchId: batchId } });
    w.gifts++;
    return giftRef;
  };

  const survivorVersion = async (row: ImportRow, latest: ConstituentVersion, changes: FieldChange[], alts: Alternate[], aliases: Alias[], mergeEventId: string) => {
    const data = carry(latest);
    const source = sourceOf(row.id);
    const f = rowFields(row);
    for (const c of changes) {
      if (c.field === 'email') data.email = f.email;
      else if (c.field === 'phone') data.phone = f.phone;
      else if (c.field === 'dob') data.dob = f.dob;
      else Object.assign(data, { addressLine1: f.addressLine1, addressLine2: f.addressLine2, city: f.city, state: f.state, zip: f.zip });
      data.fieldMeta[c.field] = { asOf: c.asOfNew, source };
    }
    for (const a of alts) data.alternates.push({ field: a.field, value: a.value, asOf: a.asOf, source: a.why.startsWith('S2: replaced') ? ((latest.fieldMeta as FieldMeta)[a.field]?.source ?? '') : source });
    if (aliases.length) data.aliases.push({ first: f.firstName, middle: f.middleName, last: f.lastName, suffix: f.suffix, source, asOf: row.giftDate }); // one row, one spelling (S3)
    await tx.constituentVersion.create({ data: { ...data, version: latest.version + 1, mergeEventId } });
    w.versions++;
  };

  for (const d of stored.decisions) {
    const row = rowsById.get(d.rowId)!;
    const p = pending.get(d.rowId);
    if (d.decision === 'REJECT') continue;

    if (d.decision === 'MERGE' && p) {
      // D-55: the target row is itself in review; queue this row against it and write it when that row is decided
      const targetRow = rowsById.get(d.target)!;
      await tx.reviewItem.create({ data: { orgId, importBatchId: batchId, rowIndex: row.index, candidateRowIndex: targetRow.index, score: d.score ?? 0, reasons: d.reasons, flags: ['PENDING_TARGET', 'PLANNED_MERGE', ...d.flags] } });
      w.reviewItems++;
      w.pendingTargetItems++;
      w.pendingTargetRows++;
      if (giftOf.has(d.rowId)) w.giftsPending++;
      continue;
    }

    if (d.decision === 'NEW') {
      const c = await tx.constituent.create({ data: { orgId, businessId: `C${pad(nextC++, 4)}` } });
      await tx.constituentVersion.create({ data: { orgId, constituentId: c.id, version: 1, importBatchId: batchId, ...rowFields(row), fieldMeta: Object.fromEntries(META_FIELDS.map((k) => [k, { asOf: row.giftDate, source: sourceOf(row.id) }])), aliases: [], alternates: [] } });
      rowTarget.set(d.rowId, c.id);
      w.constituents++;
      w.versions++;
      await addGift(row, c.id);
      continue;
    }

    if (d.decision === 'MERGE') {
      const survivorId = resolve(d.target);
      if (!survivorId) throw new Error(`commit: ${d.rowId} merges into unknown target ${d.target}`);
      const snapshot = await loadEffectiveConstituent(tx, survivorId);
      const giftRef = await addGift(row, survivorId);
      const changes = changesOf.get(d.rowId) ?? [];
      const alts = alternatesOf.get(d.rowId) ?? [];
      const aliases = aliasesOf.get(d.rowId) ?? [];
      const merge = await tx.mergeEvent.create({
        data: {
          orgId, kind: 'ROW_INTO_CONSTITUENT', survivorId, rowIndex: row.index, importBatchId: batchId,
          survivorSnapshot: snapshot, loserSnapshot: { row },
          choices: { changes: changes.map((c) => ({ field: c.field, value: c.new, rule: c.rule })), aliases: aliases.map((a) => ({ field: 'name', value: a.alias, rule: a.rule })), alternates: alts.map((a) => ({ field: a.field, value: a.value, why: a.why })) },
          giftRefsMoved: giftRef ? [giftRef] : [], softCreditsMoved: [],
          reason: `auto-merge ${d.score}: ${d.reasons.join('+')}`,
        },
      });
      if (changes.length || alts.length || aliases.length) await survivorVersion(row, await latestVersion(tx, survivorId), changes, alts, aliases, merge.id);
      rowTarget.set(d.rowId, survivorId);
      w.mergeEvents++;
      continue;
    }

    // REVIEW: one item per candidate tied at the best score (D-35); a candidate that is itself a row in review is queued by row index (D-55)
    const tied = d.candidates.filter((c) => c.score.total === d.score);
    for (const cand of tied) {
      const cid = resolve(cand.id);
      if (cid) await tx.reviewItem.create({ data: { orgId, importBatchId: batchId, rowIndex: row.index, constituentId: cid, score: cand.score.total, reasons: cand.score.reasons, flags: cand.score.flags } });
      else {
        const candRow = rowsById.get(cand.id);
        if (!candRow) throw new Error(`commit: ${d.rowId} review candidate ${cand.id} is neither a constituent nor a row`);
        await tx.reviewItem.create({ data: { orgId, importBatchId: batchId, rowIndex: row.index, candidateRowIndex: candRow.index, score: cand.score.total, reasons: cand.score.reasons, flags: ['PENDING_TARGET', ...cand.score.flags] } });
        w.pendingTargetItems++;
      }
      w.reviewItems++;
    }
    w.reviewRows++;
    if (p) w.pendingTargetRows++;
  }
  return w;
}
