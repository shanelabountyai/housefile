// Task 2.5 (D-22, D-14, D-55, D-59): the four review actions on the database, audited, permission-checked,
// with KEEP_SEPARATE remembered as pair memory and rows waiting on a reviewed row following it.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { commitBatch } from '@/commit/commit';
import { previewBatch } from '@/commit/preview';
import { batchStatus, decideReview, listReview, type ReviewRowView } from '@/commit/review';
import { seedFixtures } from '@/commit/seed';
import { loadConstituents, loadGifts } from '@/import/crm';
import { parseCsv } from '@/import/csv';
import { addMember } from '../helpers/org';
import { resetAuthTables } from '../helpers/auth';
import { makeOrg } from '../helpers/org';

beforeEach(resetAuthTables);
const SLOW = { timeout: 120_000 };

const bytes = (p: string) => new Uint8Array(readFileSync(p));
const crm = loadConstituents(bytes('fixtures/crm_constituents.csv'));
const gifts = loadGifts(bytes('fixtures/crm_gifts.csv'));
const MAP_A = JSON.parse(readFileSync('import/maps/import_a.map.json', 'utf8'));
const csvField = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Seed, preview A, commit A; an owner, an admin, a member and a scorekeeper in the org. */
async function committedA() {
  const org = await makeOrg();
  const owner = await addMember(org.id, 'owner', 'owner@example.test');
  const admin = await addMember(org.id, 'admin', 'admin@example.test');
  const member = await addMember(org.id, 'member', 'member@example.test');
  const keeper = await addMember(org.id, 'scorekeeper', 'keeper@example.test');
  await seedFixtures(db, { orgId: org.id, userId: owner.id, constituents: crm, gifts });
  const p = await previewBatch(db, { orgId: org.id, userId: owner.id, fileName: 'fixtures/import_a.csv', bytes: bytes('fixtures/import_a.csv'), map: MAP_A, asOf: '2026-10-14' });
  const c = await commitBatch(db, { batchId: p.batchId, userId: owner.id });
  expect(c.status).toBe('COMMITTED');
  const rows = await listReview(db, { orgId: org.id, batchId: p.batchId });
  return { orgId: org.id, batchId: p.batchId, owner, admin, member, keeper, rows, preview: p };
}

/** Open rows whose best item names a constituent (not a pending row). */
const withConstituent = (rows: ReviewRowView[]) => rows.filter((r) => r.items.every((i) => i.constituentId));

