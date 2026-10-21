// Task 2.5 (D-22, D-14, D-55, D-59): the review queue on the database. Open is derived at the ROW level: a row of a
// batch is open while none of its items carries a decision other than DEFER (a row has one item per tied candidate,
// D-35, and one decision settles the row). A batch is COMPLETE when no row is open. Permission: results.write.
import type { PrismaClient, ReviewAction, ReviewItem } from '@/generated/prisma/client';
import { audit } from '@/core/audit';
import { can } from '@/core/authz/permissions';
import type { Tx } from './db-state';
import { giftForRow, loadBatchCtx, nextId, writeNewConstituent, writeRowMerge, carry, type BatchCtx } from './write';
import { latestVersion } from './db-state';
import { mergeConstituentsTx } from './merge';
import { displayAddress, displayName } from '../import/preview';
import type { ImportRow } from '../import/validate';
import type { StoredRows } from './preview';

export type RefusalCode = 'NOT_FOUND' | 'FORBIDDEN' | 'REASON_REQUIRED' | 'ROW_DECIDED' | 'CANDIDATE_PENDING';
export type ReviewOutcome = { status: 'DECIDED'; code?: undefined; decisionId: string; constituentId: string | null; followed: number } | { status: 'REFUSED'; code: RefusalCode; decisionId?: undefined; constituentId?: undefined; followed?: undefined };
export type ReviewItemView = { id: string; constituentId: string | null; candidateRowIndex: number | null; candidate: string; score: number; reasons: string[]; flags: string[] };
export type ReviewRowView = { batchId: string; rowIndex: number; rowId: string; row: { name: string; email: string; phone: string; address: string; giftDate: string; cents: number | null }; items: ReviewItemView[] };
export type BatchStatus = 'PREVIEWED' | 'COMMITTED' | 'COMPLETE' | 'UNDONE' | 'UNDO_FAILED';

const SETTLING: ReviewAction[] = ['MERGE', 'KEEP_SEPARATE', 'SAME_HOUSEHOLD'];

/** The constituent a reviewed row became or merged into, or null while it is undecided (D-55). */
export async function rowOutcome(tx: Tx, batchId: string, rowIndex: number): Promise<string | null> {
  const auto = await tx.mergeEvent.findFirst({ where: { importBatchId: batchId, rowIndex }, select: { survivorId: true } });
  if (auto) return auto.survivorId;
  const decision = await tx.reviewDecision.findFirst({ where: { reviewItem: { importBatchId: batchId, rowIndex }, action: { in: SETTLING } }, orderBy: { at: 'asc' } });
  if (!decision) return null;
  if (decision.action === 'MERGE') return (await tx.mergeEvent.findFirstOrThrow({ where: { reviewDecisionId: decision.id }, select: { survivorId: true } })).survivorId;
  return (await tx.constituentVersion.findFirstOrThrow({ where: { reviewDecisionId: decision.id, version: 1 }, select: { constituentId: true } })).constituentId;
}

const rowDecided = async (tx: Tx, batchId: string, rowIndex: number) => (await tx.reviewDecision.count({ where: { reviewItem: { importBatchId: batchId, rowIndex }, action: { in: SETTLING } } })) > 0;

/** Open rows (grouped items) of an org, or of one batch, in batch and row order. */
export async function listReview(tx: Tx, scope: { orgId: string; batchId?: string }): Promise<ReviewRowView[]> {
  const items = await tx.reviewItem.findMany({ where: { orgId: scope.orgId, ...(scope.batchId ? { importBatchId: scope.batchId } : {}) }, include: { decisions: true, constituent: true, importBatch: { select: { id: true, rows: true, createdAt: true } } }, orderBy: [{ importBatch: { createdAt: 'asc' } }, { rowIndex: 'asc' }, { createdAt: 'asc' }] });
  const byRow = new Map<string, ReviewItem[]>();
  for (const it of items) byRow.set(`${it.importBatchId}:${it.rowIndex}`, [...(byRow.get(`${it.importBatchId}:${it.rowIndex}`) ?? []), it]);
  const out: ReviewRowView[] = [];
  for (const group of byRow.values()) {
    if (group.some((it) => (it as typeof items[number]).decisions.some((d) => SETTLING.includes(d.action)))) continue;
    const first = group[0] as (typeof items)[number];
    const row = (first.importBatch.rows as StoredRows).rows[first.rowIndex]!;
    const views: ReviewItemView[] = [];
    for (const it of group as (typeof items)[number][]) {
      let constituentId = it.constituentId;
      let candidate = it.constituent?.businessId ?? '';
      if (!constituentId && it.candidateRowIndex !== null) {
        constituentId = await rowOutcome(tx, it.importBatchId, it.candidateRowIndex);
        candidate = constituentId ? (await tx.constituent.findUniqueOrThrow({ where: { id: constituentId } })).businessId : `row ${it.candidateRowIndex} (pending)`;
      }
      views.push({ id: it.id, constituentId, candidateRowIndex: it.candidateRowIndex, candidate, score: it.score, reasons: it.reasons as string[], flags: it.flags });
    }
    const rec = row.record;
    out.push({ batchId: first.importBatchId, rowIndex: first.rowIndex, rowId: row.id, row: { name: displayName(rec), email: rec.email, phone: rec.phone, address: displayAddress(rec), giftDate: row.giftDate, cents: row.cents }, items: views });
  }
  return out;
}

