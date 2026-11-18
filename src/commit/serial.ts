// D-107, D-108, D-109: the one way src/commit/ opens a write transaction. D-109 (owner decision 2026-11-18): every
// body runs holding one advisory lock, so housefile writes run one at a time across all orgs, at Read Committed. The
// lock is what makes the writes serial, so Serializable (D-107) is no longer needed and is not used: one writer at a
// time, each statement reading everything committed before it, and nothing else writing these tables (write:lint keeps
// housefile writes inside src/commit/, and every write transaction there goes through serialWrite). Under Serializable
// the lock could not do this: Postgres fixes a Serializable transaction's snapshot at its first statement, the lock
// statement, before the wait, so a writer that waited began with stale data and was cancelled (stress test 7/10).
// The retry (D-107/D-108) stays for a serialization failure that should no longer occur; a retry is safe because every
// body is all-or-nothing and re-reads its own preconditions (ALREADY_COMMITTED, PLAN_TAMPERED, STATE_MOVED, …).
import type { PrismaClient } from '@/generated/prisma/client';
import type { Tx } from './db-state';

// D-108: 3 attempts 25/50 ms apart were all cancelled in CI on b83b7a4 (an import commit is ~1.3 s long and a
// concurrent writer kept it the pivot). Six attempts, the wait doubling from 50 ms with up to 50% jitter so two
// retrying transactions stop re-colliding in step: about 1.55 s of waiting in the worst case, then the error is thrown.
export const SERIAL_ATTEMPTS = 6;
const BACKOFF_BASE_MS = 50;

/** The wait before attempt `attempt + 1`: 50, 100, 200, 400, 800 ms, each plus up to 50% jitter. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = BACKOFF_BASE_MS * 2 ** (attempt - 1);
  return Math.round(base + base * 0.5 * random());
}

/**
 * The three shapes a serialization failure takes in Prisma 7 with the pg driver adapter: P2034 when a query is
 * cancelled; a bare DriverAdapterError whose cause is `{ kind: 'TransactionWriteConflict' }` when COMMIT itself is
 * cancelled (found by the control test, not documented); and a raw query's 40001 / "could not serialize access".
 */
export function isSerializationFailure(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  if ((e as { code?: unknown }).code === 'P2034') return true;
  if ((e as { cause?: { kind?: unknown } }).cause?.kind === 'TransactionWriteConflict') return true;
  const message = e instanceof Error ? e.message : '';
  return /^TransactionWriteConflict$|\b40001\b|could not serialize access/.test(message);
}

// One lock, taken by every writer as its first statement, so no two housefile writers can deadlock on it. 'Hous' in
// ASCII; shows in pg_locks as classid 0, objid this. Measured under tests/integration/housefile-cross-org-commit.test.ts
// (an import commit while another org writes nonstop): D-108 alone 0/5; lock + Serializable 7/10; lock + Read
// Committed 10/10, with Postgres's default predicate-lock limits.
export const HOUSEFILE_WRITE_LOCK = 0x486f7573;
const DEFAULT_TIMEOUT_MS = 30_000; // Prisma's 5 s default would count the wait behind an import commit against small writes

export async function serialWrite<T>(db: PrismaClient, fn: (tx: Tx) => Promise<T>, opts: { timeout?: number } = {}): Promise<T> {
  const locked = async (tx: Tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${HOUSEFILE_WRITE_LOCK}::bigint)::text`;
    return fn(tx);
  };
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.$transaction(locked, { timeout: DEFAULT_TIMEOUT_MS, ...opts, isolationLevel: 'ReadCommitted' });
    } catch (e) {
      if (attempt >= SERIAL_ATTEMPTS || !isSerializationFailure(e)) throw e;
      await new Promise((r) => setTimeout(r, backoffMs(attempt)));
    }
  }
}
