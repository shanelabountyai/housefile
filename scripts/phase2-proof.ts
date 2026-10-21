// `npm run phase2:proof` (task 2.10, D-65): the Phase 2 proofs end to end on a fresh org, printing every hash.
// seed → preview A → commit A → preview B → commit B → undo B → undo A (each undo's stateHash must equal the batch's
// beforeHash) → a constituent merge and its unmerge → a row merge and its unmerge (each record's hash must equal its
// snapshot). Exits 1 on the first mismatch, naming both hashes. Runs in CI against the job's Postgres.
import { readFileSync } from 'node:fs';
import { db } from '@/core/db';
import { commitBatch } from '@/commit/commit';
import { loadEffectiveConstituent, loadEffectiveState, type ConstituentSnapshot } from '@/commit/db-state';
import { mergeConstituents } from '@/commit/merge';
import { previewBatch } from '@/commit/preview';
import { seedFixtures } from '@/commit/seed';
import { effectiveStateHash } from '@/commit/state';
import { undoBatch } from '@/commit/undo';
import { snapshotHash, unmerge } from '@/commit/unmerge';
import { loadConstituents, loadGifts } from '@/import/crm';

const bytes = (p: string) => new Uint8Array(readFileSync(p));
const mapOf = (t: string) => JSON.parse(readFileSync(`import/maps/import_${t}.map.json`, 'utf8'));
const fail = (msg: string): never => {
  console.log(`phase2:proof FAILED: ${msg}`);
  process.exit(1);
};
const same = (what: string, got: string, want: string) => {
  console.log(`${what}: ${got} ${got === want ? '==' : '!='} ${want}`);
  if (got !== want) fail(what);
};

async function main() {
  const slug = `housefile-proof-${Date.now().toString(36)}`;
  const org = await db.org.create({ data: { slug, name: 'Housefile (phase2:proof)' } });
  const user = await db.user.create({ data: { email: `${slug}@housefile.test`, name: 'phase2:proof' } });
  await db.membership.create({ data: { orgId: org.id, userId: user.id, role: 'owner' } });
  const hash = async () => effectiveStateHash(await loadEffectiveState(db, org.id));
  const n = await seedFixtures(db, { orgId: org.id, userId: user.id, constituents: loadConstituents(bytes('fixtures/crm_constituents.csv')), gifts: loadGifts(bytes('fixtures/crm_gifts.csv')) });
  console.log(`seed: org ${slug}: ${n.constituents} constituents, ${n.gifts} gifts; stateHash ${await hash()}`);

  const batches: { tag: string; batchId: string; beforeHash: string }[] = [];
  for (const tag of ['a', 'b']) {
    const p = await previewBatch(db, { orgId: org.id, userId: user.id, fileName: `fixtures/import_${tag}.csv`, bytes: bytes(`fixtures/import_${tag}.csv`), map: mapOf(tag), asOf: '2026-10-14' });
    const t = p.plan.totals;
    console.log(`${tag.toUpperCase()}: preview ${p.batchId}: rows ${t.rows} = merged ${t.merged} + reviewed ${t.reviewed} + new ${t.new} + rejected ${t.rejected}; review load ${t.reviewed}/${t.rows} = ${((100 * t.reviewed) / t.rows).toFixed(1)}%; pending-target ${t.pendingTarget}; beforeHash ${p.beforeHash}; planHash ${p.planHash}`);
    const c = await commitBatch(db, { batchId: p.batchId, userId: user.id });
    if (c.status !== 'COMMITTED') fail(`${tag.toUpperCase()} commit ${c.status} expected ${c.expected} actual ${c.actual}`);
    const w = c.written;
    console.log(`${tag.toUpperCase()}: commit: constituents ${w.constituents}, versions ${w.versions}, gifts ${w.gifts} (+${w.giftsPending} waiting, ${w.giftsSkipped} skipped), merges ${w.mergeEvents}, review items ${w.reviewItems} over ${w.reviewRows} rows; stateHash ${await hash()}`);
    batches.push({ tag: tag.toUpperCase(), batchId: p.batchId, beforeHash: p.beforeHash });
  }
  for (const b of [...batches].reverse()) {
    const r = await undoBatch(db, { batchId: b.batchId, userId: user.id });
    if (r.status !== 'UNDONE') fail(`undo ${b.tag}: ${r.status} ${r.code ?? ''} expected ${r.expected ?? b.beforeHash} actual ${r.actual ?? ''}`);
    const v = r.reverted!;
    console.log(`undo ${b.tag}: retired ${v.constituentsRetired}, versions restored ${v.versionsRestored}, gifts voided ${v.giftsVoided}, merges reversed ${v.mergesReversed}`);
    same(`undo ${b.tag}: stateHash == beforeHash`, r.afterHash!, b.beforeHash);
  }

  const byBiz = (id: string) => db.constituent.findUniqueOrThrow({ where: { orgId_businessId: { orgId: org.id, businessId: id } } });
  const snap = async (id: string) => loadEffectiveConstituent(db, id);
  const [c1, c2] = [await byBiz('C0001'), await byBiz('C0002')];
  const before = { a: await snap(c1.id), b: await snap(c2.id) };
  const m = await mergeConstituents(db, { aId: c1.id, bId: c2.id, userId: user.id, reason: 'phase2:proof' });
  if (m.status !== 'MERGED') fail(`merge ${m.code}`);
  const u = await unmerge(db, { mergeEventId: m.mergeEventId!, userId: user.id, reason: 'phase2:proof' });
  if (u.status !== 'UNMERGED') fail(`unmerge ${u.code} ${u.detail ?? ''}`);
  const sv = m.survivorId === c1.id ? before.a : before.b;
  const lo = m.survivorId === c1.id ? before.b : before.a;
  same(`unmerge (constituent) survivor hash == snapshot`, snapshotHash(await snap(m.survivorId!)), snapshotHash(sv));
  same(`unmerge (constituent) loser hash == snapshot`, snapshotHash(await snap(m.loserId!)), snapshotHash(lo));

  const p = await previewBatch(db, { orgId: org.id, userId: user.id, fileName: 'fixtures/import_a.csv', bytes: bytes('fixtures/import_a.csv'), map: mapOf('a'), asOf: '2026-10-14' });
  const c = await commitBatch(db, { batchId: p.batchId, userId: user.id });
  if (c.status !== 'COMMITTED') fail(`A again: ${c.status}`);
  const rowMerge = await db.mergeEvent.findFirstOrThrow({ where: { importBatchId: p.batchId, kind: 'ROW_INTO_CONSTITUENT' }, orderBy: { at: 'desc' } });
  const ru = await unmerge(db, { mergeEventId: rowMerge.id, userId: user.id, reason: 'phase2:proof' });
  if (ru.status !== 'UNMERGED') fail(`row unmerge ${ru.code} ${ru.detail ?? ''}`);
  same(`unmerge (row ${rowMerge.rowIndex}) survivor hash == snapshot`, snapshotHash(await snap(rowMerge.survivorId)), snapshotHash(rowMerge.survivorSnapshot as unknown as ConstituentSnapshot));
  console.log(`unmerge (row ${rowMerge.rowIndex}): split out as ${(await db.constituent.findUniqueOrThrow({ where: { id: ru.loserId! } })).businessId} hash ${snapshotHash(await snap(ru.loserId!))}`);
  console.log('phase2:proof OK');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
