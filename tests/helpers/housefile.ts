// A small org seeded from inline CSV, previewed and committed from inline rows: the Phase 2 integration tests' bench.
import { expect } from 'vitest';
import { db } from '@/core/db';
import { commitBatch } from '@/commit/commit';
import { loadEffectiveConstituent } from '@/commit/db-state';
import { previewBatch } from '@/commit/preview';
import { listReview } from '@/commit/review';
import { seedFixtures } from '@/commit/seed';
import { loadConstituents, loadGifts } from '@/import/crm';
import { addMember, makeOrg } from './org';

export const enc = (s: string) => new TextEncoder().encode(s);
export const CRM_HEAD = 'constituent_id,first_name,middle_name,last_name,suffix,email,phone,address_line1,address_line2,city,state,zip,dob,household_id,created_at\n';
export const GIFT_HEAD = 'gift_id,constituent_id,gift_date,amount_cents,fund,campaign,appeal,gift_type,external_ref\n';
export const ROW_HEAD = 'First,Last,Suffix,Email,Phone,Street,Unit,City,ST,Zip,DOB,Gift Date,Amount\n';
export const MAP = { first: 'First', last: 'Last', suffix: 'Suffix', email: 'Email', phone: 'Phone', line1: 'Street', line2: 'Unit', city: 'City', state: 'ST', zip: 'Zip', dob: 'DOB', gift_date: 'Gift Date', amount: 'Amount' };
export const ROBERT = 'C0001,Robert,,Johnson,,robert.johnson@example.com,(918) 555-0142,12 Oak St,,Tulsa,OK,74105,1961-03-09,H0001,2025-06-01\n';

export async function smallOrg(crmRows: string, giftRows = '') {
  const o = await makeOrg();
  const owner = await addMember(o.id, 'owner', 'owner@example.test');
  await seedFixtures(db, { orgId: o.id, userId: owner.id, constituents: loadConstituents(enc(CRM_HEAD + crmRows)), gifts: loadGifts(enc(GIFT_HEAD + giftRows)) });
  const preview = (rows: string, fileName = 'import_x.csv') => previewBatch(db, { orgId: o.id, userId: owner.id, fileName, bytes: enc(ROW_HEAD + rows), map: MAP, asOf: '2026-10-14' });
  const run = async (rows: string, fileName = 'import_x.csv') => {
    const p = await preview(rows, fileName);
    const c = await commitBatch(db, { batchId: p.batchId, userId: owner.id });
    expect(c.status).toBe('COMMITTED');
    return { ...p, committed: c, rowsOpen: await listReview(db, { orgId: o.id, batchId: p.batchId }) };
  };
  const byBiz = async (businessId: string) => db.constituent.findUniqueOrThrow({ where: { orgId_businessId: { orgId: o.id, businessId } } });
  const effective = async (businessId: string) => (await loadEffectiveConstituent(db, (await byBiz(businessId)).id)).constituent;
  return { orgId: o.id, owner, preview, run, byBiz, effective };
}

/** Row count of every table, for "writes nothing" assertions. */
export async function tableCounts(tables: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of tables) out[t] = (await db.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${t}"`))[0]!.n;
  return out;
}
