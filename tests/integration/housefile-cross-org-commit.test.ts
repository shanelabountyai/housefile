// D-109 (owner decision 2026-11-18): a large import commit in one org is not cancelled by a steady stream of small
// writes in another org. Reproduces the CI failure behind D-107/D-108 (e9369b6, 1fed53d, b83b7a4): with fixture-sized
// data both orgs' rows share the same index pages, so Serializable saw conflicts across orgs and a long commit lost
// every retry. Measured 2026-11-18 under this test: D-107's retry 0/3; raised max_pred_locks_* alone 0/3; 5 attempts
// with 100 ms..1.6 s back-off plus raised limits 0/10; D-108's 6 jittered attempts 0/5; lock + Serializable 7/10;
// lock + Read Committed (serialWrite as built) 10/10, with Postgres's default limits.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { commitBatch } from '@/commit/commit';
import { previewBatch } from '@/commit/preview';
import { seedFixtures } from '@/commit/seed';
import { HOUSEFILE_WRITE_LOCK, serialWrite } from '@/commit/serial';
import { loadConstituents, loadGifts } from '@/import/crm';
import { resetAuthTables } from '../helpers/auth';
import { makeOrg } from '../helpers/org';

beforeEach(resetAuthTables);

const USER = '00000000-0000-4000-8000-000000000001';
const bytes = (p: string) => new Uint8Array(readFileSync(p));

describe('cross-org writes (D-109)', () => {
  it('every serialWrite() body runs holding the one housefile write lock, at Read Committed', async () => {
    const seen = await serialWrite(db, async (tx) => {
      const [r] = await tx.$queryRaw<{ n: number; iso: string }[]>`SELECT (SELECT count(*)::int FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND granted AND classid = 0 AND objid = ${HOUSEFILE_WRITE_LOCK}::oid AND objsubid = 1) AS n, current_setting('transaction_isolation') AS iso`;
      return r!;
    });
    expect(HOUSEFILE_WRITE_LOCK).toBeTypeOf('number');
    expect(seen).toEqual({ n: 1, iso: 'read committed' });
  });

  it('two writers never overlap: the second starts only after the first has committed', async () => {
    const log: string[] = [];
    const writer = (name: string, holdMs: number) =>
      serialWrite(db, async () => {
        log.push(`${name} in`);
        await new Promise((r) => setTimeout(r, holdMs));
        log.push(`${name} out`);
      });
    await Promise.all([writer('first', 300), new Promise((r) => setTimeout(r, 50)).then(() => writer('second', 0))]);
    expect(log).toEqual(['first in', 'first out', 'second in', 'second out']);
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
        await serialWrite(db, async (tx) => {
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