describe('review actions (task 2.5)', () => {
  it('MERGE and KEEP_SEPARATE need a reason; a member may not decide; nothing is written on a refusal', SLOW, async () => {
    const { rows, owner, member, keeper } = await committedA();
    const item = withConstituent(rows)[0]!.items[0]!;
    const before = await db.reviewDecision.count();
    expect((await decideReview(db, { itemId: item.id, action: 'MERGE', userId: owner.id })).code).toBe('REASON_REQUIRED');
    expect((await decideReview(db, { itemId: item.id, action: 'KEEP_SEPARATE', reason: '  ', userId: owner.id })).code).toBe('REASON_REQUIRED');
    expect((await decideReview(db, { itemId: item.id, action: 'DEFER', userId: member.id })).code).toBe('FORBIDDEN');
    expect(await db.reviewDecision.count()).toBe(before);
    expect((await decideReview(db, { itemId: item.id, action: 'DEFER', userId: keeper.id })).status).toBe('DECIDED'); // results.write
  });

  it('MERGE writes as commit would have: MergeEvent, survivorship version, gift, audit; the row closes', SLOW, async () => {
    const { orgId, batchId, rows, owner } = await committedA();
    const row = withConstituent(rows)[0]!;
    const item = row.items[0]!;
    const giftsBefore = await db.gift.count({ where: { constituentId: item.constituentId! } });
    const r = await decideReview(db, { itemId: item.id, action: 'MERGE', reason: 'same person, moved', userId: owner.id });
    expect(r.status).toBe('DECIDED');
    expect(r.constituentId).toBe(item.constituentId);
    const decision = await db.reviewDecision.findUniqueOrThrow({ where: { id: r.decisionId! } });
    expect(decision).toMatchObject({ action: 'MERGE', reason: 'same person, moved', userId: owner.id });
    const merge = await db.mergeEvent.findFirstOrThrow({ where: { reviewDecisionId: decision.id } });
    expect(merge).toMatchObject({ kind: 'ROW_INTO_CONSTITUENT', survivorId: item.constituentId, rowIndex: row.rowIndex });
    expect(await db.gift.count({ where: { constituentId: item.constituentId!, reviewDecisionId: decision.id } })).toBe(1);
    const after = await db.gift.count({ where: { constituentId: item.constituentId! } });
    expect(after).toBeGreaterThanOrEqual(giftsBefore + 1); // rows waiting on this one followed it (D-55); a follower's gift may be a DUP_GIFT
    expect(after).toBeLessThanOrEqual(giftsBefore + 1 + r.followed!);
    expect(await db.auditEvent.findFirst({ where: { action: 'review.decide', targetId: item.id } })).toMatchObject({ actorUserId: owner.id, orgId });
    const open = await listReview(db, { orgId, batchId });
    expect(open.some((x) => x.rowIndex === row.rowIndex)).toBe(false);
    expect(open.length).toBe(rows.length - 1 - r.followed!); // followers' rows close with the row they followed (D-55)
    // a sibling item of a decided row cannot be decided again
    if (row.items.length > 1) expect((await decideReview(db, { itemId: row.items[1]!.id, action: 'DEFER', userId: owner.id })).code).toBe('ROW_DECIDED');
    expect((await decideReview(db, { itemId: item.id, action: 'DEFER', userId: owner.id })).code).toBe('ROW_DECIDED');
  });

  it('KEEP_SEPARATE creates the row as a new constituent with its gift and records pair memory', SLOW, async () => {
    const { rows, owner, orgId } = await committedA();
    const row = withConstituent(rows)[1]!;
    const item = row.items[0]!;
    const r = await decideReview(db, { itemId: item.id, action: 'KEEP_SEPARATE', reason: 'spouses', userId: owner.id });
    expect(r.status).toBe('DECIDED');
    const created = await db.constituent.findUniqueOrThrow({ where: { id: r.constituentId! } });
    expect(created.businessId).toMatch(/^C\d{4}$/);
    const v = await db.constituentVersion.findFirstOrThrow({ where: { constituentId: created.id } });
    expect(v).toMatchObject({ version: 1, reviewDecisionId: r.decisionId });
    expect(await db.gift.count({ where: { constituentId: created.id, reviewDecisionId: r.decisionId! } })).toBe(1);
    const [a, b] = [created.id, item.constituentId!].sort();
    const memory = await db.pairMemory.findUniqueOrThrow({ where: { orgId_aId_bId: { orgId, aId: a!, bId: b! } } });
    expect(memory.agreed).toEqual(item.reasons);
    expect(memory.reviewDecisionId).toBe(r.decisionId);
  });

  it('SAME_HOUSEHOLD creates the constituent linked to the target household, creating one if needed (S5)', SLOW, async () => {
    const { rows, owner } = await committedA();
    const [rowA, rowB] = [withConstituent(rows)[2]!, withConstituent(rows)[3]!];
    // target with a household already
    const itemA = rowA.items[0]!;
    const rA = await decideReview(db, { itemId: itemA.id, action: 'SAME_HOUSEHOLD', userId: owner.id });
    expect(rA.status).toBe('DECIDED');
    const targetV = await db.constituentVersion.findFirstOrThrow({ where: { constituentId: itemA.constituentId! }, orderBy: { version: 'desc' } });
    const newV = await db.constituentVersion.findFirstOrThrow({ where: { constituentId: rA.constituentId! } });
    expect(targetV.householdId).not.toBeNull();
    expect(newV.householdId).toBe(targetV.householdId);
    // target without a household: one is created and both are linked by versions written by the decision
    const itemB = rowB.items[0]!;
    const tv = await db.constituentVersion.findFirstOrThrow({ where: { constituentId: itemB.constituentId! }, orderBy: { version: 'desc' } });
    await db.constituentVersion.create({ data: { ...tv, id: undefined, createdAt: undefined, fieldMeta: tv.fieldMeta ?? {}, aliases: tv.aliases ?? [], alternates: tv.alternates ?? [], version: tv.version + 1, householdId: null, importBatchId: null, mergeEventId: null, reviewDecisionId: null, userId: owner.id } });
    const households = await db.household.count();
    const rB = await decideReview(db, { itemId: itemB.id, action: 'SAME_HOUSEHOLD', userId: owner.id });
    expect(rB.status).toBe('DECIDED');
    expect(await db.household.count()).toBe(households + 1);
    const tv2 = await db.constituentVersion.findFirstOrThrow({ where: { constituentId: itemB.constituentId! }, orderBy: { version: 'desc' } });
    const nv = await db.constituentVersion.findFirstOrThrow({ where: { constituentId: rB.constituentId! } });
    expect(tv2.reviewDecisionId).toBe(rB.decisionId);
    expect(tv2.householdId).not.toBeNull();
    expect(nv.householdId).toBe(tv2.householdId);
  });

  it('DEFER leaves the row open; the batch is COMPLETE only when no row is open', SLOW, async () => {
    const { orgId, batchId, rows, owner } = await committedA();
    expect(await batchStatus(db, batchId)).toBe('COMMITTED');
    const item = withConstituent(rows)[0]!.items[0]!;
    const r = await decideReview(db, { itemId: item.id, action: 'DEFER', userId: owner.id });
    expect(r.status).toBe('DECIDED');
    expect((await listReview(db, { orgId, batchId })).length).toBe(rows.length);
    expect(await batchStatus(db, batchId)).toBe('COMMITTED');
  });

  it('D-55: rows waiting on a reviewed row follow it; a review against a pending row waits for it', SLOW, async () => {
    const { orgId, batchId, rows, owner } = await committedA();
    // A-0001 (row index 0) is in review and has planned auto-merges waiting on it (A-0195, A-0278, ...)
    const target = rows.find((r) => r.rowIndex === 0)!;
    const followers = await db.reviewItem.findMany({ where: { importBatchId: batchId, candidateRowIndex: 0, flags: { has: 'PLANNED_MERGE' } } });
    expect(followers.length).toBeGreaterThan(0);
    const waiting = rows.find((r) => r.items.some((i) => i.candidateRowIndex === 0 && !i.flags.includes('PLANNED_MERGE')));
    const r = await decideReview(db, { itemId: target.items[0]!.id, action: 'KEEP_SEPARATE', reason: 'different person', userId: owner.id });
    expect(r.status).toBe('DECIDED');
    expect(r.followed).toBe(followers.length);
    expect(await db.mergeEvent.count({ where: { survivorId: r.constituentId!, rowIndex: { in: followers.map((f) => f.rowIndex) } } })).toBe(followers.length);
    const open = await listReview(db, { orgId, batchId });
    expect(open.some((x) => followers.some((f) => f.rowIndex === x.rowIndex))).toBe(false);
    if (waiting) {
      const w = open.find((x) => x.rowIndex === waiting.rowIndex)!;
      expect(w.items.find((i) => i.candidateRowIndex === 0)!.constituentId).toBe(r.constituentId); // resolved through the decision
    }
    // a review item whose candidate row is still undecided cannot be decided yet
    const pendingItem = await db.reviewItem.findFirst({ where: { importBatchId: batchId, candidateRowIndex: { not: null, notIn: [0] }, flags: { has: 'PENDING_TARGET' } }, orderBy: { rowIndex: 'asc' } });
    if (pendingItem) expect((await decideReview(db, { itemId: pendingItem.id, action: 'MERGE', reason: 'x', userId: owner.id })).code).toBe('CANDIDATE_PENDING');
  });

  it('pair memory: the same row again is not queued; a row with a newly agreeing phone is', SLOW, async () => {
    const { orgId, rows, owner, preview } = await committedA();
    // a pair where the row has no phone and the target has one
    const parsed = parseCsv(bytes('fixtures/import_a.csv'));
    const state = await db.constituentVersion.findMany({ where: { orgId, version: 1 }, include: { constituent: true } });
    const phoneOf = new Map(state.map((v) => [v.constituent.id, v.phone]));
    const pick = withConstituent(rows).find((r) => !parsed.rows[r.rowIndex]!.cells[MAP_A.phone] && phoneOf.get(r.items[0]!.constituentId!));
    expect(pick).toBeTruthy();
    const item = pick!.items[0]!;
    const r = await decideReview(db, { itemId: item.id, action: 'KEEP_SEPARATE', reason: 'spouses', userId: owner.id });
    expect(r.status).toBe('DECIDED');
    const created = await db.constituent.findUniqueOrThrow({ where: { id: r.constituentId! } });
    const target = await db.constituent.findUniqueOrThrow({ where: { id: item.constituentId! } });

    const cells = { ...parsed.rows[pick!.rowIndex]!.cells };
    const line = (c: Record<string, string>) => parsed.headers.map((h) => csvField(c[h] ?? '')).join(',');
    const again = new TextEncoder().encode([parsed.headers.map(csvField).join(','), line(cells)].join('\n') + '\n');
    const withPhone = new TextEncoder().encode([parsed.headers.map(csvField).join(','), line({ ...cells, [MAP_A.phone]: phoneOf.get(target.id)! })].join('\n') + '\n');

    const p1 = await previewBatch(db, { orgId, userId: owner.id, fileName: 'again.csv', bytes: again, map: MAP_A, asOf: '2026-10-14' });
    expect(p1.decisions[0]).toMatchObject({ decision: 'MERGE', target: created.businessId });
    expect(p1.plan.memoryQueue).toEqual([]);

    const p2 = await previewBatch(db, { orgId, userId: owner.id, fileName: 'phone.csv', bytes: withPhone, map: MAP_A, asOf: '2026-10-14' });
    expect(p2.decisions[0]!.decision).toBe('MERGE');
    const tCand = p2.decisions[0]!.candidates.find((c) => c.id === target.businessId)!;
    expect(tCand.score.reasons).toContain('PHONE_EXACT');
    const c2 = await commitBatch(db, { batchId: p2.batchId, userId: owner.id });
    expect(c2.status).toBe('COMMITTED');
    const queued = await db.reviewItem.findMany({ where: { importBatchId: p2.batchId } });
    if (tCand.score.decision === 'MERGE') {
      // the phone lifts the remembered pair to MERGE level against both: S6 review, the remembered side flagged with what newly agreed
      expect(p2.plan.totals).toMatchObject({ merged: 0, reviewed: 1, memoryQueued: 0 });
      expect(p2.plan.review.map((r) => r.target).sort()).toEqual([created.businessId, target.businessId].sort());
      expect(p2.plan.review.find((r) => r.target === target.businessId)!.flags).toEqual(expect.arrayContaining(['EXISTING_PAIR', 'PAIR_MEMORY', 'NEWLY_AGREED:PHONE_EXACT']));
      expect(queued).toHaveLength(2);
      expect(queued.find((q) => q.constituentId === target.id)!.flags).toContain('PAIR_MEMORY');
    } else {
      // the row still merges into the constituent it matches; the remembered pair is re-queued because the phone newly agrees
      expect(p2.decisions[0]!.target).toBe(created.businessId);
      expect(p2.plan.memoryQueue).toHaveLength(1);
      expect(p2.plan.memoryQueue[0]).toMatchObject({ rowId: 'R-0001', target: target.businessId, mergedInto: created.businessId, agreedBefore: item.reasons });
      expect(p2.plan.memoryQueue[0]!.newlyAgreed).toContain('PHONE_EXACT');
      expect(queued).toHaveLength(1);
      expect(queued[0]).toMatchObject({ constituentId: target.id, rowIndex: 0 });
      expect(queued[0]!.flags).toContain('PAIR_MEMORY');
    }
    expect(preview.batchId).toBeTruthy();
  });
});