export async function batchStatus(tx: Tx, batchId: string): Promise<BatchStatus> {
  const events = await tx.importBatchEvent.findMany({ where: { importBatchId: batchId }, orderBy: { at: 'desc' } });
  const last = events[0];
  if (!last) return 'PREVIEWED';
  if (last.kind !== 'COMMITTED') return last.kind;
  const batch = await tx.importBatch.findUniqueOrThrow({ where: { id: batchId }, select: { orgId: true } });
  return (await listReview(tx, { orgId: batch.orgId, batchId })).length ? 'COMMITTED' : 'COMPLETE';
}

export type DecideInput = { itemId: string; action: ReviewAction; reason?: string; userId: string };

/** One review action (D-22). Serializable transaction; refusals write nothing. */
export async function decideReview(db: PrismaClient, input: DecideInput): Promise<ReviewOutcome> {
  const reason = input.reason?.trim() ?? '';
  return db.$transaction(
    async (tx) => {
      const item = await tx.reviewItem.findUnique({ where: { id: input.itemId }, include: { importBatch: true } });
      if (!item) return { status: 'REFUSED' as const, code: 'NOT_FOUND' as const };
      const membership = await tx.membership.findUnique({ where: { orgId_userId: { orgId: item.orgId, userId: input.userId } } });
      if (!membership || !can(membership.role, 'results.write')) return { status: 'REFUSED' as const, code: 'FORBIDDEN' as const };
      if ((input.action === 'MERGE' || input.action === 'KEEP_SEPARATE') && !reason) return { status: 'REFUSED' as const, code: 'REASON_REQUIRED' as const };
      if (await rowDecided(tx, item.importBatchId, item.rowIndex)) return { status: 'REFUSED' as const, code: 'ROW_DECIDED' as const };
      const candidate = item.constituentId ?? (item.candidateRowIndex !== null ? await rowOutcome(tx, item.importBatchId, item.candidateRowIndex) : null);
      if (!candidate && input.action !== 'DEFER') return { status: 'REFUSED' as const, code: 'CANDIDATE_PENDING' as const };

      const decision = await tx.reviewDecision.create({ data: { orgId: item.orgId, reviewItemId: item.id, action: input.action, reason: reason || null, userId: input.userId } });
      await audit({ orgId: item.orgId, userId: input.userId }, 'review.decide', { targetType: 'ReviewItem', targetId: item.id, data: { action: input.action, batchId: item.importBatchId, rowIndex: item.rowIndex, candidate } }, tx);
      if (input.action === 'DEFER') return { status: 'DECIDED' as const, decisionId: decision.id, constituentId: null, followed: 0 };

      const ctx = await loadBatchCtx(tx, item.importBatch);
      const row = ctx.rows[item.rowIndex]!;
      const writer = { reviewDecisionId: decision.id };
      let became: string;
      const mergedInto = item.flags.find((f) => f.startsWith('MERGED_INTO:'))?.slice('MERGED_INTO:'.length);
      if (input.action === 'MERGE' && item.flags.includes('PAIR_MEMORY') && mergedInto) {
        // D-59: the row already merged into X; MERGE here says X and the candidate are one person
        const x = await tx.constituent.findUniqueOrThrow({ where: { orgId_businessId: { orgId: item.orgId, businessId: mergedInto } } });
        const m = await mergeConstituentsTx(tx, { aId: x.id, bId: candidate!, reviewDecisionId: decision.id, reason: `review MERGE (pair memory): ${reason}` });
        if (m.status === 'REFUSED') throw new Error(`decideReview: constituent merge refused: ${m.code}`);
        became = m.survivorId;
      } else if (input.action === 'MERGE') {
        const { gift } = await giftForRow(tx, ctx, row, candidate);
        await writeRowMerge(tx, ctx, row, candidate!, writer, `review MERGE: ${reason}`, gift);
        became = candidate!;
      } else {
        const { gift } = await giftForRow(tx, ctx, row, null);
        let householdId: string | null = null;
        if (input.action === 'SAME_HOUSEHOLD') householdId = await householdOf(tx, ctx, candidate!, decision.id); // S5
        became = await writeNewConstituent(tx, ctx, row, writer, gift, householdId);
        if (input.action === 'KEEP_SEPARATE') await rememberPair(tx, ctx.orgId, became, candidate!, item.reasons as string[], decision.id);
      }
      const followed = await followPending(tx, ctx, item.rowIndex, became, input);
      return { status: 'DECIDED' as const, decisionId: decision.id, constituentId: became, followed };
    },
    { timeout: 120_000, isolationLevel: 'Serializable' },
  );
}

