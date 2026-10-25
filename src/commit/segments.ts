// Saved segments and runs (D-27, D-68, D-76, task 3.4). Saving validates against segments/schema.json and appends a
// version under the key (an unchanged definition appends nothing); a run evaluates one version at an explicit asOf over
// the effective state and records members, count and both hashes. Both gated by results.write, audited, serializable.
import type { PrismaClient } from '@/generated/prisma/client';
import { audit } from '@/core/audit';
import { can } from '@/core/authz/permissions';
import { definitionHash, evaluateSegment, validateSegment, type SegmentRefusal, type SegmentResult } from '../segments/segment';
import { loadEffectiveState, type Tx } from './db-state';

export type SaveRefusal = SegmentRefusal | 'FORBIDDEN' | 'BAD_KEY';
export type SaveResult = { status: 'SAVED' | 'UNCHANGED'; code?: undefined; definitionId: string; version: number; definitionHash: string } | { status: 'REFUSED'; code: SaveRefusal; detail?: string; definitionId?: undefined; version?: undefined; definitionHash?: undefined };
export type RunRefusal = 'FORBIDDEN' | 'NOT_FOUND' | 'BAD_AS_OF';
export type RunResult = ({ status: 'RAN'; code?: undefined; runId: string } & SegmentResult) | { status: 'REFUSED'; code: RunRefusal; runId?: undefined; asOf?: undefined; members?: undefined; count?: undefined; definitionHash?: undefined; memberListHash?: undefined };

const KEY = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const SERIAL = { isolationLevel: 'Serializable' as const };
const allowed = async (tx: Tx, orgId: string, userId: string) => {
  const m = await tx.membership.findUnique({ where: { orgId_userId: { orgId, userId } } });
  return !!m && can(m.role, 'results.write');
};

export async function saveSegment(db: PrismaClient, input: { orgId: string; userId: string; key: string; definition: unknown }): Promise<SaveResult> {
  if (!KEY.test(input.key)) return { status: 'REFUSED', code: 'BAD_KEY', detail: 'lowercase letters, digits and dashes' };
  const v = validateSegment(input.definition);
  if (!v.ok) return { status: 'REFUSED', code: v.code, detail: v.detail };
  const hash = definitionHash(v.def);
  return db.$transaction(async (tx): Promise<SaveResult> => {
    if (!(await allowed(tx, input.orgId, input.userId))) return { status: 'REFUSED', code: 'FORBIDDEN' };
    const last = await tx.segmentDefinition.findFirst({ where: { orgId: input.orgId, key: input.key }, orderBy: { version: 'desc' } });
    if (last?.definitionHash === hash) return { status: 'UNCHANGED', definitionId: last.id, version: last.version, definitionHash: hash };
    const row = await tx.segmentDefinition.create({ data: { orgId: input.orgId, key: input.key, version: (last?.version ?? 0) + 1, definition: v.def, definitionHash: hash, userId: input.userId } });
    await audit({ orgId: input.orgId, userId: input.userId }, 'segment.save', { targetType: 'SegmentDefinition', targetId: row.id, data: { key: row.key, version: row.version, definitionHash: hash } }, tx);
    return { status: 'SAVED', definitionId: row.id, version: row.version, definitionHash: hash };
  }, SERIAL);
}

/** Runs one saved version (by id) at asOf. The stored definition is re-validated, so a row that bypassed save cannot run. */
export async function runSegment(db: PrismaClient, input: { definitionId: string; userId: string; asOf: string }): Promise<RunResult> {
  if (!ISO.test(input.asOf)) return { status: 'REFUSED', code: 'BAD_AS_OF' };
  return db.$transaction(async (tx): Promise<RunResult> => {
    const d = await tx.segmentDefinition.findUnique({ where: { id: input.definitionId } });
    if (!d) return { status: 'REFUSED', code: 'NOT_FOUND' };
    if (!(await allowed(tx, d.orgId, input.userId))) return { status: 'REFUSED', code: 'FORBIDDEN' };
    const v = validateSegment(d.definition);
    if (!v.ok || definitionHash(v.def) !== d.definitionHash) throw new Error(`segment ${d.key} v${d.version}: stored definition does not match its hash`);
    const r = evaluateSegment(v.def, await loadEffectiveState(tx, d.orgId), input.asOf);
    const run = await tx.segmentRun.create({ data: { orgId: d.orgId, definitionId: d.id, asOf: new Date(`${r.asOf}T00:00:00Z`), members: r.members, count: r.count, definitionHash: r.definitionHash, memberListHash: r.memberListHash, userId: input.userId } });
    await audit({ orgId: d.orgId, userId: input.userId }, 'segment.run', { targetType: 'SegmentRun', targetId: run.id, data: { key: d.key, version: d.version, asOf: r.asOf, count: r.count, memberListHash: r.memberListHash } }, tx);
    return { status: 'RAN', runId: run.id, ...r };
  }, SERIAL);
}
