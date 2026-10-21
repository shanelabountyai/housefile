// Task 2.8 (brief §8, D-13, D-63): undo a committed batch with compensating rows, proven by hash. Every version the
// batch wrote (directly, through its review decisions, or through its merge events) is answered by a version equal to
// the one just before the batch's first write on that constituent, or a RETIRED version when the batch created it;
// every gift row it wrote is answered by a superseding row equal to the row before the batch's chain, or VOIDED when
// the batch introduced the gift. Then effectiveStateHash must equal beforeHash, inside the transaction; a mismatch
// rolls everything back and an UNDO_FAILED event records both hashes. Batches undo in reverse order only.
import type { Gift, PrismaClient } from '@/generated/prisma/client';
import { audit } from '@/core/audit';
import { sha256Hex } from '../lib/canonical';
import { effectiveOf, loadEffectiveConstituent, loadEffectiveState, type Tx } from './db-state';
import { effectiveStateHash } from './state';
import { snapshotHash } from './unmerge';
import { restoreVersion, supersedeGift } from './write';

export type UndoRefusal = 'NOT_FOUND' | 'NOT_COMMITTED' | 'ALREADY_UNDONE' | 'UNDO_BLOCKED_BY_LATER_BATCH' | 'UNDO_BLOCKED_BY_LATER_WRITE';
export type Reverted = { constituentsRetired: number; versionsRestored: number; giftsVoided: number; giftsRestored: number; mergesReversed: number; pairMemoriesRemoved: number };
export type UndoResult =
  | { status: 'UNDONE'; code?: undefined; afterHash: string; reverted: Reverted; expected?: undefined; actual?: undefined; detail?: undefined }
  | { status: 'UNDO_FAILED'; code?: undefined; expected: string; actual: string; reverted?: undefined; afterHash?: undefined; detail?: undefined }
  | { status: 'REFUSED'; code: UndoRefusal; detail?: string; reverted?: undefined; afterHash?: undefined; expected?: undefined; actual?: undefined };
/** `beforeProof` is a test hook run inside the transaction just before the hash check (the injected-fault test). */
export type UndoInput = { batchId: string; userId: string; beforeProof?: (tx: Tx) => Promise<void> };

class UndoProofFailed extends Error {
  constructor(public expected: string, public actual: string) {
    super(`undo proof failed: expected ${expected}, actual ${actual}`);
  }
}

export async function undoBatch(db: PrismaClient, input: UndoInput): Promise<UndoResult> {
  try {
    return await db.$transaction((tx) => undoTx(tx, input), { timeout: 120_000, isolationLevel: 'Serializable' });
  } catch (e) {
    if (!(e instanceof UndoProofFailed)) throw e;
    // D-13: the mismatch is recorded outside the rolled-back transaction, with both hashes
    const batch = await db.importBatch.findUniqueOrThrow({ where: { id: input.batchId }, select: { orgId: true } });
    await db.importBatchEvent.create({ data: { orgId: batch.orgId, importBatchId: input.batchId, kind: 'UNDO_FAILED', expectedHash: e.expected, actualHash: e.actual, userId: input.userId } });
    return { status: 'UNDO_FAILED', expected: e.expected, actual: e.actual };
  }
}

