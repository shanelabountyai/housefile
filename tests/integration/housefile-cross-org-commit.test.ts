// D-109 (owner decision 2026-11-18, option E + C): a large import commit in one org is not cancelled by a steady
// stream of small Serializable writes in another org. Reproduces the CI failure behind D-107/D-108 (e9369b6, 1fed53d,
// b83b7a4): with fixture-sized data both orgs' rows share the same index pages, so Serializable sees conflicts across
// orgs and a long commit loses every retry. Measured 2026-11-18 under this test: D-107's retry 0/3; raised
// max_pred_locks_* alone 0/3; 5 attempts with 100 ms..1.6 s back-off plus raised limits 0/10; D-108's 6 jittered
// attempts 0/5; one shared advisory lock plus retry 3/5 with default limits and 10/10 with raised ones.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { commitBatch } from '@/commit/commit';
import { previewBatch } from '@/commit/preview';
import { seedFixtures } from '@/commit/seed';
import { HOUSEFILE_WRITE_LOCK, serializable } from '@/commit/serial';
import { loadConstituents, loadGifts } from '@/import/crm';
import { resetAuthTables } from '../helpers/auth';
import { makeOrg } from '../helpers/org';

beforeEach(resetAuthTables);

const USER = '00000000-0000-4000-8000-000000000001';
const bytes = (p: string) => new Uint8Array(readFileSync(p));

describe('cross-org Serializable writes (D-109)', () => {
  it('server settings: predicate-lock limits are raised (C; CI sets them, docs/postgres-settings.md for any server)', async () => {
    const [row] = await db.$queryRaw<{ t: string; r: string }[]>`SELECT current_setting('max_pred_locks_per_transaction') AS t, current_setting('max_pred_locks_per_relation') AS r`;
    expect(Number(row!.t), 'max_pred_locks_per_transaction').toBeGreaterThanOrEqual(4096);
    expect(Number(row!.r), 'max_pred_locks_per_relation').toBeGreaterThanOrEqual(4096);
  });

  it('every serializable() body runs holding the one housefile write lock (E)', async () => {
    const held = await serializable(db, async (tx) => {
      const [r] = await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND granted AND classid = 0 AND objid = ${HOUSEFILE_WRITE_LOCK}::oid AND objsubid = 1`;
      return r!.n;
    });
    expect(HOUSEFILE_WRITE_LOCK).toBeTypeOf('number');
    expect(held).toBe(1);
  });

  it('commit A in one org completes while another org writes constituents the whole time', { timeout: 180_000 }, async () => {
    const a = await makeOrg('acme');
    await seedFixtures(db, { orgId: a.id, userId: USER, constituents: loadConstituents(bytes('fixtures/crm_constituents.csv')), gifts: loadGifts(bytes('fixtures/crm_gifts.csv')) });
    const map = JSON.parse(readFileSync('import/maps/import_a.map.json', 'utf8'));
    const { batchId } = await previewBatch(db, { orgId: a.id, userId: USER, fileName: 'fixtures/import_a.csv', bytes: bytes('fixtures/import_a.csv'), map, asOf: '2026-10-14' });
    const b = await makeOrg('globex');

    let done = false;
    let noise = 0;
    const writer = (async () => {
      // what a second user does on the CRM pages: read the org's records, then write one, again and again
      while (!done) {
        await serializable(db, async (tx) => {
          await tx.constituent.findMany({ where: { orgId: b.id }, select: { id: true } });
          await tx.constituentVersion.findMany({ where: { orgId: b.id }, select: { id: true } });
          const c = await tx.constituent.create({ data: { orgId: b.id, businessId: `N${String(++noise).padStart(5, '0')}` } });
          await tx.constituentVersion.create({ data: { orgId: b.id, constituentId: c.id, version: 1, firstName: 'Noise', userId: USER } });
        });
      }
    })();

    const result = await commitBatch(db, { batchId, userId: USER }).finally(() => {
      done = true;
    });
    await writer;
    expect(result.status).toBe('COMMITTED');
    expect(noise).toBeGreaterThan(0); // the other org really was writing during the commit
  });
});
