// Task 3.2 (D-8): a SAME_HOUSEHOLD review decision changes the target household's derived name and total; undoing its
// batch restores both, and the state hash with them.
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { loadEffectiveState } from '@/commit/db-state';
import { decideReview } from '@/commit/review';
import { effectiveStateHash } from '@/commit/state';
import { undoBatch } from '@/commit/undo';
import { householdGiving, householdMembers, householdName } from '@/derive/households';
import { resetAuthTables } from '../helpers/auth';
import { smallOrg } from '../helpers/housefile';

beforeEach(resetAuthTables);
const SLOW = { timeout: 120_000 };

describe('households on the database (task 3.2)', () => {
  it('SAME_HOUSEHOLD moves the name and total; undoing the batch restores both', SLOW, async () => {
    const t = await smallOrg(
      'C0002,Mary,,Smith,,mary@example.com,,40 Pine Rd,,Tulsa,OK,74105,,H0002,2025-06-01\n',
      'G00001,C0002,2024-02-07,250000,BLDG,AF2024,Year-End 2024,GIFT,CHK1\n',
    );
    const view = async () => {
      const s = await loadEffectiveState(db, t.orgId);
      return { name: householdName(householdMembers(s, 'H0002')), cents: householdGiving(s, 'H0002'), hash: effectiveStateHash(s) };
    };
    const before = await view();
    expect(before).toMatchObject({ name: 'The Smith Household', cents: 250000 });

    const { batchId, rowsOpen } = await t.run('John,Whitfield,,mary@example.com,,40 Pine Rd,,Tulsa,OK,74105,,2026-02-02,40.00\n');
    expect(rowsOpen).toHaveLength(1);
    const r = await decideReview(db, { itemId: rowsOpen[0]!.items[0]!.id, action: 'SAME_HOUSEHOLD', userId: t.owner.id });
    expect(r.status).toBe('DECIDED');
    expect(await view()).toMatchObject({ name: 'Mary Smith and John Whitfield', cents: 254000 });

    expect((await undoBatch(db, { batchId, userId: t.owner.id })).status).toBe('UNDONE');
    expect(await view()).toEqual(before);
  });
});
