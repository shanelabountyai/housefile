// Task 2.3 (D-10, D-12): the Phase 1 pipeline run against the database's effective state, and its result stored as
// ONE ImportBatch row: raw bytes, content hash, encoding, map with extras, parsed rows with their rule traces and
// decisions, the plan, planHash, beforeHash. Nothing else is written. The plan is the only input to commit (2.4).
import { basename } from 'node:path';
import type { PrismaClient } from '@/generated/prisma/client';
import { sha256Hex } from '../lib/canonical';
import type { ColumnMap } from '../import/map';
import { loadImportFile, type LoadedFile } from '../import/pipeline';
import { buildPreview, type Preview } from '../import/preview';
import { createMatchState, resolveBatch, type RowDecision } from '../import/resolve';
import { isoDate, loadEffectiveState, type Tx } from './db-state';
import { effectiveStateHash, stateToCrm } from './state';

export type PreviewInput = { orgId: string; fileName: string; bytes: Uint8Array; map?: ColumnMap; asOf: string };
export type StoredMap = { fields: ColumnMap; extras: string[] };
export type StoredRows = { rows: LoadedFile['rows']; decisions: RowDecision[]; pairsCompared: number };
export type Computed = { preview: Preview; plan: Preview; planHash: string; beforeHash: string; decisions: RowDecision[]; file: LoadedFile; pairsCompared: number };

/** Row-id prefix: the letter in import_<x>.csv, else R (as scripts/import-dry-run.ts). */
export const tagOf = (fileName: string): string => /import_([a-z])\.csv$/i.exec(basename(fileName))?.[1]?.toUpperCase() ?? 'R';

/** A JSON round trip: what is stored is what is hashed (drops undefined keys, which canonicalJson refuses). */
export const asJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** The preview against the current effective state. Reads only. */
export async function computePreview(tx: Tx, input: PreviewInput): Promise<Computed> {
  const state = await loadEffectiveState(tx, input.orgId);
  const { crm, gifts } = stateToCrm(state);
  const file = loadImportFile(input.bytes, { tag: tagOf(input.fileName), asOf: input.asOf, map: input.map });
  const { decisions, pairsCompared } = resolveBatch(file.rows, createMatchState(crm)); // the state is cloned; crm stays the pre-batch CRM
  const preview = buildPreview(file, decisions, crm, gifts, { path: input.fileName, asOf: input.asOf, beforeHash: effectiveStateHash(state) });
  await applyPairMemory(tx, input.orgId, preview, decisions);
  const plan = asJson(preview);
  return { preview, plan, planHash: sha256Hex(plan), beforeHash: preview.crm.beforeHash, decisions, file, pairsCompared };
}

/** Compute the preview and store it as one ImportBatch row. */
export async function previewBatch(db: PrismaClient, input: PreviewInput & { userId: string }): Promise<Computed & { batchId: string }> {
  return db.$transaction(
    async (tx) => {
      const c = await computePreview(tx, input);
      const map: StoredMap = { fields: c.file.map, extras: c.file.extras };
      const rows: StoredRows = asJson({ rows: c.file.rows, decisions: c.decisions, pairsCompared: c.pairsCompared });
      const batch = await tx.importBatch.create({
        data: {
          orgId: input.orgId, userId: input.userId, fileName: input.fileName, rawBytes: new Uint8Array(input.bytes),
          contentHash: c.file.parsed.contentHash, encoding: c.file.parsed.encoding, asOf: new Date(input.asOf),
          map, rows, plan: c.plan, planHash: c.planHash, beforeHash: c.beforeHash,
        },
      });
      return { batchId: batch.id, ...c };
    },
    { timeout: 60_000 },
  );
}

/** The preview recomputed from the stored batch alone (bytes, map, asOf) against the current state (D-10). Writes nothing. */
export async function rebuildPreview(tx: Tx, batchId: string): Promise<Computed> {
  const b = await tx.importBatch.findUniqueOrThrow({ where: { id: batchId } });
  return computePreview(tx, { orgId: b.orgId, fileName: b.fileName, bytes: new Uint8Array(b.rawBytes), map: (b.map as StoredMap).fields, asOf: isoDate(b.asOf) });
}

/** D-22, D-59: a row merging into X while another candidate T is remembered as KEEP_SEPARATE from X is re-queued
 *  against T only when an identifier outside the remembered list now agrees. Reads PairMemory; writes nothing. */
async function applyPairMemory(tx: Tx, orgId: string, preview: Preview, decisions: RowDecision[]): Promise<void> {
  const memories = await tx.pairMemory.findMany({ where: { orgId } });
  if (!memories.length) return;
  const cons = await tx.constituent.findMany({ where: { orgId }, select: { id: true, businessId: true } });
  const idOf = new Map(cons.map((c) => [c.businessId, c.id]));
  const key = (a: string, b: string) => [a, b].sort().join('|');
  const agreedOf = new Map(memories.map((m) => [key(m.aId, m.bId), m.agreed]));
  for (const d of decisions) {
    if (d.decision !== 'MERGE') continue;
    const x = idOf.get(d.target);
    if (!x) continue;
    for (const cand of d.candidates) {
      const t = idOf.get(cand.id);
      if (!t || t === x) continue;
      const agreed = agreedOf.get(key(x, t));
      if (!agreed) continue;
      const newly = cand.score.reasons.filter((r) => !agreed.includes(r) && !r.endsWith('_DIFF') && !r.endsWith('_CONFLICT') && !r.endsWith('_MISSING'));
      if (newly.length) preview.memoryQueue.push({ rowId: d.rowId, mergedInto: d.target, target: cand.id, agreedBefore: agreed, newlyAgreed: newly, score: cand.score.total });
    }
  }
  preview.totals.memoryQueued = preview.memoryQueue.length;
}
