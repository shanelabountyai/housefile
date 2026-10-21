// `npm run db:seed:fixtures` / `db:seed:fixtures:test` (task 2.2): the CRM fixture into the org `housefile`,
// written by the user seed@housefile.test (owner of that org, so the Phase 2 CLIs have an actor). Idempotent;
// refuses in production. Prints the row counts and the effective-state hash of the org.
import { readFileSync } from 'node:fs';
import { db } from '@/core/db'; // importing it is what refuses a cloud database (INV-18)
import { loadEffectiveState } from '@/commit/db-state';
import { seedFixtures } from '@/commit/seed';
import { effectiveStateHash } from '@/commit/state';
import { loadConstituents, loadGifts } from '@/import/crm';

export const FIXTURE_ORG_SLUG = 'housefile';
export const SEED_USER_EMAIL = 'seed@housefile.test';

async function main() {
  const org = await db.org.upsert({ where: { slug: FIXTURE_ORG_SLUG }, create: { slug: FIXTURE_ORG_SLUG, name: 'Housefile (fixtures)' }, update: {} });
  const user = await db.user.upsert({ where: { email: SEED_USER_EMAIL }, create: { email: SEED_USER_EMAIL, name: 'Fixture seed' }, update: {} });
  await db.membership.upsert({ where: { orgId_userId: { orgId: org.id, userId: user.id } }, create: { orgId: org.id, userId: user.id, role: 'owner' }, update: {} });
  const constituents = loadConstituents(new Uint8Array(readFileSync('fixtures/crm_constituents.csv')));
  const gifts = loadGifts(new Uint8Array(readFileSync('fixtures/crm_gifts.csv')));
  const n = await seedFixtures(db, { orgId: org.id, userId: user.id, constituents, gifts });
  console.log(`org ${FIXTURE_ORG_SLUG} (${org.id}) seeded by ${SEED_USER_EMAIL}: ${Object.entries(n).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`effectiveStateHash ${effectiveStateHash(await loadEffectiveState(db, org.id))}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
