// Task 2.7 (D-24, D-46, D-48, D-62): unmerge restores both records to their MergeEvent snapshots, proven by hash;
// a row merge splits the row back out as a new constituent with its gift; a later merge on either record blocks it.
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { loadEffectiveConstituent, loadEffectiveState } from '@/commit/db-state';
import { mergeConstituents } from '@/commit/merge';
import { snapshotHash, unmerge } from '@/commit/unmerge';
import { allTables, resetAuthTables } from '../helpers/auth';
import { ROBERT, smallOrg, tableCounts } from '../helpers/housefile';

beforeEach(resetAuthTables);
const SLOW = { timeout: 120_000 };

describe('unmerge (task 2.7)', () => {
  it('a row merge: the survivor hashes equal to its snapshot, the row comes back as a new constituent with its gift', SLOW, async () => {
    const t = await smallOrg(ROBERT, 'G00001,C0001,2024-02-07,250000,BLDG,AF2024,Year-End 2024,GIFT,CHK1\n');
    const { committed } = await t.run('Robert,Johnson,,robert.johnson@example.com,918-555-0177,12 Oak St,,Tulsa,OK,74105,,2026-02-20,10.00\n');
    expect(committed.written.mergeEvents).toBe(1);
    const merge = await db.mergeEvent.findFirstOrThrow();
    expect((await t.effective('C0001')).phone).toBe('918-555-0177'); // S2 landed
    const r = await unmerge(db, { mergeEventId: merge.id, userId: t.owner.id, reason: 'wrong auto-merge' });
    expect(r.status).toBe('UNMERGED');
    const survivor = await loadEffectiveConstituent(db, merge.survivorId);
    expect(snapshotHash(survivor)).toBe(snapshotHash(merge.survivorSnapshot as typeof survivor));
    expect(survivor.constituent.phone).toBe('(918) 555-0142');
    expect(survivor.giftRefs).toEqual(['G00001']);
    const split = await loadEffectiveConstituent(db, r.loserId!);
    expect(split.constituent).toMatchObject({ firstName: 'Robert', lastName: 'Johnson', phone: '918-555-0177', email: 'robert.johnson@example.com' });
    expect(split.giftRefs).toEqual(['G00002']); // the row's gift, moved back out by a superseding row (same giftRef)
    expect(await db.gift.count({ where: { giftRef: 'G00002' } })).toBe(2);
    const state = await loadEffectiveState(db, t.orgId);
    expect(state.constituents.map((c) => c.id).sort()).toEqual(['C0001', split.constituent.id]);
    const ev = await db.unmergeEvent.findUniqueOrThrow({ where: { mergeEventId: merge.id } });
    expect(ev).toMatchObject({ survivorHash: snapshotHash(survivor), loserHash: snapshotHash(split), userId: t.owner.id, reason: 'wrong auto-merge' });
    expect((await unmerge(db, { mergeEventId: merge.id, userId: t.owner.id })).code).toBe('ALREADY_UNMERGED');
  });

  it('a constituent merge: both records hash equal to their snapshots, gifts move back, loser active again', SLOW, async () => {
    const t = await smallOrg(
      ROBERT + 'C0002,Bob,J,Johnson,,bob@example.com,,900 Elm Dr,,Denver,CO,80202,,H0002,2025-09-01\n',
      'G00001,C0001,2024-02-07,250000,BLDG,AF2024,Year-End 2024,GIFT,CHK1\nG00002,C0002,2025-10-01,5000,GEN,AF2025,Gala 2025,GIFT,\n',
    );
    const a = await t.byBiz('C0001');
    const b = await t.byBiz('C0002');
    const before = { a: await loadEffectiveConstituent(db, a.id), b: await loadEffectiveConstituent(db, b.id) };
    const m = await mergeConstituents(db, { aId: a.id, bId: b.id, userId: t.owner.id, reason: 'same donor' });
    expect(m.status).toBe('MERGED');
    expect((await loadEffectiveState(db, t.orgId)).constituents.map((c) => c.id)).toEqual(['C0001']);
    const r = await unmerge(db, { mergeEventId: m.mergeEventId!, userId: t.owner.id });
    expect(r.status).toBe('UNMERGED');
    const after = { a: await loadEffectiveConstituent(db, a.id), b: await loadEffectiveConstituent(db, b.id) };
    expect(snapshotHash(after.a)).toBe(snapshotHash(before.a));
    expect(snapshotHash(after.b)).toBe(snapshotHash(before.b));
    expect(after.b.status).toBe('ACTIVE');
    expect(after.b.giftRefs).toEqual(['G00002']);
    expect(after.a.giftRefs).toEqual(['G00001']);
    const state = await loadEffectiveState(db, t.orgId);
    expect(state.constituents.map((c) => c.id)).toEqual(['C0001', 'C0002']);
    expect(state.gifts.map((g) => [g.giftRef, g.constituent])).toEqual([['G00001', 'C0001'], ['G00002', 'C0002']]);
  });

  it('UNMERGE_BLOCKED when a later merge touched either record, writing 0 rows; reversible in reverse order', SLOW, async () => {
    const t = await smallOrg(
      ROBERT + 'C0002,Bob,,Johnson,,bob@example.com,,900 Elm Dr,,Denver,CO,80202,,H0002,2025-09-01\nC0003,Rob,,Johnson,,rob@example.com,,1 Pine Rd,,Austin,TX,78745,,H0003,2025-10-01\n',
    );
    const [a, b, c] = await Promise.all([t.byBiz('C0001'), t.byBiz('C0002'), t.byBiz('C0003')]);
    const m1 = await mergeConstituents(db, { aId: a.id, bId: b.id, userId: t.owner.id, reason: 'first' });
    const m2 = await mergeConstituents(db, { aId: a.id, bId: c.id, userId: t.owner.id, reason: 'second' });
    const counts = await tableCounts(await allTables());
    const blocked = await unmerge(db, { mergeEventId: m1.mergeEventId!, userId: t.owner.id });
    expect(blocked.code).toBe('UNMERGE_BLOCKED');
    expect(await tableCounts(await allTables())).toEqual(counts);
    expect((await unmerge(db, { mergeEventId: m2.mergeEventId!, userId: t.owner.id })).status).toBe('UNMERGED');
    expect((await unmerge(db, { mergeEventId: m1.mergeEventId!, userId: t.owner.id })).status).toBe('UNMERGED'); // m2 is reversed, so it no longer blocks
    const state = await loadEffectiveState(db, t.orgId);
    expect(state.constituents.map((x) => x.id)).toEqual(['C0001', 'C0002', 'C0003']);
    expect((await unmerge(db, { mergeEventId: '00000000-0000-4000-8000-000000000009', userId: t.owner.id })).code).toBe('NOT_FOUND');
  });
});
