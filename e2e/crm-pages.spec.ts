import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { db } from '@/core/db';
import { seedFixtures } from '@/commit/seed';
import { loadConstituents } from '@/import/crm';
import { answers, phase3Pledges, phase3SeedGifts, phase3SoftCredits } from '../tests/helpers/phase3';

// Task 3.10 acceptance (P-15): one test per CRM page, on a seeded Phase 3 org. The gift-list and campaign totals equal
// phase3_answers.py's answers.json to the cent; the segment counts equal its reference counts; every letter is queued
// and a corrected gift makes exactly its letter stale; an unmerge from the constituent page shows both hashes equal.
// Serial, because the tests share one org and the constituent test changes it (a correction, a merge) after the totals are read.
test.describe.configure({ mode: 'serial' });
test.setTimeout(480_000);
const slug = `e2e-crm-${Date.now()}`;
const emails = { keeper: `scorekeeper-${slug}@hf.demo.test`, member: `member-${slug}@hf.demo.test` };
const org = `/o/${slug}`;
const AS_OF = answers.asOf as string;
const dollars = (cents: number) => `$${String(cents).slice(0, -2)}.${String(cents).slice(-2)}`; // test-side formatter, integers only
let orgId = '';
let ownerId = '';
// Playwright's loader cannot import the JSON the commit layer reads, so these steps run under tsx.
const ops = (...args: string[]) => JSON.parse(execFileSync('npx', ['tsx', 'scripts/e2e-crm-ops.ts', ...args], { encoding: 'utf8', env: process.env }).trim().split('\n').at(-1)!) as Record<string, string>;

test.afterAll(() => db.$disconnect());
test.beforeAll(async () => {
  const o = await db.org.create({ data: { slug, name: `Housefile CRM e2e ${slug}` } });
  orgId = o.id;
  const seedUser = await db.user.create({ data: { email: `seed-${slug}@hf.demo.test`, name: 'Fixture seed' } });
  ownerId = seedUser.id;
  await db.membership.create({ data: { orgId, userId: ownerId, role: 'owner' } });
  await seedFixtures(db, {
    orgId, userId: ownerId, constituents: loadConstituents(new Uint8Array(readFileSync('fixtures/crm_constituents.csv'))),
    gifts: phase3SeedGifts(), pledges: phase3Pledges(), softCredits: phase3SoftCredits(),
  });
  ops('segments', orgId, ownerId);
  for (const [email, role] of [[emails.keeper, 'scorekeeper'], [emails.member, 'member']] as const) {
    const u = await db.user.create({ data: { email, name: role, isDemo: true } });
    await db.membership.create({ data: { orgId, userId: u.id, role } });
  }
});

const signIn = async (page: Page, email: string) => {
  await page.goto('/demo');
  await page.getByRole('button', { name: email }).click();
  await page.waitForURL(/\/onboarding/);
};

test('gift list: totals tie to the oracle, filters, CSV', async ({ page }) => {
  await signIn(page, emails.keeper);
  await page.goto(`${org}/gifts?asOf=${AS_OF}`);
  const t = answers.total;
  await expect(page.getByTestId('gift-total')).toContainText(`${dollars(t.raised)} in ${t.gifts} gift(s) from ${t.donors} donor(s)`);
  await expect(page.getByTestId('gift-rows').locator('tbody tr')).toHaveCount(t.gifts);
  for (const [f, row] of Object.entries(answers.funds as Record<string, { raised: number }>)) await expect(page.getByTestId('by-fund').locator('tr', { hasText: new RegExp(`^${f}`) }).locator('td[data-cents]')).toHaveAttribute('data-cents', String(row.raised));

  // a fund filter and a campaign filter each equal their oracle row
  await page.goto(`${org}/gifts?asOf=${AS_OF}&fund=GEN`);
  await expect(page.getByTestId('gift-total')).toContainText(`${dollars(answers.funds.GEN.raised)} in ${answers.funds.GEN.gifts} gift(s)`);
  await page.goto(`${org}/gifts?asOf=${AS_OF}&campaign=AF2025`);
  await expect(page.getByTestId('gift-total')).toContainText(`${dollars(answers.campaigns.AF2025.raised)} in ${answers.campaigns.AF2025.gifts} gift(s)`);
  await page.goto(`${org}/gifts?asOf=${AS_OF}&from=2026-01-01&to=2026-12-31`);
  const dated = await page.getByTestId('by-date').locator('tbody tr').count();
  expect(dated).toBeGreaterThan(0);
  expect(await page.getByTestId('gift-rows').locator('tbody tr').count()).toBeLessThan(t.gifts);

  // the CSV carries every active gift and sums to the same cents
  const csv = await page.request.get(`${org}/gifts/gifts.csv?asOf=${AS_OF}`);
  expect(csv.status()).toBe(200);
  const lines = (await csv.text()).trim().split('\n');
  expect(lines[0]).toBe('giftRef,constituent,name,giftDate,fund,appeal,amountCents');
  expect(lines.length - 1).toBe(t.gifts);
  expect(lines.slice(1).reduce((n, l) => n + Number(l.split(',').at(-1)), 0)).toBe(t.raised);
});