/** The target's household, creating one (and a target version linking it, written by the decision) when it has none. */
async function householdOf(tx: Tx, ctx: BatchCtx, targetId: string, reviewDecisionId: string): Promise<string> {
  const latest = await latestVersion(tx, targetId);
  if (latest.householdId) return latest.householdId;
  const hh = await tx.household.create({ data: { orgId: ctx.orgId, businessId: nextId(ctx, 'H') } });
  await tx.constituentVersion.create({ data: { ...carry(latest), version: latest.version + 1, householdId: hh.id, reviewDecisionId } });
  return hh.id;
}

/** D-22: KEEP_SEPARATE remembers the pair and the identifiers that agreed; a repeat widens the list. */
async function rememberPair(tx: Tx, orgId: string, x: string, t: string, agreed: string[], reviewDecisionId: string) {
  const [aId, bId] = [x, t].sort() as [string, string];
  const prev = await tx.pairMemory.findUnique({ where: { orgId_aId_bId: { orgId, aId, bId } } });
  const merged = [...new Set([...(prev?.agreed ?? []), ...agreed])];
  await tx.pairMemory.upsert({ where: { orgId_aId_bId: { orgId, aId, bId } }, create: { orgId, aId, bId, agreed: merged, reviewDecisionId }, update: { agreed: merged, reviewDecisionId } });
}

/** D-55: rows whose planned auto-merge waited on this row now merge into what it became, each under its own
 *  decision (MERGE, reason naming the row followed) by the same user. Returns how many followed. */
async function followPending(tx: Tx, ctx: BatchCtx, rowIndex: number, became: string, input: DecideInput): Promise<number> {
  const followers = await tx.reviewItem.findMany({ where: { importBatchId: ctx.batchId, candidateRowIndex: rowIndex, flags: { has: 'PLANNED_MERGE' } }, orderBy: { rowIndex: 'asc' } });
  let n = 0;
  for (const f of followers) {
    if (await rowDecided(tx, ctx.batchId, f.rowIndex)) continue;
    const row: ImportRow = ctx.rows[f.rowIndex]!;
    const decision = await tx.reviewDecision.create({ data: { orgId: ctx.orgId, reviewItemId: f.id, action: 'MERGE', reason: `D-55: follows row ${ctx.rows[rowIndex]!.id} decided ${input.action}`, userId: input.userId } });
    await audit({ orgId: ctx.orgId, userId: input.userId }, 'review.follow', { targetType: 'ReviewItem', targetId: f.id, data: { follows: rowIndex, batchId: ctx.batchId, rowIndex: f.rowIndex, candidate: became } }, tx);
    const { gift } = await giftForRow(tx, ctx, row, became);
    await writeRowMerge(tx, ctx, row, became, { reviewDecisionId: decision.id }, `planned auto-merge ${f.score}, followed row ${ctx.rows[rowIndex]!.id} (D-55)`, gift);
    n++;
    n += await followPending(tx, ctx, f.rowIndex, became, input); // a follower may itself have followers
  }
  return n;
}
