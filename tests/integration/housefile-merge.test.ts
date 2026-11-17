// Task 2.6 (brief §8 S1–S6, D-23, D-24, D-46, D-48, D-49): survivorship on the database path and the MergeEvent,
// for a row merging into a constituent and for one constituent merging into another.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { commitBatch } from '@/commit/commit';
import { loadEffectiveConstituent, loadEffectiveState } from '@/commit/db-state';
import { mergeConstituents } from '@/commit/merge';
import { previewBatch } from '@/commit/preview';
import { decideReview, listReview } from '@/commit/review';
import { seedFixtures } from '@/commit/seed';
import { loadConstituents, loadGifts } from '@/import/crm';
import { resetAuthTables } from '../helpers/auth';
import { addMember, makeOrg } from '../helpers/org';

beforeEach(resetAuthTables);
const SLOW = { timeout: 120_000 };
const enc = (s: string) => new TextEncoder().encode(s);
const CRM_HEAD = 'constituent_id,first_name,middle_name,last_name,suffix,email,phone,address_line1,address_line2,city,state,zip,dob,household_id,created_at\n';
const GIFT_HEAD = 'gift_id,constituent_id,gift_date,amount_cents,fund,campaign,appeal,gift_type,external_ref\n';
const ROW_HEAD = 'First,Last,Suffix,Email,Phone,Street,Unit,City,ST,Zip,DOB,Gift Date,Amount\n';
const MAP = { first: 'First', last: 'Last', suffix: 'Suffix', email: 'Email', phone: 'Phone', line1: 'Street', line2: 'Unit', city: 'City', state: 'ST', zip: 'Zip', dob: 'DOB', gift_date: 'Gift Date', amount: 'Amount' };

async function org(crmRows: string, giftRows = '') {
  const o = await makeOrg();
  const owner = await addMember(o.id, 'owner', 'owner@example.test');
  await seedFixtures(db, { orgId: o.id, userId: owner.id, constituents: loadConstituents(enc(CRM_HEAD + crmRows)), gifts: loadGifts(enc(GIFT_HEAD + giftRows)) });
  const run = async (rows: string, fileName = 'import_x.csv') => {
    const p = await previewBatch(db, { orgId: o.id, userId: owner.id, fileName, bytes: enc(ROW_HEAD + rows), map: MAP, asOf: '2026-10-14' });
    const c = await commitBatch(db, { batchId: p.batchId, userId: owner.id });
    expect(c.status).toBe('COMMITTED');
    return { ...p, rowsOpen: await listReview(db, { orgId: o.id, batchId: p.batchId }) };
  };
  const byBiz = async (businessId: string) => db.constituent.findUniqueOrThrow({ where: { orgId_businessId: { orgId: o.id, businessId } } });
  const effective = async (businessId: string) => (await loadEffectiveConstituent(db, (await byBiz(businessId)).id)).constituent;
  return { orgId: o.id, owner, run, byBiz, effective };
}

const ROBERT = 'C0001,Robert,,Johnson,,robert.johnson@example.com,(918) 555-0142,12 Oak St,,Tulsa,OK,74105,1961-03-09,H0001,2025-06-01\n';