test('campaign page: roll-ups equal the oracle', async ({ page }) => {
  await signIn(page, emails.keeper);
  await page.goto(`${org}/campaigns?asOf=${AS_OF}`);
  await expect(page.getByTestId('campaign-total')).toContainText(`Total ${dollars(answers.total.raised)} in ${answers.total.gifts} gift(s)`);
  for (const [c, row] of Object.entries(answers.campaigns as Record<string, { raised: number }>)) await expect(page.getByTestId(`campaign-${c}`).locator('td[data-cents]')).toHaveAttribute('data-cents', String(row.raised));
  for (const [f, row] of Object.entries(answers.funds as Record<string, { raised: number }>)) await expect(page.getByTestId(`fund-${f}`).locator('td[data-cents]')).toHaveAttribute('data-cents', String(row.raised));
  await expect(page.getByTestId('funds')).toContainText('BLDG');
});

test('segment page: definition, run, count, members, run time', async ({ page }) => {
  await signIn(page, emails.keeper);
  await page.goto(`${org}/segments`);
  await expect(page.getByTestId('segments')).toContainText('never run');
  await page.getByRole('link', { name: 'lybunt', exact: true }).click();
  await expect(page.getByTestId('definition')).toContainText('"lybunt"');
  await expect(page.getByTestId('run')).toHaveText('Never run.');
  await page.getByLabel('As of').fill(AS_OF);
  await page.getByRole('button', { name: 'Run' }).click();
  const ref = answers.segments['lybunt.json'] as { count: number; members: string[] };
  await expect(page.getByTestId('run-count')).toHaveText(String(ref.count));
  await expect(page.getByTestId('members').locator('li')).toHaveCount(ref.count);
  await expect(page.getByTestId('members').locator('li').first()).toContainText(ref.members[0]!);
  await expect(page.getByTestId('run')).toContainText(/Ran \d{4}-\d{2}-\d{2}T[\d:.]+Z as of 2026-10-14/);
  await expect(page.getByTestId('run')).toContainText('definition hash matches');
  await page.goto(`${org}/segments`);
  await expect(page.getByTestId('segments').locator('tr', { hasText: 'lybunt' })).toContainText(String(ref.count));
});

test('letters page: banner, queue, never sent', async ({ page, browser }) => {
  await signIn(page, emails.keeper);
  await page.goto(`${org}/letters`);
  await expect(page.getByTestId('banner')).toContainText('SAMPLE LETTER');
  await page.getByLabel('As of').fill(AS_OF);
  await page.getByRole('button', { name: 'Queue letters for gifts with none' }).click();
  await expect(page.getByTestId('queued-notice')).toHaveText(`Queued ${answers.total.gifts} letter(s). Nothing was sent.`, { timeout: 120_000 });
  await expect(page.getByTestId('letter-counts')).toContainText(`${answers.total.gifts} letter(s): ${answers.total.gifts} queued, 0 stale`);
  await page.getByRole('link', { name: 'L0001', exact: true }).click();
  await expect(page.getByTestId('letter')).toContainText('SAMPLE LETTER');
  expect(await db.outbox.count({ where: { orgId } })).toBe(0); // queued in the clone's own table, never the outbox

  // a member reads the page but has no queue form
  const mctx = await browser.newContext({ baseURL: page.url().split('/o/')[0] });
  const member = await mctx.newPage();
  await signIn(member, emails.member);
  await member.goto(`${org}/letters`);
  await expect(member.getByTestId('banner')).toBeVisible();
  await expect(member.getByRole('button', { name: 'Queue letters for gifts with none' })).toHaveCount(0);
  await mctx.close();
});

