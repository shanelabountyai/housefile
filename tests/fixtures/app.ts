// CLONE-OWNED. The INV-01..04 harness seeds these rows in both fixture orgs, so it can drive
// actions whose inputs use ref('<model>') for the clone's own tables. Return { model: id } for
// one row of each model, owned by `org.orgId`.
import { db } from '@/core/db';

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
  return { importBatch: batch.id, reviewItem: item.id };
}
