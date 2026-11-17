// Task 3.3 (D-28, D-70, D-75): roll-ups on the database equal tools/phase3_answers.py on the seeded org; committing file A
// adds a (no appeal) row per fund equal to the plan's written gifts; undoing it voids them and the roll-ups come back.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { commitBatch } from '@/commit/commit';
import { loadAppealCampaigns, loadEffectiveState } from '@/commit/db-state';
import { previewBatch } from '@/commit/preview';
import { seedFixtures } from '@/commit/seed';
import { undoBatch } from '@/commit/undo';
import { NO_APPEAL, rollups } from '@/derive/rollups';
import { loadConstituents } from '@/import/crm';
import { resetAuthTables } from '../helpers/auth';
import { addMember, makeOrg } from '../helpers/org';
import { answers, phase3SeedGifts } from '../helpers/phase3';

beforeEach(resetAuthTables);
const SLOW = { timeout: 180_000 };
const bytes = (p: string) => new Uint8Array(readFileSync(p));

describe('rollups on the database (task 3.3)', () => {
  it('seeded org equals the oracle; file A adds (no appeal) per fund; undo drops it out', SLOW, async () => {
    const o = await makeOrg();
    const owner = await addMember(o.id, 'owner', 'owner@example.test');
    await seedFixtures(db, { orgId: o.id, userId: owner.id, constituents: loadConstituents(bytes('fixtures/crm_constituents.csv')), gifts: phase3SeedGifts() });
    const view = async () => rollups(await loadEffectiveState(db, o.id), answers.asOf, await loadAppealCampaigns(db, o.id));
    const activeCents = async () => (await db.gift.aggregate({ where: { orgId: o.id, status: 'ACTIVE', supersededBy: null }, _sum: { amountCents: true } }))._sum.amountCents;

    const before = await view();
    expect(before.campaigns).toEqual(answers.campaigns);
    expect(before.total).toEqual(answers.total);
    for (const [f, row] of Object.entries(answers.funds)) expect(before.funds[f]).toMatchObject(row as object);

    const p = await previewBatch(db, { orgId: o.id, userId: owner.id, fileName: 'fixtures/import_a.csv', bytes: bytes('fixtures/import_a.csv'), map: JSON.parse(readFileSync('import/maps/import_a.map.json', 'utf8')), asOf: answers.asOf });
    const c = await commitBatch(db, { batchId: p.batchId, userId: owner.id });
    expect(c.status).toBe('COMMITTED');
    expect(c.written.gifts).toBeGreaterThan(0);

    const after = await view();
    expect(after.campaigns).toEqual(before.campaigns); // imported gifts are never guessed into a campaign
    const waiting = new Set(p.plan.pending.map((x) => x.rowId));
    const planned: Record<string, number> = {};
    for (const g of p.plan.gifts) if (!waiting.has(g.rowId)) planned[g.fundCode] = (planned[g.fundCode] ?? 0) + g.cents;
    const noAppeal = Object.fromEntries(Object.entries(after.funds).flatMap(([f, row]) => (row.appeals[NO_APPEAL] ? [[f, row.appeals[NO_APPEAL].raised]] : [])));
    expect(noAppeal).toEqual(planned);
    expect(Object.values(after.funds).reduce((n, row) => n + (row.appeals[NO_APPEAL]?.gifts ?? 0), 0)).toBe(c.written.gifts);
    expect(after.total.raised).toBe(await activeCents());
    expect(after.total.raised - before.total.raised).toBe(Object.values(planned).reduce((a, b) => a + b, 0));

    expect((await undoBatch(db, { batchId: p.batchId, userId: owner.id })).status).toBe('UNDONE');
    expect(await view()).toEqual(before); // the voided rows drop out
    expect(before.total.raised).toBe(await activeCents());
  });
});
