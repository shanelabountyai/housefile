// D-107 (owner decision 2026-11-17): the one way src/commit/ opens a Serializable transaction. Postgres may cancel a
// Serializable transaction that conflicts with a concurrent one (SQLSTATE 40001, Prisma P2034), even across orgs; this
// runs it again, up to SERIAL_ATTEMPTS times in all. A retry is safe because every body here is all-or-nothing and
// re-reads its own preconditions (ALREADY_COMMITTED, PLAN_TAMPERED, STATE_MOVED, ROW_DECIDED, …), so a second attempt
// either writes exactly what the first would have or refuses cleanly. Any other error is thrown at once, untouched.
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

export async function serializable<T>(db: PrismaClient, fn: (tx: Tx) => Promise<T>, opts: { timeout?: number } = {}): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.$transaction(fn, { ...opts, isolationLevel: 'Serializable' });
    } catch (e) {
      if (attempt >= SERIAL_ATTEMPTS || !isSerializationFailure(e)) throw e;
      await new Promise((r) => setTimeout(r, backoffMs(attempt)));
    }
  }
}
