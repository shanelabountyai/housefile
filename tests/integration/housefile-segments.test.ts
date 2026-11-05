// Task 3.4 (D-27, D-68, D-76): saved segments on the database. Each reference segment saved and run on the seeded Phase 3
// org equals tools/phase3_answers.py; two runs of one version at one asOf give the same member-list hash; refusals carry
// a code and write nothing; versions and runs are append-only.
import { readdirSync, readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { runSegment, saveSegment } from '@/commit/segments';
import { seedFixtures } from '@/commit/seed';
import { loadConstituents } from '@/import/crm';
import { resetAuthTables } from '../helpers/auth';
import { addMember, makeOrg } from '../helpers/org';
import { answers, phase3SeedGifts } from '../helpers/phase3';

beforeEach(resetAuthTables);
const SLOW = { timeout: 180_000 };
const bytes = (p: string) => new Uint8Array(readFileSync(p));
const ref = (f: string) => JSON.parse(readFileSync(`segments/reference/${f}`, 'utf8'));

describe('segments on the database (task 3.4)', () => {
  it('reference segments saved and run equal the oracle; reruns reproduce the hash; versions append', SLOW, async () => {
    const o = await makeOrg();
    const owner = await addMember(o.id, 'owner', 'owner@example.test');
    await seedFixtures(db, { orgId: o.id, userId: owner.id, constituents: loadConstituents(bytes('fixtures/crm_constituents.csv')), gifts: phase3SeedGifts() });

    for (const f of readdirSync('segments/reference').sort()) {
      const s = await saveSegment(db, { orgId: o.id, userId: owner.id, key: f.replace(/\.json$/, ''), definition: ref(f) });
      expect(s).toMatchObject({ status: 'SAVED', version: 1 });
      const r1 = await runSegment(db, { definitionId: s.definitionId!, userId: owner.id, asOf: answers.asOf });
      const r2 = await runSegment(db, { definitionId: s.definitionId!, userId: owner.id, asOf: answers.asOf });
      expect(r1).toMatchObject({ status: 'RAN', count: answers.segments[f].count, members: answers.segments[f].members, definitionHash: s.definitionHash });
      expect(r2.memberListHash).toBe(r1.memberListHash);
      expect(r2.runId).not.toBe(r1.runId);
      const stored = await db.segmentRun.findUniqueOrThrow({ where: { id: r1.runId! } });
      expect({ count: stored.count, members: stored.members, hash: stored.memberListHash }).toEqual({ count: r1.count, members: r1.members, hash: r1.memberListHash });
    }

    const key = 'lybunt';
    expect(await saveSegment(db, { orgId: o.id, userId: owner.id, key, definition: ref('lybunt.json') })).toMatchObject({ status: 'UNCHANGED', version: 1 });
    const v2 = await saveSegment(db, { orgId: o.id, userId: owner.id, key, definition: { ...ref('lybunt.json'), filters: [...ref('lybunt.json').filters, { field: 'state', op: 'eq', value: 'CO' }] } });
    expect(v2).toMatchObject({ status: 'SAVED', version: 2 });
    expect(await db.segmentDefinition.count({ where: { orgId: o.id, key } })).toBe(2);
    expect(await db.auditEvent.count({ where: { orgId: o.id, action: 'segment.save' } })).toBe(7);
  });

  it('refusals carry a code and write nothing; versions and runs are append-only', SLOW, async () => {
    const o = await makeOrg();
    const owner = await addMember(o.id, 'owner', 'owner@example.test');
    const member = await addMember(o.id, 'member', 'member@example.test');
    const save = (definition: unknown, userId = owner.id, key = 'k') => saveSegment(db, { orgId: o.id, userId, key, definition });
    expect(await save({ name: 'x', filters: [{ field: 'favouriteColour', op: 'eq', value: 'red' }] })).toMatchObject({ status: 'REFUSED', code: 'UNKNOWN_FIELD' });
    expect(await save({ name: 'x', filters: [{ field: 'state', op: 'like', value: 'C%' }] })).toMatchObject({ status: 'REFUSED', code: 'UNKNOWN_OP' });
    expect(await save(ref('lybunt.json'), owner.id, 'Bad Key')).toMatchObject({ status: 'REFUSED', code: 'BAD_KEY' });
    expect(await save(ref('lybunt.json'), member.id)).toMatchObject({ status: 'REFUSED', code: 'FORBIDDEN' });
    expect(await db.segmentDefinition.count()).toBe(0);

    const s = await save(ref('lybunt.json'));
    expect(await runSegment(db, { definitionId: s.definitionId!, userId: member.id, asOf: answers.asOf })).toMatchObject({ status: 'REFUSED', code: 'FORBIDDEN' });
    expect(await runSegment(db, { definitionId: s.definitionId!, userId: owner.id, asOf: '10/14/2026' })).toMatchObject({ status: 'REFUSED', code: 'BAD_AS_OF' });
    expect(await db.segmentRun.count()).toBe(0);
    const r = await runSegment(db, { definitionId: s.definitionId!, userId: owner.id, asOf: answers.asOf });
    expect(r).toMatchObject({ status: 'RAN', count: 0 }); // an empty org has no donors
    await expect(db.$executeRawUnsafe(`UPDATE "SegmentDefinition" SET "version" = 9 WHERE "id" = '${s.definitionId}'`)).rejects.toThrow(/append-only/);
    await expect(db.$executeRawUnsafe(`DELETE FROM "SegmentRun" WHERE "id" = '${r.runId}'`)).rejects.toThrow(/append-only/);
  });
});
