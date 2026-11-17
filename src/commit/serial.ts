// D-107 (owner decision 2026-11-17): the one way src/commit/ opens a Serializable transaction. Postgres may cancel a
// Serializable transaction that conflicts with a concurrent one (SQLSTATE 40001, Prisma P2034), even across orgs; this
// runs it again, up to SERIAL_ATTEMPTS times in all. A retry is safe because every body here is all-or-nothing and
// re-reads its own preconditions (ALREADY_COMMITTED, PLAN_TAMPERED, STATE_MOVED, ROW_DECIDED, …), so a second attempt
// either writes exactly what the first would have or refuses cleanly. Any other error is thrown at once, untouched.
import type { PrismaClient } from '@/generated/prisma/client';
import type { Tx } from './db-state';

export const SERIAL_ATTEMPTS = 3;
const BACKOFF_MS = 25; // × attempt number: 25 ms, then 50 ms

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
      await new Promise((r) => setTimeout(r, BACKOFF_MS * attempt));
    }
  }
}