test('constituent page: history, pledges, soft credits, household, unmerge by hash; a corrected gift stales exactly its letter', async ({ page, browser }) => {
  await signIn(page, emails.keeper);

  // a correction: the old row stays, struck through, with its reason; the letter written from it goes stale
  const { constituent: donor } = ops('correct', orgId, ownerId, 'G00001');
  await page.goto(`${org}/constituents/${donor}?asOf=${AS_OF}`);
  const struck = page.getByTestId('gifts').locator('tr[data-superseded="true"]');
  await expect(struck).toHaveCount(1);
  await expect(struck).toContainText('G00001');
  await expect(struck).toContainText('superseded: e2e: keyed wrong');
  await expect(struck.locator('td').first()).toHaveCSS('text-decoration-line', 'line-through');
  await expect(page.getByTestId('fields')).toContainText('crm');
  await page.goto(`${org}/letters`);
  await expect(page.getByTestId('letter-counts')).toContainText(`${answers.total.gifts - 1} queued, 1 stale`);

  // household name and giving equal the oracle (H0001, two members)
  await page.goto(`${org}/constituents/C0001?asOf=${AS_OF}`);
  const h = answers.households.H0001 as { name: string; givingCents: number; members: string[] };
  await expect(page.getByTestId('household')).toContainText(`${h.name} (H0001): ${h.members.join(', ')}`);

  // a pledge and its balance equal the oracle
  const [pl, p] = Object.entries(answers.pledges as Record<string, { constituentId: string; totalCents: number; paidCents: number; balanceCents: number }>)[1]!;
  await page.goto(`${org}/constituents/${p.constituentId}?asOf=${AS_OF}`);
  const row = page.getByTestId('pledges').locator('tr', { hasText: pl });
  await expect(row).toContainText(dollars(p.totalCents));
  await expect(row).toContainText(dollars(p.balanceCents));

  // a soft credit shows on the person it names, with recognition apart from raised
  const sc = phase3SoftCredits()[0]!;
  await page.goto(`${org}/constituents/${sc.constituent_id}?asOf=${AS_OF}`);
  await expect(page.getByTestId('soft-credits')).toContainText(`${sc.soft_credit_id}: ${sc.role} on ${sc.gift_id}`);
  await expect(page.getByTestId('recognition')).toContainText('Raised totals never include soft credits');

  // merge two people, then unmerge from the survivor's page: both hashes equal their snapshots
  const { survivor } = ops('merge', orgId, ownerId, 'C0005', 'C0006');
  await page.goto(`${org}/constituents/${survivor}`);
  await expect(page.getByTestId('merge')).toContainText('e2e: same person');
  await expect(page.getByTestId('unmerge-state')).toContainText('Unmerge is available');

  // a member sees the history but not the button
  const mctx = await browser.newContext({ baseURL: page.url().split('/o/')[0] });
  const member = await mctx.newPage();
  await signIn(member, emails.member);
  await member.goto(`${org}/constituents/${survivor}`);
  await expect(member.getByTestId('unmerge-state')).toContainText('needs the results.write permission');
  await expect(member.getByRole('button', { name: 'Unmerge' })).toHaveCount(0);
  await mctx.close();

  await page.getByRole('button', { name: 'Unmerge' }).click();
  const proof = page.getByTestId('unmerge-proof');
  await expect(proof).toContainText(/Survivor hash [0-9a-f]{64} == its snapshot [0-9a-f]{64}; loser hash [0-9a-f]{64} == its snapshot [0-9a-f]{64}/, { timeout: 120_000 });
  await expect(proof).not.toContainText('!=');
});
