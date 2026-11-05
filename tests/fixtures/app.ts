// CLONE-OWNED. The INV-01..04 harness seeds these rows in both fixture orgs, so it can drive
// actions whose inputs use ref('<model>') for the clone's own tables. Return { model: id } for
// one row of each model, owned by `org.orgId`.
import { db } from '@/core/db';
import { definitionHash } from '@/segments/segment';

// Task 3.9: one stored (junk) preview and one review item on it. commit refuses the batch (its planHash is not the plan's hash),
// undo refuses it (never committed), and a MERGE with no reason is refused before the item's rows are read.
export async function seedApp(org: { orgId: string; userId: string }, key: 'a' | 'b'): Promise<Record<string, string>> {
  // fixed ids, like the template's own fixture rows: the harness re-seeds between actions and its ref map must stay valid
  const ids = key === 'a' ? { batch: '00000000-0000-4000-8000-0000000a0b01', item: '00000000-0000-4000-8000-0000000a0c01' } : { batch: '00000000-0000-4000-8000-0000000b0b01', item: '00000000-0000-4000-8000-0000000b0c01' };
  const batch = await db.importBatch.create({
    data: {
      id: ids.batch, orgId: org.orgId, userId: org.userId, fileName: `harness-${key}.csv`, rawBytes: new Uint8Array(), contentHash: 'x', encoding: 'utf-8',
      asOf: new Date('2026-10-14'), map: {}, rows: {}, plan: {}, planHash: 'not-the-plan-hash', beforeHash: 'x',
    },
  });
  const item = await db.reviewItem.create({ data: { id: ids.item, orgId: org.orgId, importBatchId: batch.id, rowIndex: 1, candidateRowIndex: 0, score: 0, reasons: [], flags: [] } });

  // Task 3.10: a merge event that is already unmerged (unmerge refuses it ALREADY_UNMERGED without touching a version) and a saved segment.
  const h = key === 'a' ? { a: '00000000-0000-4000-8000-0000000a0d01', b: '00000000-0000-4000-8000-0000000a0d02', merge: '00000000-0000-4000-8000-0000000a0e01', unmerge: '00000000-0000-4000-8000-0000000a0e02', segment: '00000000-0000-4000-8000-0000000a0f01' } : { a: '00000000-0000-4000-8000-0000000b0d01', b: '00000000-0000-4000-8000-0000000b0d02', merge: '00000000-0000-4000-8000-0000000b0e01', unmerge: '00000000-0000-4000-8000-0000000b0e02', segment: '00000000-0000-4000-8000-0000000b0f01' };
  await db.constituent.create({ data: { id: h.a, orgId: org.orgId, businessId: `HX-${key}1` } });
  await db.constituent.create({ data: { id: h.b, orgId: org.orgId, businessId: `HX-${key}2` } });
  const merge = await db.mergeEvent.create({ data: { id: h.merge, orgId: org.orgId, kind: 'CONSTITUENT_INTO_CONSTITUENT', survivorId: h.a, loserId: h.b, survivorSnapshot: {}, loserSnapshot: {}, choices: {}, giftRefsMoved: [], softCreditsMoved: [], userId: org.userId } });
  await db.unmergeEvent.create({ data: { id: h.unmerge, orgId: org.orgId, mergeEventId: merge.id, survivorHash: 'x', loserHash: 'x', userId: org.userId } });
  const definition = { name: `Harness ${key}`, description: '', filters: [{ field: 'isHousehold', op: 'isTrue' }] };
  const segment = await db.segmentDefinition.create({ data: { id: h.segment, orgId: org.orgId, key: `harness-${key}`, version: 1, definition, definitionHash: definitionHash(definition), userId: org.userId } });
  return { importBatch: batch.id, reviewItem: item.id, mergeEvent: merge.id, segmentDefinition: segment.id };
}