describe('survivorship and MergeEvent (task 2.6)', () => {
  it('GA-02 accepted: the import spelling becomes an alias (S3), the losing email an alternate with source and asOf (S2)', SLOW, async () => {
    const t = await org(ROBERT);
    const { rowsOpen } = await t.run('Bob,Johnson,,bob.j@example.com,,12 Oak Street,,Tulsa,OK,74105,,2026-01-15,25.00\n');
    expect(rowsOpen).toHaveLength(1);
    expect(rowsOpen[0]!.items[0]).toMatchObject({ candidate: 'C0001', score: 50 });
    const r = await decideReview(db, { itemId: rowsOpen[0]!.items[0]!.id, action: 'MERGE', reason: 'GA-02 accepted', userId: t.owner.id });
    expect(r.status).toBe('DECIDED');
    const c = await t.effective('C0001');
    expect(c.firstName).toBe('Robert'); // S3: existing name wins
    expect(c.aliases).toEqual([{ first: 'Bob', middle: '', last: 'Johnson', suffix: '', source: 'import_x.csv#X-0001', asOf: '2026-01-15' }]);
    expect(c.email).toBe('bob.j@example.com'); // S2: the row's asOf (its gift date) is newer than the CRM value's
    expect(c.fieldMeta.email).toEqual({ asOf: '2026-01-15', source: 'import_x.csv#X-0001' });
    expect(c.alternates).toEqual([{ field: 'email', value: 'robert.johnson@example.com', source: 'crm', asOf: '2025-06-01' }]);
    const merge = await db.mergeEvent.findFirstOrThrow({ where: { reviewDecisionId: r.decisionId! } });
    expect(merge.choices).toMatchObject({ changes: [{ field: 'email', rule: 'S2', value: 'bob.j@example.com' }], aliases: [{ field: 'name', rule: 'S3' }] });
    expect((merge.survivorSnapshot as { constituent: { email: string } }).constituent.email).toBe('robert.johnson@example.com');
  });

  it('S2 both ways: a newer row value replaces and keeps the old as alternate; an older row value is kept as alternate only', SLOW, async () => {
    const t = await org(ROBERT);
    await t.run('Robert,Johnson,,robert.johnson@example.com,918-555-0199,12 Oak St,,Tulsa,OK,74105,,2025-01-10,10.00\nRobert,Johnson,,robert.johnson@example.com,918-555-0177,12 Oak St,,Tulsa,OK,74105,,2026-02-20,10.00\n');
    const c = await t.effective('C0001');
    expect(c.phone).toBe('918-555-0177'); // 2026-02-20 is newer than created_at 2025-06-01
    expect(c.fieldMeta.phone?.asOf).toBe('2026-02-20');
    expect(c.alternates).toEqual([
      { field: 'phone', value: '918-555-0199', source: 'import_x.csv#X-0001', asOf: '2025-01-10' }, // older than the CRM value: kept as alternate only
      { field: 'phone', value: '(918) 555-0142', source: 'crm', asOf: '2025-06-01' }, // replaced by the newer row: kept as alternate
    ]);
  });

  it('S3: suffix and DOB never change by survivorship, even on an accepted merge', SLOW, async () => {
    const t = await org("C0001,William,,O'Brien,Jr.,,405-555-0414,3101 S Oak Ln,Apt 24,Edmond,OK,73013,1980-05-05,H0001,2025-06-01\n");
    const { rowsOpen } = await t.run("William,O'Brien,,,405-555-0414,3101 South Oak Lane,#24,Edmond,OK,73013,1952-01-01,2026-03-01,50.00\n");
    expect(rowsOpen).toHaveLength(1); // SUFFIX_ONE_SIDED + DOB_DIFF: review
    const r = await decideReview(db, { itemId: rowsOpen[0]!.items[0]!.id, action: 'MERGE', reason: 'same person, file dropped the suffix', userId: t.owner.id });
    expect(r.status).toBe('DECIDED');
    const c = await t.effective('C0001');
    expect(c.suffix).toBe('Jr.');
    expect(c.dob).toBe('1980-05-05');
  });

  it('GA-09: a row that scores the same against two constituents is offered both (D-35)', SLOW, async () => {
    const t = await org("C0001,William,,O'Brien,Sr.,,405-555-0414,3101 S Oak Ln,Apt 24,Edmond,OK,73013,,H0001,2025-06-01\nC0002,William,,O'Brien,Jr.,,405-555-0414,3101 S Oak Ln,Apt 24,Edmond,OK,73013,,H0001,2025-06-02\n");
    const { rowsOpen } = await t.run("William,O'Brien,,,405-555-0414,3101 South Oak Lane,#24,Edmond,OK,73013,,2026-03-01,50.00\n");
    expect(rowsOpen).toHaveLength(1);
    expect(rowsOpen[0]!.items.map((i) => [i.candidate, i.score]).sort()).toEqual([['C0001', 65], ['C0002', 65]]);
  });

  it('S6: a row matching two existing constituents at MERGE level is never merged automatically; both pairs are queued EXISTING_PAIR', SLOW, async () => {
    const t = await org(ROBERT + 'C0002,Robert,,Johnson,,robert.johnson@example.com,(918) 555-0142,12 Oak St,,Tulsa,OK,74105,,H0002,2025-07-01\n');
    const { plan, rowsOpen, decisions } = await t.run('Robert,Johnson,,robert.johnson@example.com,,12 Oak St,,Tulsa,OK,74105,,2026-03-01,50.00\n');
    expect(decisions[0]!.decision).toBe('MERGE'); // the matcher's decision stands (oracle); the plan does not execute it
    expect(plan.totals).toMatchObject({ merged: 0, reviewed: 1 });
    expect(plan.review.map((r) => [r.target, r.flags]).sort()).toEqual([['C0001', ['EXISTING_PAIR']], ['C0002', ['EXISTING_PAIR']]]);
    expect(await db.mergeEvent.count()).toBe(0);
    expect(rowsOpen[0]!.items.map((i) => i.candidate).sort()).toEqual(['C0001', 'C0002']);
    expect(rowsOpen[0]!.items.every((i) => i.flags.includes('EXISTING_PAIR'))).toBe(true);
  });

  it('the field changes on the database equal the dry-run report\'s field changes for file A', SLOW, async () => {
    const o = await makeOrg();
    const owner = await addMember(o.id, 'owner', 'owner@example.test');
    await seedFixtures(db, { orgId: o.id, userId: owner.id, constituents: loadConstituents(new Uint8Array(readFileSync('fixtures/crm_constituents.csv'))), gifts: loadGifts(new Uint8Array(readFileSync('fixtures/crm_gifts.csv'))) });
    const p = await previewBatch(db, { orgId: o.id, userId: owner.id, fileName: 'fixtures/import_a.csv', bytes: new Uint8Array(readFileSync('fixtures/import_a.csv')), map: JSON.parse(readFileSync('import/maps/import_a.map.json', 'utf8')), asOf: '2026-10-14' });
    expect((await commitBatch(db, { batchId: p.batchId, userId: owner.id })).status).toBe('COMMITTED');
    const state = await loadEffectiveState(db, o.id);
    const byId = new Map(state.constituents.map((c) => [c.id, c]));
    const rowsById = new Map(p.file.rows.map((r) => [r.id, r]));
    // the last planned change per (constituent, field) is what the database must show
    const last = new Map<string, (typeof p.plan.changes)[number]>();
    for (const c of p.plan.changes) last.set(`${c.constituentId}:${c.field}`, c);
    expect(last.size).toBeGreaterThan(30);
    for (const c of last.values()) {
      const s = byId.get(c.constituentId)!;
      const row = rowsById.get(c.rowId)!;
      if (c.field === 'email') expect(s.email).toBe(c.new);
      else if (c.field === 'phone') expect(s.phone).toBe(c.new);
      else if (c.field === 'dob') expect(s.dob).toBe(row.record.dob);
      else expect([s.addressLine1, s.addressLine2, s.city, s.state, s.zip].filter(Boolean).join(', ')).toBe(c.new);
      expect(s.fieldMeta[c.field]?.asOf).toBe(c.asOfNew);
    }
    for (const a of p.plan.alternates) expect(byId.get(a.constituentId)!.alternates).toContainEqual(expect.objectContaining({ field: a.field, value: a.value, asOf: a.asOf }));
    expect(p.plan.totals.fieldChanges).toBeGreaterThan(0);
  });

  it('constituent into constituent (D-49): the earlier record survives S3, S1/S2 field by field, gifts move by superseding rows (D-48), loser retired, unmerge data stored (D-24)', SLOW, async () => {
    const t = await org(
      'C0001,Robert,,Johnson,,robert.johnson@example.com,,12 Oak St,,Tulsa,OK,74105,,H0001,2025-06-01\n' +
      'C0002,Bob,J,Johnson,,bob@example.com,(918) 555-0142,900 Elm Dr,,Denver,CO,80202,1961-03-09,H0002,2025-09-01\n',
      'G00001,C0001,2024-02-07,250000,BLDG,AF2024,Year-End 2024,GIFT,CHK1\nG00002,C0002,2025-10-01,5000,GEN,AF2025,Gala 2025,GIFT,\nG00003,C0002,2025-11-01,7500,GEN,AF2025,Gala 2025,GIFT,\n',
    );
    const a = await t.byBiz('C0001');
    const b = await t.byBiz('C0002');
    const before = await loadEffectiveState(db, t.orgId);
    const r = await mergeConstituents(db, { aId: b.id, bId: a.id, userId: t.owner.id, reason: 'same donor, two records' });
    expect(r.survivorId).toBe(a.id); // earlier created_at (2025-06-01) survives, whichever order the ids came in
    expect(r.loserId).toBe(b.id);
    const c = await t.effective('C0001');
    expect(c.firstName).toBe('Robert'); // S3: survivor's name; the loser's becomes an alias
    expect(c.aliases).toEqual([{ first: 'Bob', middle: 'J', last: 'Johnson', suffix: '', source: 'constituent:C0002', asOf: '2025-09-01' }]);
    expect(c.phone).toBe('(918) 555-0142'); // S1: non-empty beats empty
    expect(c.fieldMeta.phone).toEqual({ asOf: '2025-09-01', source: 'crm' });
    expect(c.email).toBe('bob@example.com'); // S2: the loser's email is newer (2025-09-01 > 2025-06-01)
    expect(c.alternates).toContainEqual({ field: 'email', value: 'robert.johnson@example.com', source: 'crm', asOf: '2025-06-01' });
    expect(c.addressLine1).toBe('900 Elm Dr'); // S2 likewise
    expect(c.dob).toBe('1961-03-09'); // S1 fills an empty DOB
    expect(c.household).toBe('H0001'); // S5: the survivor keeps its household
    const state = await loadEffectiveState(db, t.orgId);
    expect(state.constituents.map((x) => x.id)).toEqual(['C0001']); // loser retired
    expect(state.gifts.map((g) => [g.giftRef, g.constituent])).toEqual([['G00001', 'C0001'], ['G00002', 'C0001'], ['G00003', 'C0001']]);
    expect(await db.gift.count({ where: { giftRef: 'G00002' } })).toBe(2); // moved by a superseding row, same giftRef
    const merge = await db.mergeEvent.findUniqueOrThrow({ where: { id: r.mergeEventId } });
    expect(merge).toMatchObject({ kind: 'CONSTITUENT_INTO_CONSTITUENT', survivorId: a.id, loserId: b.id, giftRefsMoved: ['G00002', 'G00003'], userId: t.owner.id, reason: 'same donor, two records' });
    expect((merge.survivorSnapshot as { constituent: { email: string } }).constituent).toEqual(before.constituents.find((x) => x.id === 'C0001'));
    expect((merge.loserSnapshot as { constituent: { email: string } }).constituent).toEqual(before.constituents.find((x) => x.id === 'C0002'));
    expect(merge.choices).toMatchObject({ phone: { value: '(918) 555-0142', rule: 'S1' }, email: { value: 'bob@example.com', rule: 'S2' }, firstName: { value: 'Robert', rule: 'S3' }, dob: { value: '1961-03-09', rule: 'S1' } });
    // a second merge touching the retired record is refused
    expect((await mergeConstituents(db, { aId: a.id, bId: b.id, userId: t.owner.id, reason: 'again' })).code).toBe('MERGE_RETIRED');
  });

  it('MERGE on a pair-memory item merges the two constituents (D-59)', SLOW, async () => {
    const t = await org(ROBERT + 'C0002,Bob,,Johnson,,bob@example.com,(918) 555-0142,12 Oak St,,Tulsa,OK,74105,,H0001,2025-07-01\n');
    const p = await previewBatch(db, { orgId: t.orgId, userId: t.owner.id, fileName: 'import_x.csv', bytes: enc(ROW_HEAD), map: MAP, asOf: '2026-10-14' });
    const item = await db.reviewItem.create({ data: { orgId: t.orgId, importBatchId: p.batchId, rowIndex: 0, constituentId: (await t.byBiz('C0002')).id, score: 60, reasons: ['PHONE_EXACT'], flags: ['PAIR_MEMORY', 'MERGED_INTO:C0001'] } });
    const r = await decideReview(db, { itemId: item.id, action: 'MERGE', reason: 'same person after all', userId: t.owner.id });
    expect(r.status).toBe('DECIDED');
    const merge = await db.mergeEvent.findFirstOrThrow({ where: { reviewDecisionId: r.decisionId! } });
    expect(merge.kind).toBe('CONSTITUENT_INTO_CONSTITUENT');
    expect(merge.survivorId).toBe((await t.byBiz('C0001')).id);
    expect(r.constituentId).toBe(merge.survivorId);
  });
});
