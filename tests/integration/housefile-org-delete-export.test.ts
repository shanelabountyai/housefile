// D-104 (2026-11-17, review should-fix on PR #5): an org holding housefile data can be deleted by the template's
// deleteOrg, every housefile row of that org goes with it and no other org's row does; the per-org data export
// carries every housefile table, that org's rows only. Written before the fix: on the merge commit 304a290 the
// delete is refused by the Restrict foreign keys (D-52) and the export lacks all 19 tables.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { exportTables } from '@/app/export-hooks';
import { beforeOrgDelete } from '@/app/org-hooks';
import { db } from '@/core/db';
import { deleteOrg } from '@/core/tenancy/delete';
import { buildExport, requestExport } from '@/core/tenancy/export';
import { definitionHash } from '@/segments/segment';
import { resetAuthTables } from '../helpers/auth';
import { actAs, addMember, makeOrg } from '../helpers/org';

beforeEach(resetAuthTables);

/** Every housefile model, with its table name. A new model with an orgId must be added here and to export-hooks. */
const HOUSEFILE_TABLES = [
  'Constituent', 'Household', 'ConstituentVersion', 'Fund', 'Campaign', 'Appeal', 'Gift', 'Pledge', 'SoftCredit',
  'ImportBatch', 'ImportBatchEvent', 'ReviewItem', 'ReviewDecision', 'PairMemory', 'MergeEvent', 'UnmergeEvent',
  'SegmentDefinition', 'SegmentRun', 'Letter',
] as const;

