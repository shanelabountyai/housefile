// Stage 8, Preview (brief §4, §8; D-11, D-12, D-25): the write plan Phase 2 will execute, computed from the
// batch resolution and the in-memory CRM. Nothing is written. Every number in the report comes from the lists
// below, so totals reconcile by construction: rows = merged + reviewed + new + rejected.
import { sha256Hex } from '../lib/canonical';
import type { CrmConstituent, CrmGift } from './crm';
import type { LoadedFile } from './pipeline';
import type { RowDecision } from './resolve';
import type { ImportRow } from './validate';
import { line1Key, type MatchRecord } from '../matching/types';

export type SurvivorshipRule = 'S1' | 'S2' | 'S3';
export type PlannedField = 'email' | 'phone' | 'dob' | 'address';

export type FieldChange = { constituentId: string; rowId: string; field: PlannedField; old: string; new: string; rule: SurvivorshipRule; asOfOld: string; asOfNew: string; loserKept: boolean };
export type Alternate = { constituentId: string; rowId: string; field: PlannedField; value: string; asOf: string; why: string };
export type Alias = { constituentId: string; rowId: string; alias: string; rule: 'S3' };
export type PlannedGift = { rowId: string; constituentRef: string; giftDate: string; cents: number; fund: string; externalRef: string };
export type SkippedGift = { rowId: string; reason: 'DUP_GIFT' | 'DUP_GIFT_IN_FILE'; of: string; giftDate: string; cents: number };
export type Created = { rowId: string; name: string; email: string; phone: string; address: string; dob: string; bestScore: number | null; bestReasons: string[] };
export type ReviewPair = { rowId: string; target: string; score: number; reasons: string[]; flags: string[]; tieBreak: string };
export type Rejected = { rowId: string; reason: string };

export type Preview = {
  file: { path: string; after?: string; bytes: number; contentHash: string; encoding: string; headers: string[]; map: Record<string, string>; extras: string[]; asOf: string; rows: number };
  crm: { constituents: number; gifts: number; beforeHash: string };
  totals: {
    rows: number; merged: number; reviewed: number; new: number; rejected: number;
    giftsToAdd: number; giftsPendingReview: number; dupGift: number; dupGiftInFile: number;
    dateCentsMatchedRefDiffered: number; inFileSameGiftNotSkipped: number; fieldChanges: number; alternates: number; aliases: number;
  };
  create: Created[];
  changes: FieldChange[];
  alternates: Alternate[];
  aliases: Alias[];
  gifts: PlannedGift[];
  skippedGifts: SkippedGift[];
  rejected: Rejected[];
  review: ReviewPair[];
  notImplemented: string[];
};

