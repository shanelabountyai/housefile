// The write primitives shared by commit (task 2.4) and the review actions (task 2.5): a batch context built from
// the stored ImportBatch (D-10), ids, and the three writes a row can cause: a new constituent, a row merge, a gift.
// Every write names its writer (the batch or the review decision), so undo can find it (D-14).
import type { ConstituentVersion } from '@/generated/prisma/client';
import { parseCsv, type ParsedCsv } from '../import/csv';
import type { ColumnMap, Field } from '../import/map';
import { displayName, plannedFrom, rawCellsOf, resolveFund, rowSurvivorship, type PlannedGift, type Preview, type Survivorship } from '../import/preview';
import type { RowDecision } from '../import/resolve';
import type { ImportRow } from '../import/validate';
import { latestVersion, loadEffectiveConstituent, type Tx } from './db-state';
import type { StoredMap, StoredRows } from './preview';
import { crmConstituentOf, META_FIELDS, type AliasEntry, type AlternateEntry, type FieldMeta } from './state';

export type Writer = { importBatchId: string } | { reviewDecisionId: string };
export type BatchCtx = {
  orgId: string; batchId: string; fileName: string; map: ColumnMap; parsed: ParsedCsv; hasRef: boolean;
  rows: ImportRow[]; decisions: RowDecision[]; plan: Preview;
  seq: { C: number; G: number; H: number }; funds: Map<string, string>;
};
export type GiftInput = { giftDate: string; cents: number; fundCode: string; externalRef: string };

const pad = (n: number, w: number) => String(n).padStart(w, '0');

/** Next free number for ids of the form <prefix><digits> in this org. Ids are never reused: rows are never deleted. */
export async function nextSeq(tx: Tx, table: 'Constituent' | 'Gift' | 'Household', col: 'businessId' | 'giftRef', prefix: string, orgId: string): Promise<number> {
  const [r] = await tx.$queryRawUnsafe<{ m: number | null }[]>(`SELECT max(substring("${col}" from 2)::int) AS m FROM "${table}" WHERE "orgId" = $1::uuid AND "${col}" ~ $2`, orgId, `^${prefix}[0-9]+$`);
  return (r?.m ?? 0) + 1;
}

export async function loadBatchCtx(tx: Tx, batch: { id: string; orgId: string; fileName: string; rawBytes: Uint8Array; map: unknown; rows: unknown; plan: unknown }): Promise<BatchCtx> {
  const map = (batch.map as StoredMap).fields;
  const stored = batch.rows as StoredRows;
  return {
    orgId: batch.orgId, batchId: batch.id, fileName: batch.fileName, map, parsed: parseCsv(new Uint8Array(batch.rawBytes)), hasRef: map.external_ref !== undefined,
    rows: stored.rows, decisions: stored.decisions, plan: batch.plan as unknown as Preview,
    seq: { C: await nextSeq(tx, 'Constituent', 'businessId', 'C', batch.orgId), G: await nextSeq(tx, 'Gift', 'giftRef', 'G', batch.orgId), H: await nextSeq(tx, 'Household', 'businessId', 'H', batch.orgId) },
    funds: new Map(),
  };
}

export const nextId = (ctx: BatchCtx, k: 'C' | 'G' | 'H') => `${k}${pad(ctx.seq[k]++, k === 'G' ? 5 : 4)}`;
export const sourceOf = (ctx: BatchCtx, rowId: string) => `${ctx.fileName}#${rowId}`;
export const cell = (ctx: BatchCtx, row: ImportRow, f: Field): string => {
  const h = ctx.map[f];
  return h ? (ctx.parsed.rows[row.index]?.cells[h] ?? '').trim() : '';
};

export async function fundId(tx: Tx, ctx: BatchCtx, code: string): Promise<string> {
  let id = ctx.funds.get(code);
  if (!id) ctx.funds.set(code, (id = (await tx.fund.upsert({ where: { orgId_code: { orgId: ctx.orgId, code } }, create: { orgId: ctx.orgId, code }, update: {} })).id));
  return id;
}