/** One row (at least) in every housefile table for `orgId`, including superseding chains, so every FK is exercised. */
async function seedEveryTable(orgId: string, userId: string, tag: string) {
  const c = await db.constituent.create({ data: { orgId, businessId: `C${tag}1` } });
  const c2 = await db.constituent.create({ data: { orgId, businessId: `C${tag}2` } });
  const hh = await db.household.create({ data: { orgId, businessId: `H${tag}1` } });
  const fund = await db.fund.create({ data: { orgId, code: `GEN${tag}` } });
  const campaign = await db.campaign.create({ data: { orgId, code: `AF${tag}` } });
  const appeal = await db.appeal.create({ data: { orgId, campaignId: campaign.id, name: `Year-End ${tag}` } });
  const batch = await db.importBatch.create({
    data: { orgId, fileName: `${tag}.csv`, rawBytes: Buffer.from('x'), contentHash: 'h', encoding: 'utf-8', asOf: new Date('2026-10-01'), map: {}, rows: [], plan: {}, planHash: 'p', beforeHash: 'b' },
  });
  await db.importBatchEvent.create({ data: { orgId, importBatchId: batch.id, kind: 'COMMITTED' } });
  await db.constituentVersion.create({ data: { orgId, constituentId: c.id, version: 1, firstName: `Name ${tag}`, householdId: hh.id, importBatchId: batch.id } });
  const gift = await db.gift.create({ data: { orgId, giftRef: `G${tag}1`, constituentId: c.id, giftDate: new Date('2024-02-07'), amountCents: 250000, fundId: fund.id, appealId: appeal.id, importBatchId: batch.id } });
  const item = await db.reviewItem.create({ data: { orgId, importBatchId: batch.id, rowIndex: 3, constituentId: c.id, score: 55, reasons: [], flags: [] } });
  const decision = await db.reviewDecision.create({ data: { orgId, reviewItemId: item.id, action: 'KEEP_SEPARATE', reason: 'different people', userId } });
  await db.pairMemory.create({ data: { orgId, aId: c.id < c2.id ? c.id : c2.id, bId: c.id < c2.id ? c2.id : c.id, reviewDecisionId: decision.id } });
  const merge = await db.mergeEvent.create({
    data: { orgId, kind: 'CONSTITUENT_INTO_CONSTITUENT', survivorId: c.id, loserId: c2.id, survivorSnapshot: {}, loserSnapshot: {}, choices: {}, giftRefsMoved: [], softCreditsMoved: [], importBatchId: batch.id },
  });
  await db.unmergeEvent.create({ data: { orgId, mergeEventId: merge.id, survivorHash: 'h', loserHash: 'h', userId } });
  // superseding rows: the self-referencing FKs and the writer FKs (mergeEvent, reviewDecision) are all populated
  await db.gift.create({ data: { orgId, giftRef: `G${tag}1`, constituentId: c2.id, giftDate: new Date('2024-02-07'), amountCents: 250000, fundId: fund.id, supersedesGiftId: gift.id, reason: 'moved', mergeEventId: merge.id } });
  await db.constituentVersion.create({ data: { orgId, constituentId: c2.id, version: 1, firstName: `Other ${tag}`, reviewDecisionId: decision.id } });
  const pledge = await db.pledge.create({ data: { orgId, pledgeRef: `PL${tag}1`, constituentId: c.id, pledgeDate: new Date('2024-01-01'), totalCents: 1200, schedule: [{ due: '2024-06-01', cents: 1200 }], fundId: fund.id, appealId: appeal.id, userId } });
  await db.pledge.create({ data: { orgId, pledgeRef: `PL${tag}1`, constituentId: c2.id, pledgeDate: new Date('2024-01-01'), totalCents: 1200, schedule: [{ due: '2024-06-01', cents: 1200 }], fundId: fund.id, supersedesPledgeId: pledge.id, reason: 'moved', mergeEventId: merge.id } });
  const sc = await db.softCredit.create({ data: { orgId, softCreditRef: `SC${tag}1`, giftRef: `G${tag}1`, constituentId: c.id, role: 'SPOUSE', amountCents: 500, userId } });
  await db.softCredit.create({ data: { orgId, softCreditRef: `SC${tag}1`, giftRef: `G${tag}1`, constituentId: c2.id, role: 'SPOUSE', amountCents: 500, supersedesSoftCreditId: sc.id, reason: 'moved', mergeEventId: merge.id } });
  const definition = { name: `Seg ${tag}`, description: '', filters: [{ field: 'isHousehold', op: 'isTrue' }] };
  const seg = await db.segmentDefinition.create({ data: { orgId, key: `seg-${tag}`, version: 1, definition, definitionHash: definitionHash(definition), userId } });
  await db.segmentRun.create({ data: { orgId, definitionId: seg.id, asOf: new Date('2026-10-14'), count: 1, members: [`C${tag}1`], definitionHash: seg.definitionHash, memberListHash: 'm', userId } });
  await db.letter.create({ data: { orgId, letterRef: `L${tag}1`, constituentId: c.id, totalCents: 250000, asOf: new Date('2026-10-14'), subject: 's', body: `Dear ${tag}`, giftRefs: [`G${tag}1`], giftIds: [gift.id], userId } });
  await db.letter.create({ data: { orgId, letterRef: `L${tag}2`, householdId: hh.id, totalCents: 250000, asOf: new Date('2026-10-14'), subject: 's', body: `Dear household ${tag}`, giftRefs: [`G${tag}1`], giftIds: [gift.id], userId } });
}

async function countsFor(orgId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of HOUSEFILE_TABLES) out[t] = (await db.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${t}" WHERE "orgId" = $1::uuid`, orgId))[0]!.n;
  return out;
}

async function twoOrgs() {
  const acme = await makeOrg('acme');
  const owner = await addMember(acme.id, 'owner', 'owner@acme.test');
  await seedEveryTable(acme.id, owner.id, 'A');
  const globex = await makeOrg('globex');
  const gOwner = await addMember(globex.id, 'owner', 'owner@globex.test');
  await seedEveryTable(globex.id, gOwner.id, 'B');
  return { acme, owner, globex };
}

