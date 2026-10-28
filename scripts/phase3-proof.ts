// `npm run phase3:proof` (task 3.11): the Phase 3 proofs end to end on a fresh org, printing every number and hash.
// seed (CRM + Phase 3 pledges, soft credits, corrected gifts; hash == the fixture's in memory) → roll-ups and the six
// reference segments == answers.json → preview + commit A → roll-ups move by exactly A's written gifts → segments →
// letters queued, Σ == raised → correct one gift A wrote → exactly its letter LETTER_STALE → undo A → stateHash ==
// beforeHash and roll-ups == answers.json again. Exits 1 on the first mismatch, naming both sides. Runs in CI.
// The oracle (answers.json, written only by tools/phase3_answers.py) is read here as it is by the tests; never by src/.
import { readFileSync } from 'node:fs';
import { db } from '@/core/db';
import { commitBatch } from '@/commit/commit';
import { loadAppealCampaigns, loadEffectiveState } from '@/commit/db-state';
import { correctGift } from '@/commit/gifts';
import { loadLetters, queueLetters } from '@/commit/letters';
import { previewBatch } from '@/commit/preview';
import { seedFixtures } from '@/commit/seed';
import { runSegment, saveSegment } from '@/commit/segments';
import { effectiveStateHash } from '@/commit/state';
import { undoBatch } from '@/commit/undo';
import { rollups, type Stat } from '@/derive/rollups';
import { loadConstituents } from '@/import/crm';
import { answers, phase3Pledges, phase3SeedGifts, phase3SoftCredits, phase3State } from '../tests/helpers/phase3';

const AS_OF: string = answers.asOf;
const bytes = (p: string) => new Uint8Array(readFileSync(p));
const fail = (msg: string): never => {
  console.log(`phase3:proof FAILED: ${msg}`);
  process.exit(1);
};
const same = (what: string, got: unknown, want: unknown) => {
  const [g, w] = [canon(got), canon(want)];
  console.log(`${what}: ${g.length > 80 ? g.slice(0, 77) + '...' : g} ${g === w ? '==' : '!='} ${w.length > 80 ? w.slice(0, 77) + '...' : w}`);
  if (g !== w) fail(`${what}\n  got  ${g}\n  want ${w}`);
};
/** Key-sorted JSON, so equality ignores key order. */
const canon = (v: unknown): string => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
const usd = (c: number) => `$${Math.trunc(c / 100)}.${String(Math.abs(c) % 100).padStart(2, '0')}`; // display only, integers in
const line = (s: Stat) => `${usd(s.raised)} in ${s.gifts} gifts from ${s.donors} donors, average ${s.average} r ${s.remainder} cents`;
const pick = ({ raised, gifts, donors, average, remainder }: Stat) => ({ raised, gifts, donors, average, remainder });

