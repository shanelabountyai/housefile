// Task 2.7 (D-24, D-46, D-48, D-62): reverse one merge from its MergeEvent snapshots. The survivor goes back to its
// snapshot; a constituent loser comes back as a version equal to its snapshot; a row loser is split back out as a new
// constituent (D-46); moved gifts move back by superseding rows. Proof: each record's effective-state hash equals its
// snapshot hash, recorded on an UnmergeEvent. Refused UNMERGE_BLOCKED while a later, un-reversed merge touches either record.
import type { MergeEvent, PrismaClient } from '@/generated/prisma/client';
import { audit } from '@/core/audit';
import { sha256Hex } from '../lib/canonical';
import type { ImportRow } from '../import/validate';
import { loadEffectiveConstituent, type ConstituentSnapshot, type Tx } from './db-state';
import { activeGift, activePledge, loadBatchCtx, restoreVersion, supersedeGift, supersedePledge, writeNewConstituent } from './write';

/** pledgeRefs enter only when present, so snapshots without pledges hash as they did before task 3.6. */
export const snapshotHash = (s: Pick<ConstituentSnapshot, 'constituent' | 'giftRefs' | 'pledgeRefs'>) =>
  sha256Hex({ constituent: s.constituent, giftRefs: [...s.giftRefs].sort(), ...(s.pledgeRefs?.length && { pledgeRefs: [...s.pledgeRefs].sort() }) });

export type UnmergeRefusal = 'NOT_FOUND' | 'ALREADY_UNMERGED' | 'UNMERGE_BLOCKED' | 'PROOF_FAILED';
export type UnmergeResult =
  | { status: 'UNMERGED'; code?: undefined; unmergeEventId: string; survivorId: string; loserId: string }
  | { status: 'REFUSED'; code: UnmergeRefusal; detail?: string; unmergeEventId?: undefined; survivorId?: undefined; loserId?: undefined };
export type UnmergeInput = { mergeEventId: string; userId: string; reason?: string };

class ProofFailed extends Error {
  constructor(public detail: string) {
    super(`unmerge proof failed: ${detail}`);
  }
}

export async function unmerge(db: PrismaClient, input: UnmergeInput): Promise<UnmergeResult> {
  try {
    return await db.$transaction((tx) => unmergeTx(tx, input), { timeout: 60_000, isolationLevel: 'Serializable' });
  } catch (e) {
    if (e instanceof ProofFailed) return { status: 'REFUSED', code: 'PROOF_FAILED', detail: e.detail };
    throw e;
  }
}

/** Merges after `m`, on either of its records, that have not been reversed: each blocks the unmerge (D-24). */
export async function laterMerges(tx: Tx, m: MergeEvent): Promise<MergeEvent[]> {
  const ids = [m.survivorId, ...(m.loserId ? [m.loserId] : [])];
  return tx.mergeEvent.findMany({ where: { orgId: m.orgId, id: { not: m.id }, at: { gte: m.at }, OR: [{ survivorId: { in: ids } }, { loserId: { in: ids } }], unmerge: null } });
}

/** The unmerge inside a caller's transaction. `splitRow: false` (batch undo, D-13) reverts the survivor only: the
 *  row's gift is voided by the caller instead of being moved to a re-created constituent. Throws ProofFailed on a
 *  hash mismatch, which rolls the caller's transaction back. */
export async function unmergeTx(tx: Tx, input: UnmergeInput, opts: { splitRow: boolean } = { splitRow: true }): Promise<UnmergeResult> {
  const m = await tx.mergeEvent.findUnique({ where: { id: input.mergeEventId }, include: { unmerge: true, reviewDecision: { select: { reviewItem: { select: { importBatchId: true } } } } } });
  if (!m) return { status: 'REFUSED', code: 'NOT_FOUND' };
  if (m.unmerge) return { status: 'REFUSED', code: 'ALREADY_UNMERGED' };
  const blockers = await laterMerges(tx, m);
  if (blockers.length) return { status: 'REFUSED', code: 'UNMERGE_BLOCKED', detail: blockers.map((b) => b.id).join(',') };
  const writer = { userId: input.userId };
  const survivorSnap = m.survivorSnapshot as unknown as ConstituentSnapshot;

  await restoreVersion(tx, m.survivorId, survivorSnap.constituent, survivorSnap.status, writer);
  let loserId: string;
  if (m.kind === 'CONSTITUENT_INTO_CONSTITUENT') {
    const loserSnap = m.loserSnapshot as unknown as ConstituentSnapshot;
    loserId = m.loserId!;
    await restoreVersion(tx, loserId, loserSnap.constituent, loserSnap.status, writer);
  } else if (opts.splitRow) {
    const batchId = m.importBatchId ?? m.reviewDecision?.reviewItem.importBatchId;
    if (!batchId) throw new Error(`unmerge: merge ${m.id} has no batch`);
    const ctx = await loadBatchCtx(tx, await tx.importBatch.findUniqueOrThrow({ where: { id: batchId } }));
    const row = (m.loserSnapshot as unknown as { row: ImportRow }).row;
    loserId = await writeNewConstituent(tx, ctx, row, writer, null);
  } else loserId = '';
  if (loserId) for (const ref of m.giftRefsMoved) await supersedeGift(tx, await activeGift(tx, m.orgId, ref), { constituentId: loserId }, `UNMERGED ${m.id}`, writer);
  // a constituent loser's pledges, as its snapshot listed them (task 3.6); a row loser has none
  if (loserId && m.kind === 'CONSTITUENT_INTO_CONSTITUENT') for (const ref of (m.loserSnapshot as unknown as ConstituentSnapshot).pledgeRefs ?? []) await supersedePledge(tx, await activePledge(tx, m.orgId, ref), loserId, `UNMERGED ${m.id}`, writer);

  const survivor = await loadEffectiveConstituent(tx, m.survivorId);
  const survivorHash = snapshotHash(survivor);
  let loserHash = '';
  if (opts.splitRow) {
    if (survivorHash !== snapshotHash(survivorSnap)) throw new ProofFailed(`survivor ${m.survivorId}: ${survivorHash} != snapshot ${snapshotHash(survivorSnap)}`);
    const loser = await loadEffectiveConstituent(tx, loserId);
    loserHash = snapshotHash(loser);
    if (m.kind === 'CONSTITUENT_INTO_CONSTITUENT') {
      const want = snapshotHash(m.loserSnapshot as unknown as ConstituentSnapshot);
      if (loserHash !== want) throw new ProofFailed(`loser ${loserId}: ${loserHash} != snapshot ${want}`);
    }
  }
  const ev = await tx.unmergeEvent.create({ data: { orgId: m.orgId, mergeEventId: m.id, survivorHash, loserHash, reason: input.reason ?? null, userId: input.userId } });
  await audit({ orgId: m.orgId, userId: input.userId }, 'merge.unmerge', { targetType: 'MergeEvent', targetId: m.id, data: { kind: m.kind, survivorId: m.survivorId, loserId, survivorHash, loserHash } }, tx);
  return { status: 'UNMERGED', unmergeEventId: ev.id, survivorId: m.survivorId, loserId };
}
