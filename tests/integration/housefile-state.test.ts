// Task 2.2: the effective-state hash (D-11) is one shape for the in-memory fixture and the database, and the
// fixture seed is idempotent. The hash excludes row ids, createdAt and batch ids, retired constituents and
// superseded gifts, so a commit followed by its undo can hash equal (D-13).
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/core/db';
import { loadEffectiveState } from '@/commit/db-state';
import { seedFixtures } from '@/commit/seed';
import { effectiveStateHash, fixtureState } from '@/commit/state';
import { loadConstituents, loadGifts } from '@/import/crm';
import { resetAuthTables } from '../helpers/auth';
import { makeOrg } from '../helpers/org';

beforeEach(resetAuthTables);

const USER = '00000000-0000-4000-8000-000000000001';
const crm = loadConstituents(new Uint8Array(readFileSync('fixtures/crm_constituents.csv')));
const gifts = loadGifts(new Uint8Array(readFileSync('fixtures/crm_gifts.csv')));
const FULL = { constituents: 286, households: 236, funds: 3, campaigns: 4, appeals: 9, versions: 286, gifts: 878 };
const NONE = { constituents: 0, households: 0, funds: 0, campaigns: 0, appeals: 0, versions: 0, gifts: 0 };

describe('effective state and seed (task 2.2, D-11)', () => {
  it('the seeded org hashes equal to the fixture loaded in memory', async () => {
    const org = await makeOrg();
    expect(await seedFixtures(db, { orgId: org.id, userId: USER, constituents: crm, gifts })).toEqual(FULL);
    const expected = fixtureState(crm, gifts);
    const state = await loadEffectiveState(db, org.id);
    expect(state.constituents.length).toBe(286);
    expect(state.gifts.length).toBe(878);
    expect(state).toEqual(expected);
    expect(effectiveStateHash(state)).toBe(effectiveStateHash(expected));
  });

  it('a second seed writes 0 rows', async () => {
    const org = await makeOrg();
    await seedFixtures(db, { orgId: org.id, userId: USER, constituents: crm, gifts });
    const before = await db.constituentVersion.count();
    expect(await seedFixtures(db, { orgId: org.id, userId: USER, constituents: crm, gifts })).toEqual(NONE);
    expect(await db.constituentVersion.count()).toBe(before);
    expect(await db.gift.count()).toBe(878);
  });

  it('refuses when NODE_ENV=production', async () => {
    const org = await makeOrg();
    vi.stubEnv('NODE_ENV', 'production');
    try {
      await expect(seedFixtures(db, { orgId: org.id, userId: USER, constituents: crm, gifts })).rejects.toThrow(/production/);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(await db.constituent.count()).toBe(0);
  });

  it('the hash ignores order and excludes retired constituents and superseded gifts', async () => {
    const full = fixtureState(crm, gifts);
    const shuffled = { constituents: [...full.constituents].reverse(), gifts: [...full.gifts].reverse(), softCredits: [] };
    expect(effectiveStateHash(shuffled)).toBe(effectiveStateHash(full));
    const oneCent = { ...full, gifts: full.gifts.map((g) => (g.giftRef === 'G00001' ? { ...g, amountCents: g.amountCents + 1 } : g)) };
    expect(effectiveStateHash(oneCent)).not.toBe(effectiveStateHash(full));

    const org = await makeOrg();
    await seedFixtures(db, { orgId: org.id, userId: USER, constituents: crm, gifts });
    const c1 = await db.constituent.findUniqueOrThrow({ where: { orgId_businessId: { orgId: org.id, businessId: 'C0001' } } });
    const v1 = await db.constituentVersion.findUniqueOrThrow({ where: { constituentId_version: { constituentId: c1.id, version: 1 } } });
    await db.constituentVersion.create({ data: { ...v1, id: undefined, createdAt: undefined, fieldMeta: v1.fieldMeta ?? {}, aliases: v1.aliases ?? [], alternates: v1.alternates ?? [], version: 2, status: 'RETIRED' } });
    const g1 = await db.gift.findFirstOrThrow({ where: { orgId: org.id, giftRef: 'G00001' } });
    await db.gift.create({ data: { ...g1, id: undefined, createdAt: undefined, supersedesGiftId: g1.id, status: 'VOIDED', reason: 'test' } });

    const expected = { ...full, constituents: full.constituents.filter((c) => c.id !== 'C0001'), gifts: full.gifts.filter((g) => g.giftRef !== 'G00001') };
    expect(effectiveStateHash(await loadEffectiveState(db, org.id))).toBe(effectiveStateHash(expected));
  });
});
