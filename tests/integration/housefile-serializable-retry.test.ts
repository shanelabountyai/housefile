// D-107 (2026-11-17, owner decision): every Serializable write in src/commit/ goes through one helper that retries a
// serialization failure (Prisma P2034, Postgres 40001) up to SERIAL_ATTEMPTS times. Found in CI on e9369b6: a commit
// in one org was cancelled by a concurrent gift correction in another org, and nothing retried it.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import type { PrismaClient } from '@/generated/prisma/client';
import { backoffMs, isSerializationFailure, SERIAL_ATTEMPTS, serializable } from '@/commit/serial';
import type { Tx } from '@/commit/db-state';
import { resetAuthTables } from '../helpers/auth';
import { makeOrg } from '../helpers/org';

beforeEach(resetAuthTables);

/** Both callers wait here until both have read, so their reads and writes interleave the same way every run. */
function barrier(parties = 2) {
  let n = 0;
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  return async () => {
    if (++n === parties) open();
    await gate;
  };
}

/**
 * Classic write skew across two orgs: each transaction reads one org's funds and inserts into the other's. Under
 * Serializable, Postgres must cancel one of them (40001), though no row is touched by both.
 */
async function writeSkew(run: (fn: (tx: Tx) => Promise<void>) => Promise<unknown>) {
  const a = await makeOrg('acme');
  const b = await makeOrg('globex');
  const wait = barrier();
  const results = await Promise.allSettled([
    run(async (tx) => {
      await tx.fund.count({ where: { orgId: a.id } });
      await wait();
      await tx.fund.create({ data: { orgId: b.id, code: 'FROM_A' } });
    }),
    run(async (tx) => {
      await tx.fund.count({ where: { orgId: b.id } });
      await wait();
      await tx.fund.create({ data: { orgId: a.id, code: 'FROM_B' } });
    }),
  ]);
  return { results, funds: await db.fund.count({ where: { orgId: { in: [a.id, b.id] } } }) };
}

describe('Serializable retry (D-107)', () => {
  it('control: without the helper, the write skew cancels one transaction with P2034', async () => {
    const { results, funds } = await writeSkew((fn) => db.$transaction(fn, { isolationLevel: 'Serializable' }));
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(isSerializationFailure((rejected[0] as PromiseRejectedResult).reason)).toBe(true);
    expect(funds).toBe(1);
  });

  it('with the helper, the same write skew completes: both transactions commit, nothing doubled', async () => {
    const { results, funds } = await writeSkew((fn) => serializable(db, fn));
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(funds).toBe(2);
  });

  it(`retries a serialization failure at most ${SERIAL_ATTEMPTS} attempts, and never retries anything else`, async () => {
    const p2034 = Object.assign(new Error('Transaction failed due to a write conflict or a deadlock'), { code: 'P2034' });
    const fake = (fail: number, error: Error) => {
      let calls = 0;
      const client = { $transaction: async (fn: (tx: Tx) => Promise<string>) => (++calls <= fail ? Promise.reject(error) : fn({} as Tx)) };
      return { client: client as unknown as PrismaClient, calls: () => calls };
    };
    const ok = fake(SERIAL_ATTEMPTS - 1, p2034);
    await expect(serializable(ok.client, async () => 'done')).resolves.toBe('done');
    expect(ok.calls()).toBe(SERIAL_ATTEMPTS);

    const exhausted = fake(SERIAL_ATTEMPTS, p2034);
    await expect(serializable(exhausted.client, async () => 'done')).rejects.toBe(p2034);
    expect(exhausted.calls()).toBe(SERIAL_ATTEMPTS);

    // the shape Prisma 7's pg adapter throws when COMMIT itself is cancelled (seen in the control test above)
    const atCommit = Object.assign(new Error('TransactionWriteConflict'), { name: 'DriverAdapterError', cause: { kind: 'TransactionWriteConflict' } });
    const commitTime = fake(1, atCommit);
    await expect(serializable(commitTime.client, async () => 'done')).resolves.toBe('done');
    expect(commitTime.calls()).toBe(2);

    const other = fake(1, new Error('Gift is append-only'));
    await expect(serializable(other.client, async () => 'done')).rejects.toThrow('Gift is append-only');
    expect(other.calls()).toBe(1);
  }, 15_000); // the exhausted case really waits out the backoff: up to ~2.3 s per run of attempts (D-108)

  it('backs off 50, 100, 200, 400, 800 ms with up to 50% jitter (D-108)', () => {
    expect([1, 2, 3, 4, 5].map((a) => backoffMs(a, () => 0))).toEqual([50, 100, 200, 400, 800]);
    expect([1, 2, 3, 4, 5].map((a) => backoffMs(a, () => 1))).toEqual([75, 150, 300, 600, 1200]);
  });

  it('every Serializable transaction in src/commit/ goes through the helper', () => {
    const dir = 'src/commit';
    const direct = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && f !== 'serial.ts')
      .flatMap((f) => readFileSync(join(dir, f), 'utf8').split('\n').map((line, i) => ({ at: `${dir}/${f}:${i + 1}`, line })))
      .filter(({ line }) => /isolationLevel\s*:\s*['"]Serializable['"]/.test(line.replace(/\/\/.*$/, '')))
      .map(({ at }) => at);
    expect(direct).toEqual([]);
  });
});
