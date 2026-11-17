// Task 2.3: a preview against the seeded org writes exactly one ImportBatch row and nothing else, reproduces the
// Phase 1 dry-run byte for byte (file A = decisions_a.csv with 0 drift by transitivity: tests/unit/import/eval.test.ts
// proves the in-memory decisions equal decisions_a.csv, and this file proves the database path equals the in-memory
// one row for row; file B = the Phase 1 "B alone" result, D-51), and can be rebuilt from the stored batch (D-10).
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { previewBatch, rebuildPreview } from '@/commit/preview';
import { seedFixtures } from '@/commit/seed';
import { decisionRow } from '@/eval/import-eval';
import { loadConstituents, loadGifts } from '@/import/crm';
import { loadImportFile } from '@/import/pipeline';
import { buildPreview } from '@/import/preview';
import { formatPreview } from '@/import/report';
import { createMatchState, resolveBatch } from '@/import/resolve';
import { sha256Hex } from '@/lib/canonical';
import { allTables, resetAuthTables } from '../helpers/auth';
import { makeOrg } from '../helpers/org';

beforeEach(resetAuthTables);

const USER = '00000000-0000-4000-8000-000000000001';
const bytes = (p: string) => new Uint8Array(readFileSync(p));
const crm = loadConstituents(bytes('fixtures/crm_constituents.csv'));
const gifts = loadGifts(bytes('fixtures/crm_gifts.csv'));
const mapOf = (tag: string) => JSON.parse(readFileSync(`import/maps/import_${tag.toLowerCase()}.map.json`, 'utf8'));
const pathOf = (tag: string) => `fixtures/import_${tag.toLowerCase()}.csv`;

/** The Phase 1 dry-run, in memory, exactly as scripts/import-dry-run.ts computes it. */
function inMemory(tag: 'A' | 'B') {
  const file = loadImportFile(bytes(pathOf(tag)), { tag, map: mapOf(tag) });
  const state = createMatchState(crm);
  const before = createMatchState(state.crm);
  const { decisions } = resolveBatch(file.rows, state);
  const p = buildPreview(file, decisions, before.crm, gifts, { path: pathOf(tag), asOf: '2026-10-14' });
  return { decisions, text: formatPreview(p) };
}

async function tableCounts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of await allTables()) out[t] = (await db.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${t}"`))[0]!.n;
  return out;
}

async function seededOrg() {
  const org = await makeOrg();
  await seedFixtures(db, { orgId: org.id, userId: USER, constituents: crm, gifts });
  return org.id;
}

const BRIEF_12 = { A: 'a4d3e08af9606d75dcc396e247e444342eccade6ee060af378975485ce6792bb', B: 'a4e0df19787138089b4daf78cec0ba4a1c612d1e2c73a02a32d97f263d0f1aa6' };

describe('preview persisted (task 2.3; D-10, D-12, D-51)', () => {
  it('file A against the seeded org: one ImportBatch row, the Phase 1 report byte for byte, decisions row for row', async () => {
    const orgId = await seededOrg();
    const before = await tableCounts();
    const r = await previewBatch(db, { orgId, userId: USER, fileName: pathOf('A'), bytes: bytes(pathOf('A')), map: mapOf('A'), asOf: '2026-10-14' });
    const mem = inMemory('A');
    expect(formatPreview(r.preview)).toBe(mem.text);
    expect(r.decisions.map(decisionRow)).toEqual(mem.decisions.map(decisionRow));
    expect(r.decisions.length).toBe(400);
    expect(await tableCounts()).toEqual({ ...before, ImportBatch: before.ImportBatch! + 1 });

    const batch = await db.importBatch.findUniqueOrThrow({ where: { id: r.batchId } });
    expect(batch.contentHash).toBe(BRIEF_12.A); // brief §12
    expect(batch.encoding).toBe('utf-8-sig');
    expect(Buffer.from(batch.rawBytes).equals(Buffer.from(bytes(pathOf('A'))))).toBe(true);
    expect(batch.beforeHash).toBe(r.preview.crm.beforeHash);
    expect(batch.planHash).toBe(sha256Hex(batch.plan));
    expect(batch.plan).toEqual(JSON.parse(JSON.stringify(r.preview)));
    expect((batch.map as { fields: unknown; extras: string[] }).extras).toEqual(r.preview.file.extras);
  });

  it('file B against the seeded org reproduces the Phase 1 "B alone" result (P-7, D-51): 166/32/38/14, DUP_GIFT 4, DUP_GIFT_IN_FILE 7', async () => {
    const orgId = await seededOrg();
    const r = await previewBatch(db, { orgId, userId: USER, fileName: pathOf('B'), bytes: bytes(pathOf('B')), map: mapOf('B'), asOf: '2026-10-14' });
    const t = r.preview.totals;
    expect([t.merged, t.reviewed, t.new, t.rejected, t.dupGift, t.dupGiftInFile]).toEqual([166, 32, 38, 14, 4, 7]);
    expect(formatPreview(r.preview)).toBe(inMemory('B').text);
    expect(r.preview.file.encoding).toBe('cp1252');
    expect((await db.importBatch.findUniqueOrThrow({ where: { id: r.batchId } })).contentHash).toBe(BRIEF_12.B);
  });

  it('the plan rebuilt from the stored batch alone equals the stored plan (D-10)', async () => {
    const orgId = await seededOrg();
    const r = await previewBatch(db, { orgId, userId: USER, fileName: pathOf('A'), bytes: bytes(pathOf('A')), map: mapOf('A'), asOf: '2026-10-14' });
    const batch = await db.importBatch.findUniqueOrThrow({ where: { id: r.batchId } });
    const rebuilt = await rebuildPreview(db, r.batchId);
    expect(rebuilt.plan).toEqual(batch.plan);
    expect(rebuilt.planHash).toBe(batch.planHash);
    expect(rebuilt.beforeHash).toBe(batch.beforeHash);
    expect(await db.importBatch.count()).toBe(1); // a rebuild writes nothing
  });
});