/** D-11: canonical JSON of every constituent (fields, minus created_at) and every gift, sorted by business id. */
export function stateHash(constituents: CrmConstituent[], gifts: CrmGift[]): string {
  const cons = constituents
    .map((c) => {
      const { created_at: _createdAt, ...fields } = c.fields;
      return { id: c.id, ...fields };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const gs = gifts.map((g) => ({ ...g })).sort((a, b) => (a.gift_id < b.gift_id ? -1 : a.gift_id > b.gift_id ? 1 : 0));
  return sha256Hex({ constituents: cons, gifts: gs });
}

const displayName = (r: MatchRecord) => [r.name.first, r.name.middle, r.name.last, r.name.suffix.toLowerCase()].filter(Boolean).join(' ');
const displayAddress = (r: MatchRecord) => [line1Key(r.addr), r.addr.unit, r.addr.city, r.addr.state, r.addr.zip5].filter(Boolean).join(', ');

type Planned = { email: string; phone: string; dob: string; address: string; asOf: Record<PlannedField, string>; raw: Record<PlannedField, string> };

export function buildPreview(file: LoadedFile, decisions: RowDecision[], crm: CrmConstituent[], crmGifts: CrmGift[], opts: { path: string; asOf: string; after?: string }): Preview {
  const byId = new Map(crm.map((c) => [c.id, c]));
  const giftsByConstituent = new Map<string, CrmGift[]>();
  for (const g of crmGifts) {
    let l = giftsByConstituent.get(g.constituent_id);
    if (!l) giftsByConstituent.set(g.constituent_id, (l = []));
    l.push(g);
  }
  const hasRef = file.map.external_ref !== undefined;

  // Planned state per existing constituent: the CRM record's values with their asOf (created_at), updated as
  // this batch's merges apply S1/S2, so a second row merging into the same target sees the first's result.
  const planned = new Map<string, Planned>();
  const plannedOf = (c: CrmConstituent): Planned => {
    let p = planned.get(c.id);
    if (!p) {
      const asOf = c.fields.created_at ?? '';
      const addrRaw = [c.fields.address_line1, c.fields.address_line2, c.fields.city, c.fields.state, c.fields.zip].filter(Boolean).join(', ');
      p = {
        email: c.record.email, phone: c.record.phone, dob: c.record.dob, address: line1Key(c.record.addr) ? displayAddress(c.record) : '',
        asOf: { email: asOf, phone: asOf, dob: asOf, address: asOf },
        raw: { email: c.fields.email ?? '', phone: c.fields.phone ?? '', dob: c.fields.dob ?? '', address: addrRaw },
      };
      planned.set(c.id, p);
    }
    return p;
  };

  const out: Preview = {
    file: {
      path: opts.path, after: opts.after, bytes: file.parsed.bytes, contentHash: file.parsed.contentHash, encoding: file.parsed.encoding, headers: file.parsed.headers,
      map: { ...(file.map as Record<string, string>) }, extras: file.extras, asOf: opts.asOf, rows: file.rows.length,
    },
    crm: { constituents: crm.length, gifts: crmGifts.length, beforeHash: stateHash(crm, crmGifts) },
    totals: { rows: file.rows.length, merged: 0, reviewed: 0, new: 0, rejected: 0, giftsToAdd: 0, giftsPendingReview: 0, dupGift: 0, dupGiftInFile: 0, dateCentsMatchedRefDiffered: 0, inFileSameGiftNotSkipped: 0, fieldChanges: 0, alternates: 0, aliases: 0 },
    create: [], changes: [], alternates: [], aliases: [], gifts: [], skippedGifts: [], rejected: [], review: [],
    notImplemented: ['FUND_UNKNOWN (import/fund-synonyms.json and the default fund are not in the reference matcher; fund text is carried raw)'],
  };

  const seenRaw = new Map<string, string>(); // raw record text → first row id (S4 byte-identical duplicates)
  const rowsById = new Map(file.rows.map((r) => [r.id, r]));

  const planGift = (row: ImportRow, constituentRef: string, decision: RowDecision) => {
    const dup = seenRaw.get(row.raw);
    if (dup !== undefined) {
      out.skippedGifts.push({ rowId: row.id, reason: 'DUP_GIFT_IN_FILE', of: dup, giftDate: row.giftDate, cents: row.cents! });
      return;
    }
    if (decision.decision === 'MERGE' && byId.has(constituentRef)) {
      for (const g of giftsByConstituent.get(constituentRef) ?? []) {
        if (g.gift_date !== row.giftDate || g.amount_cents !== row.cents) continue;
        if (!hasRef || g.external_ref === row.externalRef) {
          out.skippedGifts.push({ rowId: row.id, reason: 'DUP_GIFT', of: g.gift_id, giftDate: row.giftDate, cents: row.cents! });
          return;
        }
        out.totals.dateCentsMatchedRefDiffered++;
      }
    }
    // S4: an earlier gift planned in this batch that equals this one on constituent, date, cents and reference
    // is not skipped (only byte-identical rows are); it is counted so a person can look.
    if (out.gifts.some((g) => g.constituentRef === constituentRef && g.giftDate === row.giftDate && g.cents === row.cents && (!hasRef || g.externalRef === row.externalRef))) out.totals.inFileSameGiftNotSkipped++;
    out.gifts.push({ rowId: row.id, constituentRef, giftDate: row.giftDate, cents: row.cents!, fund: row.fund, externalRef: row.externalRef });
  };

  const change = (c: CrmConstituent, row: ImportRow, field: PlannedField, importValue: string, importRaw: string) => {
    if (!importValue) return;
    const p = plannedOf(c);
    const current = p[field];
    if (!current) {
      out.changes.push({ constituentId: c.id, rowId: row.id, field, old: p.raw[field] || '(empty)', new: importRaw, rule: 'S1', asOfOld: p.asOf[field], asOfNew: row.giftDate, loserKept: false });
      p[field] = importValue;
      p.raw[field] = importRaw;
      p.asOf[field] = row.giftDate;
      return;
    }
    if (current === importValue) return;
    if (field === 'dob') return; // S3: existing DOB wins; a conflict was already a review reason
    if (row.giftDate > p.asOf[field]) {
      out.changes.push({ constituentId: c.id, rowId: row.id, field, old: p.raw[field], new: importRaw, rule: 'S2', asOfOld: p.asOf[field], asOfNew: row.giftDate, loserKept: true });
      out.alternates.push({ constituentId: c.id, rowId: row.id, field, value: p.raw[field], asOf: p.asOf[field], why: 'S2: replaced by a newer value, kept as alternate' });
      p[field] = importValue;
      p.raw[field] = importRaw;
      p.asOf[field] = row.giftDate;
    } else {
      out.alternates.push({ constituentId: c.id, rowId: row.id, field, value: importRaw, asOf: row.giftDate, why: 'S2: not newer than the current value, kept as alternate' });
    }
  };

  for (const d of decisions) {
    const row = rowsById.get(d.rowId)!;
    const rec = row.record;
    switch (d.decision) {
      case 'REJECT':
        out.totals.rejected++;
        out.rejected.push({ rowId: d.rowId, reason: d.target });
        break;
      case 'REVIEW':
        out.totals.reviewed++;
        out.totals.giftsPendingReview++;
        out.review.push({ rowId: d.rowId, target: d.target, score: d.score ?? 0, reasons: d.reasons, flags: d.flags, tieBreak: d.tieBreak });
        break;
      case 'NEW':
        out.totals.new++;
        out.create.push({ rowId: d.rowId, name: displayName(rec), email: rec.email, phone: rec.phone, address: displayAddress(rec), dob: rec.dob, bestScore: d.candidates.length ? d.score : null, bestReasons: d.reasons });
        planGift(row, d.rowId, d);
        break;
      case 'MERGE': {
        out.totals.merged++;
        const c = byId.get(d.target);
        if (c) {
          const g = (k: keyof typeof file.map) => rowCell(file, row, k).trim();
          change(c, row, 'email', rec.email, g('email'));
          change(c, row, 'phone', rec.phone, g('phone'));
          change(c, row, 'dob', rec.dob, g('dob'));
          change(c, row, 'address', line1Key(rec.addr) ? displayAddress(rec) : '', [g('line1'), g('line2'), g('city'), g('state'), g('zip')].filter(Boolean).join(', '));
          const crmName = displayName(c.record);
          const rowName = displayName(rec);
          if (rowName && rowName !== crmName) out.aliases.push({ constituentId: c.id, rowId: row.id, alias: rowName, rule: 'S3' });
        }
        planGift(row, d.target, d);
        break;
      }
    }
    if (!row.reject && !seenRaw.has(row.raw)) seenRaw.set(row.raw, row.id);
  }
  out.totals.giftsToAdd = out.gifts.length;
  out.totals.dupGift = out.skippedGifts.filter((s) => s.reason === 'DUP_GIFT').length;
  out.totals.dupGiftInFile = out.skippedGifts.filter((s) => s.reason === 'DUP_GIFT_IN_FILE').length;
  out.totals.fieldChanges = out.changes.length;
  out.totals.alternates = out.alternates.length;
  out.totals.aliases = out.aliases.length;
  return out;
}

/** The raw cell for a mapped field (the preview shows what the file said, next to the normalized value). */
function rowCell(file: LoadedFile, row: ImportRow, field: keyof typeof file.map): string {
  const header = file.map[field];
  return header ? (file.parsed.rows[row.index]?.cells[header] ?? '') : '';
}