describe('org delete with housefile data (D-104)', () => {
  it('the seed fills every housefile table in both orgs', async () => {
    const { acme, globex } = await twoOrgs();
    for (const id of [acme.id, globex.id]) for (const [t, n] of Object.entries(await countsFor(id))) expect(n, t).toBeGreaterThan(0);
  });

  it('deleteOrg removes the org and every one of its housefile rows; the other org is untouched', async () => {
    const { acme, owner, globex } = await twoOrgs();
    const before = await countsFor(globex.id);
    const ctx = await actAs(owner.id, acme.slug);
    await deleteOrg(ctx, acme.slug, beforeOrgDelete);
    expect(await db.org.count({ where: { id: acme.id } })).toBe(0);
    expect(Object.values(await countsFor(acme.id)).every((n) => n === 0), JSON.stringify(await countsFor(acme.id))).toBe(true);
    expect(await countsFor(globex.id)).toEqual(before);
    expect(await db.auditEvent.count({ where: { action: 'org.deleted', orgId: acme.id } })).toBe(1);
  });

  it('while the org exists, the append-only tables still refuse UPDATE and DELETE (D-6, D-46, D-47 unchanged)', async () => {
    const { acme } = await twoOrgs();
    for (const t of ['ConstituentVersion', 'Gift', 'ImportBatch', 'ImportBatchEvent', 'ReviewDecision', 'MergeEvent', 'UnmergeEvent', 'Pledge', 'SoftCredit', 'SegmentDefinition', 'SegmentRun', 'Letter']) {
      await expect(db.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "orgId" = $1::uuid`, acme.id), t).rejects.toThrow(`${t} is append-only`);
      await expect(db.$executeRawUnsafe(`UPDATE "${t}" SET "orgId" = "orgId" WHERE "orgId" = $1::uuid`, acme.id), t).rejects.toThrow(`${t} is append-only`);
    }
    expect(Object.values(await countsFor(acme.id)).every((n) => n > 0)).toBe(true);
  });

  it('deleting a constituent that history points at is still refused (no cascade inside the org)', async () => {
    const { acme } = await twoOrgs();
    const c = await db.constituent.findUniqueOrThrow({ where: { orgId_businessId: { orgId: acme.id, businessId: 'CA1' } } });
    await expect(db.constituent.delete({ where: { id: c.id } })).rejects.toThrow();
    expect(await db.constituent.count({ where: { id: c.id } })).toBe(1);
  });
});

function unpack(archive: Uint8Array): Record<string, string> {
  const file = join(mkdtempSync(join(tmpdir(), 'hf-export-')), 'export.zip');
  writeFileSync(file, archive);
  execFileSync('unzip', ['-tq', file]);
  const names = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' }).trim().split('\n');
  return Object.fromEntries(names.map((n) => [n, execFileSync('unzip', ['-p', file, n], { encoding: 'utf8' })]));
}

describe('org export with housefile data (D-104)', () => {
  it('holds one file per housefile table, with exactly that org\'s rows and none of the other org\'s', async () => {
    const { acme, owner } = await twoOrgs();
    const ctx = await actAs(owner.id, acme.slug);
    const id = await requestExport(ctx);
    expect(await buildExport(ctx, id, exportTables)).toBe('ready');
    const files = unpack((await db.orgExport.findUniqueOrThrow({ where: { id } })).archive!);
    const manifest = JSON.parse(files['manifest.json']!) as { tables: { name: string; rows: number }[] };
    const counts = await countsFor(acme.id);
    for (const t of HOUSEFILE_TABLES) {
      const listed = manifest.tables.find((m) => m.name === t);
      expect(listed, `${t} missing from the export`).toBeDefined();
      expect(listed!.rows, t).toBe(counts[t]);
      const lines = files[`${t}.jsonl`]!.split('\n').filter(Boolean).map((l) => JSON.parse(l) as { orgId?: string });
      expect(lines.every((r) => r.orgId === acme.id), t).toBe(true);
    }
    const all = Object.values(files).join('');
    expect(all).not.toContain('Dear B'); // the other org's letter
    expect(all).not.toContain('CB1');
    expect(all).toContain('Dear household A');
  });

  it('leaves out the raw upload bytes and keeps the parsed rows and content hash (D-104)', async () => {
    const { acme, owner } = await twoOrgs();
    const ctx = await actAs(owner.id, acme.slug);
    const id = await requestExport(ctx);
    await buildExport(ctx, id, exportTables);
    const files = unpack((await db.orgExport.findUniqueOrThrow({ where: { id } })).archive!);
    const [batch] = files['ImportBatch.jsonl']!.split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(batch).not.toHaveProperty('rawBytes');
    expect(batch).toMatchObject({ fileName: 'A.csv', contentHash: 'h', planHash: 'p', beforeHash: 'b' });
  });
});