async function main() {
  const slug = `housefile-proof3-${Date.now().toString(36)}`;
  const org = await db.org.create({ data: { slug, name: 'Housefile (phase3:proof)' } });
  const user = await db.user.create({ data: { email: `${slug}@housefile.test`, name: 'phase3:proof' } });
  await db.membership.create({ data: { orgId: org.id, userId: user.id, role: 'owner' } });
  const orgId = org.id;
  const userId = user.id;
  const hash = async () => effectiveStateHash(await loadEffectiveState(db, orgId));
  const view = async () => rollups(await loadEffectiveState(db, orgId), AS_OF, await loadAppealCampaigns(db, orgId));

  const n = await seedFixtures(db, { orgId, userId, constituents: loadConstituents(bytes('fixtures/crm_constituents.csv')), gifts: phase3SeedGifts(), pledges: phase3Pledges(), softCredits: phase3SoftCredits() });
  console.log(`seed: org ${slug}: ${n.constituents} constituents, ${n.gifts} gifts, ${phase3Pledges().length} pledges, ${phase3SoftCredits().length} soft credits`);
  same('seed: stateHash == fixture in memory', await hash(), effectiveStateHash(phase3State()));

  const before = await view();
  console.log(`roll-ups (asOf ${AS_OF}): total ${line(before.total)}`);
  same('roll-ups: total == answers.json', before.total, answers.total);
  same('roll-ups: campaigns == answers.json', before.campaigns, answers.campaigns);
  same('roll-ups: funds == answers.json', Object.fromEntries(Object.entries(before.funds).map(([f, r]) => [f, pick(r)])), Object.fromEntries(Object.entries(answers.funds as Record<string, Stat>).map(([f, r]) => [f, pick(r)])));

  const segments: { key: string; definitionId: string }[] = [];
  for (const file of Object.keys(answers.segments).sort()) {
    const key = file.replace(/\.json$/, '');
    const s = await saveSegment(db, { orgId, userId, key, definition: JSON.parse(readFileSync(`segments/reference/${file}`, 'utf8')) });
    if (s.status === 'REFUSED') fail(`segment ${key}: ${s.code}`);
    segments.push({ key, definitionId: s.definitionId! });
    const r = await runSegment(db, { definitionId: s.definitionId!, userId, asOf: AS_OF });
    if (r.status !== 'RAN') fail(`segment ${key}: ${r.code}`);
    console.log(`segment ${key}: ${r.count} members, definitionHash ${r.definitionHash}, memberListHash ${r.memberListHash}`);
    same(`segment ${key}: members == answers.json`, { count: r.count, members: r.members }, { count: answers.segments[file].count, members: answers.segments[file].members });
  }

  const p = await previewBatch(db, { orgId, userId, fileName: 'fixtures/import_a.csv', bytes: bytes('fixtures/import_a.csv'), map: JSON.parse(readFileSync('import/maps/import_a.map.json', 'utf8')), asOf: AS_OF });
  const t = p.plan.totals;
  console.log(`A: preview ${p.batchId}: rows ${t.rows} = merged ${t.merged} + reviewed ${t.reviewed} + new ${t.new} + rejected ${t.rejected}; beforeHash ${p.beforeHash}; planHash ${p.planHash}`);
  same('A: beforeHash == seeded stateHash', p.beforeHash, await hash());
  const c = await commitBatch(db, { batchId: p.batchId, userId });
  if (c.status !== 'COMMITTED') fail(`A commit ${c.status} expected ${c.expected} actual ${c.actual}`);
  const w = c.written;
  console.log(`A: commit: constituents ${w.constituents}, versions ${w.versions}, gifts ${w.gifts} (+${w.giftsPending} waiting, ${w.giftsSkipped} skipped), merges ${w.mergeEvents}, review items ${w.reviewItems} over ${w.reviewRows} rows; stateHash ${await hash()}`);

  const after = await view();
  const waiting = new Set(p.plan.pending.map((x) => x.rowId));
  const planned = p.plan.gifts.filter((g) => !waiting.has(g.rowId)).reduce((s, g) => s + g.cents, 0);
  console.log(`roll-ups after A: total ${line(after.total)}`);
  same('roll-ups after A: raised moved by A\'s written gifts (cents)', after.total.raised - before.total.raised, planned);
  same('roll-ups after A: campaigns unchanged (imports never guessed into one)', after.campaigns, before.campaigns);
  for (const s of segments) {
    const r = await runSegment(db, { definitionId: s.definitionId, userId, asOf: AS_OF });
    if (r.status !== 'RAN') fail(`segment ${s.key} after A: ${r.code}`);
    console.log(`segment ${s.key} after A: ${r.count} members, memberListHash ${r.memberListHash}`);
  }

  const q = await queueLetters(db, { orgId, userId, asOf: AS_OF, combine: false });
  if (q.status !== 'QUEUED') fail(`letters: ${q.code}`);
  const letters = q.letters!;
  const lettered = letters.reduce((s, l) => s + l.totalCents, 0);
  console.log(`letters: ${letters.length} queued, Σ ${usd(lettered)}; outbox rows ${await db.outbox.count({ where: { orgId } })}`);
  same('letters: Σ cents == roll-up raised', lettered, after.total.raised);
  same('letters: one per active gift', letters.length, after.total.gifts);

  const target = await db.gift.findFirstOrThrow({ where: { orgId, importBatchId: p.batchId, status: 'ACTIVE', supersededBy: null, giftDate: { lte: new Date(`${AS_OF}T00:00:00Z`) } }, orderBy: { giftRef: 'asc' } });
  const covering = letters.filter((l) => l.giftRefs.includes(target.giftRef)).map((l) => l.letterRef);
  const k = await correctGift(db, { orgId, userId, giftRef: target.giftRef, reason: 'phase3:proof: keyed wrong', change: { amountCents: target.amountCents + 1234 } });
  if (k.status !== 'CORRECTED') fail(`correct ${target.giftRef}: ${k.code}`);
  console.log(`correct ${target.giftRef} (written by A): ${target.amountCents} -> ${target.amountCents + 1234} cents`);
  same(`correct: LETTER_STALE == the letter(s) covering ${target.giftRef}`, (await loadLetters(db, orgId)).filter((l) => l.status === 'LETTER_STALE').map((l) => l.letterRef), covering);
  same('correct: roll-up raised moved by exactly 1234', (await view()).total.raised - after.total.raised, 1234);

  const u = await undoBatch(db, { batchId: p.batchId, userId });
  if (u.status !== 'UNDONE') fail(`undo A: ${u.status} ${u.code ?? ''} expected ${u.expected ?? p.beforeHash} actual ${u.actual ?? ''}`);
  const v = u.reverted!;
  console.log(`undo A: retired ${v.constituentsRetired}, versions restored ${v.versionsRestored}, gifts voided ${v.giftsVoided}, merges reversed ${v.mergesReversed}`);
  same('undo A: stateHash == beforeHash', u.afterHash, p.beforeHash);
  same('undo A: roll-ups == answers.json again', { total: (await view()).total, campaigns: (await view()).campaigns }, { total: answers.total, campaigns: answers.campaigns });
  console.log('phase3:proof OK');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