/** The row's own values as version columns (a NEW row, and the fields a merge takes from the row). */
export function rowFields(ctx: BatchCtx, row: ImportRow) {
  const n = row.record.name; // parsed (folded) parts stand in when the file has one full-name column
  return {
    firstName: cell(ctx, row, 'first') || n.first, middleName: cell(ctx, row, 'middle') || n.middle, lastName: cell(ctx, row, 'last') || n.last, suffix: cell(ctx, row, 'suffix') || n.suffix,
    email: cell(ctx, row, 'email'), phone: cell(ctx, row, 'phone'),
    addressLine1: cell(ctx, row, 'line1'), addressLine2: cell(ctx, row, 'line2'), city: cell(ctx, row, 'city'), state: cell(ctx, row, 'state'), zip: cell(ctx, row, 'zip'),
    dob: row.record.dob ? new Date(row.record.dob) : null,
  };
}

export async function addGift(tx: Tx, ctx: BatchCtx, g: GiftInput, constituentId: string, writer: Writer): Promise<string> {
  const giftRef = nextId(ctx, 'G');
  await tx.gift.create({ data: { orgId: ctx.orgId, giftRef, constituentId, giftDate: new Date(g.giftDate), amountCents: g.cents, fundId: await fundId(tx, ctx, g.fundCode), externalRef: g.externalRef, ...writer } });
  return giftRef;
}

/** A reviewed row's gift (its plan entry, if commit planned one, else from the row): null when held (D-57) or a
 *  duplicate of the target's active gift (S4, D-25). */
export async function giftForRow(tx: Tx, ctx: BatchCtx, row: ImportRow, targetId: string | null): Promise<{ gift: GiftInput | null; skipped: 'DUP_GIFT' | 'HELD' | null }> {
  const planned: PlannedGift | undefined = ctx.plan.gifts.find((g) => g.rowId === row.id);
  if (planned) return { gift: { giftDate: planned.giftDate, cents: planned.cents, fundCode: planned.fundCode, externalRef: planned.externalRef }, skipped: null };
  if (row.cents === null || row.cents <= 0) return { gift: null, skipped: 'HELD' };
  if (targetId) {
    const dup = await tx.gift.findFirst({ where: { constituentId: targetId, status: 'ACTIVE', supersededBy: null, giftDate: new Date(row.giftDate), amountCents: row.cents, ...(ctx.hasRef ? { externalRef: row.externalRef } : {}) } });
    if (dup) return { gift: null, skipped: 'DUP_GIFT' };
  }
  return { gift: { giftDate: row.giftDate, cents: row.cents, fundCode: resolveFund(row.fund).code, externalRef: row.externalRef }, skipped: null };
}

/** A new constituent from the row: version 1 (writer = batch or decision) and, when given, its gift. Returns the constituent id. */
export async function writeNewConstituent(tx: Tx, ctx: BatchCtx, row: ImportRow, writer: Writer, gift: GiftInput | null, householdId: string | null = null): Promise<string> {
  const c = await tx.constituent.create({ data: { orgId: ctx.orgId, businessId: nextId(ctx, 'C') } });
  await tx.constituentVersion.create({
    data: { orgId: ctx.orgId, constituentId: c.id, version: 1, ...writer, ...rowFields(ctx, row), householdId, fieldMeta: Object.fromEntries(META_FIELDS.map((k) => [k, { asOf: row.giftDate, source: sourceOf(ctx, row.id) }])), aliases: [], alternates: [] },
  });
  if (gift) await addGift(tx, ctx, gift, c.id, writer);
  return c.id;
}

