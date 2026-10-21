// Task 2.4 (D-12, D-14, D-35, D-46, D-55, D-58, D-59): commit a stored preview. The only input is the batch id.
// The stored plan is re-hashed (PLAN_TAMPERED), the state is re-hashed against beforeHash (STATE_MOVED), then one
// transaction writes exactly the plan: NEW rows → constituent + version 1; MERGE rows → MergeEvent + survivorship
// version + gift; REVIEW rows → ReviewItems for every tied candidate; rows whose target is still in review →
// ReviewItems with candidateRowIndex (D-55); pair-memory re-queues → ReviewItems (D-59). Every row is tagged with
// the batch, directly or through its MergeEvent.
import type { PrismaClient } from '@/generated/prisma/client';
import { sha256Hex } from '../lib/canonical';
import { loadEffectiveState, type Tx } from './db-state';
import { effectiveStateHash } from './state';
import { loadBatchCtx, writeNewConstituent, writeRowMerge, type BatchCtx } from './write';

export type CommitStatus = 'COMMITTED' | 'ALREADY_COMMITTED' | 'STATE_MOVED' | 'PLAN_TAMPERED';
export type Written = { constituents: number; versions: number; gifts: number; giftsPending: number; giftsSkipped: number; mergeEvents: number; reviewItems: number; reviewRows: number; pendingTargetRows: number; pendingTargetItems: number; memoryQueued: number };
export type CommitResult = { status: CommitStatus; batchId: string; written: Written; expected?: string; actual?: string };

const ZERO: Written = { constituents: 0, versions: 0, gifts: 0, giftsPending: 0, giftsSkipped: 0, mergeEvents: 0, reviewItems: 0, reviewRows: 0, pendingTargetRows: 0, pendingTargetItems: 0, memoryQueued: 0 };

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
      const written = await applyPlan(tx, await loadBatchCtx(tx, batch));
      await tx.importBatchEvent.create({ data: { orgId: batch.orgId, importBatchId: batchId, kind: 'COMMITTED', userId } });
      return { status: 'COMMITTED' as const, batchId, written };
    },
    { timeout: 120_000, isolationLevel: 'Serializable' },
  );
}

const groupBy = <T>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
};

async function applyPlan(tx: Tx, ctx: BatchCtx): Promise<Written> {
  const { orgId, batchId, plan } = ctx;
  const writer = { importBatchId: batchId };
  const rowsById = new Map(ctx.rows.map((r) => [r.id, r]));
  const giftOf = new Map(plan.gifts.map((g) => [g.rowId, g]));
  const changesOf = groupBy(plan.changes, (c) => c.rowId);
  const alternatesOf = groupBy(plan.alternates, (a) => a.rowId);
  const aliasesOf = groupBy(plan.aliases, (a) => a.rowId);
  const pending = new Map(plan.pending.map((p) => [p.rowId, p]));
  const existingPairs = groupBy(plan.review.filter((r) => r.flags.includes('EXISTING_PAIR')), (r) => r.rowId); // S6
  const consByBiz = new Map((await tx.constituent.findMany({ where: { orgId }, select: { id: true, businessId: true } })).map((c) => [c.businessId, c.id]));
  const rowTarget = new Map<string, string>(); // row id → the constituent it became or merged into
  const resolve = (target: string): string | undefined => consByBiz.get(target) ?? rowTarget.get(target);
  const w: Written = { ...ZERO, giftsSkipped: plan.skippedGifts.length };

  for (const d of ctx.decisions) {
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
      const g = giftOf.get(d.rowId);
      const id = await writeNewConstituent(tx, ctx, row, writer, g ? { giftDate: g.giftDate, cents: g.cents, fundCode: g.fundCode, externalRef: g.externalRef } : null);
      rowTarget.set(d.rowId, id);
      w.constituents++;
      w.versions++;
      if (g) w.gifts++;
      continue;
    }

    const s6 = d.decision === 'MERGE' ? existingPairs.get(d.rowId) : undefined;
    if (s6) {
      for (const pair of s6) {
        const cid = resolve(pair.target);
        if (!cid) throw new Error(`commit: ${d.rowId} EXISTING_PAIR names unknown constituent ${pair.target}`);
        await tx.reviewItem.create({ data: { orgId, importBatchId: batchId, rowIndex: row.index, constituentId: cid, score: pair.score, reasons: pair.reasons, flags: pair.flags } });
        w.reviewItems++;
      }
      w.reviewRows++;
      continue;
    }

    if (d.decision === 'MERGE') {
      const survivorId = resolve(d.target);
      if (!survivorId) throw new Error(`commit: ${d.rowId} merges into unknown target ${d.target}`);
      const g = giftOf.get(d.rowId);
      const r = await writeRowMerge(tx, ctx, row, survivorId, writer, `auto-merge ${d.score}: ${d.reasons.join('+')}`, g ? { giftDate: g.giftDate, cents: g.cents, fundCode: g.fundCode, externalRef: g.externalRef } : null, {
        changes: changesOf.get(d.rowId) ?? [], alternates: alternatesOf.get(d.rowId) ?? [], aliases: aliasesOf.get(d.rowId) ?? [],
      });
      rowTarget.set(d.rowId, survivorId);
      w.mergeEvents++;
      if (r.giftRef) w.gifts++;
      if (r.versionWritten) w.versions++;
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

  // D-59: a merged row that newly agrees with a constituent remembered as KEEP_SEPARATE from its target goes to review too
  for (const m of plan.memoryQueue) {
    const row = rowsById.get(m.rowId)!;
    const cid = resolve(m.target);
    if (!cid) throw new Error(`commit: pair memory names unknown constituent ${m.target}`);
    await tx.reviewItem.create({ data: { orgId, importBatchId: batchId, rowIndex: row.index, constituentId: cid, score: m.score, reasons: m.newlyAgreed, flags: ['PAIR_MEMORY', `MERGED_INTO:${m.mergedInto}`] } });
    w.reviewItems++;
    w.memoryQueued++;
  }
  return w;
}