async function undoTx(tx: Tx, input: UndoInput): Promise<UndoResult> {
  const batch = await tx.importBatch.findUnique({ where: { id: input.batchId }, include: { events: true } });
  if (!batch) return { status: 'REFUSED', code: 'NOT_FOUND' };
  const committed = batch.events.find((e) => e.kind === 'COMMITTED');
  if (!committed) return { status: 'REFUSED', code: 'NOT_COMMITTED' };
  if (batch.events.some((e) => e.kind === 'UNDONE')) return { status: 'REFUSED', code: 'ALREADY_UNDONE' };
  const { orgId } = batch;
  const writer = { userId: input.userId };

  // reverse order only: every batch committed after this one must already be undone
  const laterCommits = await tx.importBatchEvent.findMany({ where: { orgId, kind: 'COMMITTED', at: { gt: committed.at }, importBatchId: { not: batch.id } }, include: { importBatch: { include: { events: true } } } });
  const blocking = laterCommits.filter((e) => !e.importBatch.events.some((x) => x.kind === 'UNDONE')).map((e) => e.importBatchId);
  if (blocking.length) return { status: 'REFUSED', code: 'UNDO_BLOCKED_BY_LATER_BATCH', detail: blocking.join(',') };

  // everything the batch wrote: directly, through its review decisions, or through its merge events (D-14)
  const decisionIds = (await tx.reviewDecision.findMany({ where: { reviewItem: { importBatchId: batch.id } }, select: { id: true } })).map((d) => d.id);
  const merges = await tx.mergeEvent.findMany({ where: { OR: [{ importBatchId: batch.id }, { reviewDecisionId: { in: decisionIds } }] }, include: { unmerge: true } });
  const mergeIds = merges.map((m) => m.id);
  const byBatch = { OR: [{ importBatchId: batch.id }, { reviewDecisionId: { in: decisionIds } }, { mergeEventId: { in: mergeIds } }] };
  const reverted: Reverted = { constituentsRetired: 0, versionsRestored: 0, giftsVoided: 0, giftsRestored: 0, mergesReversed: 0, pairMemoriesRemoved: 0 };

  // constituents: back to the version before the batch's first write, or retired when the batch created them
  const versions = await tx.constituentVersion.findMany({ where: byBatch, orderBy: [{ constituentId: 'asc' }, { version: 'asc' }] });
  const span = new Map<string, { min: number; max: number }>();
  for (const v of versions) {
    const s = span.get(v.constituentId);
    span.set(v.constituentId, { min: Math.min(s?.min ?? v.version, v.version), max: Math.max(s?.max ?? v.version, v.version) });
  }
  const stateOf = (v: { status: string } & Parameters<typeof effectiveOf>[1], businessId: string, household: string) => sha256Hex({ status: v.status, c: effectiveOf(businessId, v, household) });
  for (const [constituentId, s] of span) {
    const latest = await tx.constituentVersion.findFirstOrThrow({ where: { constituentId }, orderBy: { version: 'desc' }, include: { household: true, constituent: true } });
    if (latest.version > s.max) {
      // a later write blocks unless it was net neutral (a later batch's undo put the record back as this batch left it)
      const last = await tx.constituentVersion.findUniqueOrThrow({ where: { constituentId_version: { constituentId, version: s.max } }, include: { household: true } });
      if (stateOf(latest, latest.constituent.businessId, latest.household?.businessId ?? '') !== stateOf(last, latest.constituent.businessId, last.household?.businessId ?? '')) return { status: 'REFUSED', code: 'UNDO_BLOCKED_BY_LATER_WRITE', detail: `constituent ${constituentId} version ${latest.version}` };
    }
    if (s.min === 1) {
      const cur = await loadEffectiveConstituent(tx, constituentId);
      if (await restoreVersion(tx, constituentId, cur.constituent, 'RETIRED', writer)) reverted.constituentsRetired++;
    } else {
      const pre = await tx.constituentVersion.findUniqueOrThrow({ where: { constituentId_version: { constituentId, version: s.min - 1 } }, include: { household: true, constituent: true } });
      if (await restoreVersion(tx, constituentId, effectiveOf(pre.constituent.businessId, pre, pre.household?.businessId ?? ''), pre.status, writer)) reverted.versionsRestored++;
    }
  }

  // gifts: each chain the batch touched goes back to the row before the batch's part of it, or is voided
  const rows: Gift[] = await tx.gift.findMany({ where: byBatch });
  const batchRowIds = new Set(rows.map((g) => g.id));
  for (const ref of [...new Set(rows.map((g) => g.giftRef))].sort()) {
    const head = await tx.gift.findFirstOrThrow({ where: { orgId, giftRef: ref, supersededBy: null } });
    // the batch's last row in this chain; rows above it are later writes, allowed only when net neutral (same constituent and status)
    let last: Gift | null = head;
    while (last && !batchRowIds.has(last.id)) last = last.supersedesGiftId ? await tx.gift.findUniqueOrThrow({ where: { id: last.supersedesGiftId } }) : null;
    if (!last || last.constituentId !== head.constituentId || last.status !== head.status) return { status: 'REFUSED', code: 'UNDO_BLOCKED_BY_LATER_WRITE', detail: `gift ${ref} row ${head.id}` };
    let base: Gift | null = last;
    while (base && batchRowIds.has(base.id)) base = base.supersedesGiftId ? await tx.gift.findUniqueOrThrow({ where: { id: base.supersedesGiftId } }) : null;
    if (!base) {
      await supersedeGift(tx, head, { status: 'VOIDED' }, 'BATCH_UNDONE', writer);
      reverted.giftsVoided++;
    } else {
      await supersedeGift(tx, head, { constituentId: base.constituentId, status: base.status }, 'BATCH_UNDONE', writer);
      reverted.giftsRestored++;
    }
  }

  // merges: reversed above by the version and gift restores; the ledger says so, so they stop blocking (D-62)
  for (const m of merges) {
    if (m.unmerge) continue;
    const survivorHash = snapshotHash(await loadEffectiveConstituent(tx, m.survivorId));
    await tx.unmergeEvent.create({ data: { orgId, mergeEventId: m.id, survivorHash, loserHash: '', reason: 'BATCH_UNDONE', userId: input.userId } });
    reverted.mergesReversed++;
  }
  reverted.pairMemoriesRemoved = (await tx.pairMemory.deleteMany({ where: { reviewDecisionId: { in: decisionIds } } })).count; // D-59: memory, not ledger

  await input.beforeProof?.(tx);
  const actual = effectiveStateHash(await loadEffectiveState(tx, orgId));
  if (actual !== batch.beforeHash) throw new UndoProofFailed(batch.beforeHash, actual);
  await tx.importBatchEvent.create({ data: { orgId, importBatchId: batch.id, kind: 'UNDONE', expectedHash: batch.beforeHash, actualHash: actual, userId: input.userId } });
  await audit({ orgId, userId: input.userId }, 'batch.undo', { targetType: 'ImportBatch', targetId: batch.id, data: { ...reverted, beforeHash: batch.beforeHash, afterHash: actual } }, tx);
  return { status: 'UNDONE', afterHash: actual, reverted };
}