/** The version columns worth carrying from one version to the next. */
export function carry(v: ConstituentVersion) {
  return {
    orgId: v.orgId, constituentId: v.constituentId, status: v.status,
    firstName: v.firstName, middleName: v.middleName, lastName: v.lastName, suffix: v.suffix,
    email: v.email, phone: v.phone, addressLine1: v.addressLine1, addressLine2: v.addressLine2, city: v.city, state: v.state, zip: v.zip,
    dob: v.dob, householdId: v.householdId,
    fieldMeta: { ...(v.fieldMeta as FieldMeta) }, aliases: [...(v.aliases as AliasEntry[])], alternates: [...(v.alternates as AlternateEntry[])],
  };
}

/** The survivor's next version with the row's S1/S2 values, alternates and S3 alias applied; writer = the merge event. */
async function survivorVersion(tx: Tx, ctx: BatchCtx, row: ImportRow, latest: ConstituentVersion, sv: Survivorship, mergeEventId: string) {
  const data = carry(latest);
  const source = sourceOf(ctx, row.id);
  const f = rowFields(ctx, row);
  for (const c of sv.changes) {
    if (c.field === 'email') data.email = f.email;
    else if (c.field === 'phone') data.phone = f.phone;
    else if (c.field === 'dob') data.dob = f.dob;
    else Object.assign(data, { addressLine1: f.addressLine1, addressLine2: f.addressLine2, city: f.city, state: f.state, zip: f.zip });
    data.fieldMeta[c.field] = { asOf: c.asOfNew, source };
  }
  for (const a of sv.alternates) data.alternates.push({ field: a.field, value: a.value, asOf: a.asOf, source: a.why.startsWith('S2: replaced') ? ((latest.fieldMeta as FieldMeta)[a.field]?.source ?? '') : source });
  if (sv.aliases.length) data.aliases.push({ first: f.firstName, middle: f.middleName, last: f.lastName, suffix: f.suffix, source, asOf: row.giftDate }); // one row, one spelling (S3)
  await tx.constituentVersion.create({ data: { ...data, version: latest.version + 1, mergeEventId } });
}

/** A row merged into a constituent (D-46 ROW_INTO_CONSTITUENT): snapshot, gift, MergeEvent, then the survivorship
 *  version when anything changed. `planned` is the commit plan's survivorship for the row; absent (a reviewed MERGE),
 *  S1–S3 are computed against the survivor's current state. */
export async function writeRowMerge(tx: Tx, ctx: BatchCtx, row: ImportRow, survivorId: string, writer: Writer, reason: string, gift: GiftInput | null, planned?: Survivorship): Promise<{ mergeEventId: string; giftRef: string | null; versionWritten: boolean }> {
  const snapshot = await loadEffectiveConstituent(tx, survivorId);
  let sv = planned;
  if (!sv) {
    const c = crmConstituentOf(snapshot.constituent);
    sv = rowSurvivorship({ id: c.id, planned: plannedFrom(c), name: displayName(c.record) }, row, rawCellsOf(ctx.map, ctx.parsed, row));
  }
  const giftRef = gift ? await addGift(tx, ctx, gift, survivorId, writer) : null;
  const merge = await tx.mergeEvent.create({
    data: {
      orgId: ctx.orgId, kind: 'ROW_INTO_CONSTITUENT', survivorId, rowIndex: row.index, ...writer,
      survivorSnapshot: snapshot, loserSnapshot: { row },
      choices: { changes: sv.changes.map((c) => ({ field: c.field, value: c.new, rule: c.rule })), aliases: sv.aliases.map((a) => ({ field: 'name', value: a.alias, rule: a.rule })), alternates: sv.alternates.map((a) => ({ field: a.field, value: a.value, why: a.why })) },
      giftRefsMoved: giftRef ? [giftRef] : [], softCreditsMoved: [], reason,
    },
  });
  const versionWritten = sv.changes.length > 0 || sv.alternates.length > 0 || sv.aliases.length > 0;
  if (versionWritten) await survivorVersion(tx, ctx, row, await latestVersion(tx, survivorId), sv, merge.id);
  return { mergeEventId: merge.id, giftRef, versionWritten };
}
