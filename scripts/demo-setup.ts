// `npm run demo:setup` (task 3.11, docs/DEMO.md): the org `demo` as e2e/crm-pages.spec.ts seeds it. CRM constituents,
// the Phase 3 gifts (corrections applied), pledges and soft credits, the six reference segments, and two /demo accounts:
// a scorekeeper (results.write) and a read-only member. The owner is the seed actor only, never listed on /demo
// (an owner must be TOTP-enrolled to sign in). Idempotent (seedFixtures skips a seeded
// org, saveSegment answers UNCHANGED). Synthetic data only; seedFixtures refuses in production and `@/core/db` refuses a
// cloud database.
import { readFileSync } from 'node:fs';
import { db } from '@/core/db';
import { loadEffectiveState } from '@/commit/db-state';
import { seedFixtures } from '@/commit/seed';
import { saveSegment } from '@/commit/segments';
import { effectiveStateHash } from '@/commit/state';
import { loadConstituents } from '@/import/crm';
import { phase3Pledges, phase3SeedGifts, phase3SoftCredits } from '../tests/helpers/phase3';

const SLUG = process.argv[2] ?? 'demo'; // rows are append-only, so a fresh run takes a fresh slug: `npm run demo:setup -- demo2`
const SEGMENTS = ['colorado-households', 'lapsed-repeat', 'lybunt', 'major-2025', 'south-central-2026', 'sybunt'];
const USERS = [['owner', 'owner@housefile.demo.test'], ['scorekeeper', 'scorekeeper@housefile.demo.test'], ['member', 'member@housefile.demo.test']] as const;

async function main() {
  const org = await db.org.upsert({ where: { slug: SLUG }, create: { slug: SLUG, name: `Housefile demo ${SLUG} (synthetic)` }, update: {} });
  const ids: Record<string, string> = {};
  for (const [role, email] of USERS) {
    const u = await db.user.upsert({ where: { email }, create: { email, name: `${role[0]!.toUpperCase()}${role.slice(1)} (demo)`, isDemo: role !== 'owner' }, update: { isDemo: role !== 'owner' } });
    await db.membership.upsert({ where: { orgId_userId: { orgId: org.id, userId: u.id } }, create: { orgId: org.id, userId: u.id, role }, update: { role } });
    ids[role] = u.id;
  }
  const n = await seedFixtures(db, { orgId: org.id, userId: ids.owner!, constituents: loadConstituents(new Uint8Array(readFileSync('fixtures/crm_constituents.csv'))), gifts: phase3SeedGifts(), pledges: phase3Pledges(), softCredits: phase3SoftCredits() });
  for (const key of SEGMENTS) {
    const r = await saveSegment(db, { orgId: org.id, userId: ids.owner!, key, definition: JSON.parse(readFileSync(`segments/reference/${key}.json`, 'utf8')) });
    if (r.status === 'REFUSED') throw new Error(`segment ${key}: ${r.code}`);
  }
  console.log(`org ${SLUG}: ${n.constituents ? `seeded ${n.constituents} constituents, ${n.gifts} gifts, ${n.pledges} pledges, ${n.softCredits} soft credits` : 'already seeded'}; ${SEGMENTS.length} segments saved`);
  console.log(`effectiveStateHash ${effectiveStateHash(await loadEffectiveState(db, org.id))}`);
  for (const [role, email] of USERS.slice(1)) console.log(`/demo account: ${email}  ${role}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
