import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { db } from '@/core/db';
import { seedFixtures } from '@/commit/seed';
import { loadConstituents, loadGifts } from '@/import/crm';

// Task 3.9 acceptance (P-15): import_a.csv through the UI, the batch page counts equal phase2:proof's A line
// (71 constituents, 172 versions, 298 gifts, 246 merges, 74 review items over 68 rows, D-77), one review item of each
// action, undo with the hash line, and a member who sees the queue but no action buttons.
// A fresh org per run (the Phase 2 tables are append-only, so a run cannot be deleted); the rows stay in the test database.
const slug = `e2e-hf-${Date.now()}`;
const emails = { keeper: `scorekeeper-${slug}@hf.demo.test`, member: `member-${slug}@hf.demo.test` };
test.setTimeout(480_000);
test.afterAll(() => db.$disconnect());

test.beforeAll(async () => {
  const org = await db.org.create({ data: { slug, name: `Housefile e2e ${slug}` } });
  const seedUser = await db.user.create({ data: { email: `seed-${slug}@hf.demo.test`, name: 'Fixture seed' } });
  await db.membership.create({ data: { orgId: org.id, userId: seedUser.id, role: 'owner' } });
  await seedFixtures(db, {
    orgId: org.id, userId: seedUser.id,
    constituents: loadConstituents(new Uint8Array(readFileSync('fixtures/crm_constituents.csv'))),
    gifts: loadGifts(new Uint8Array(readFileSync('fixtures/crm_gifts.csv'))),
  });
  for (const [email, role] of [[emails.keeper, 'scorekeeper'], [emails.member, 'member']] as const) {
    const u = await db.user.create({ data: { email, name: role, isDemo: true } });
    await db.membership.create({ data: { orgId: org.id, userId: u.id, role } });
  }
});

const signIn = async (page: Page, email: string) => {
  await page.goto('/demo');
  await page.getByRole('button', { name: email }).click();
  await page.waitForURL(/\/onboarding/);
};

test('import A through the UI, review one of each action, undo by hash; a member cannot act', async ({ page, browser }) => {
  const org = `/o/${slug}`;
  await signIn(page, emails.keeper);

  // upload → map → preview
  await page.goto(`${org}/imports`);
  await page.getByLabel('CSV file').setInputFiles('fixtures/import_a.csv');
  await page.getByRole('button', { name: 'Upload and preview' }).click();
  await expect(page.getByTestId('status')).toHaveText('PREVIEWED', { timeout: 120_000 });
  await expect(page.getByRole('table').first()).toContainText('gift_date');
  await expect(page.getByTestId('totals')).toContainText('rows 400 = ');
  const batchUrl = page.url();
  const batchId = batchUrl.split('/').pop()!;

  // the CSV download of the preview
  const csv = await page.request.get(`${batchUrl}/preview.csv`);
  expect(csv.status()).toBe(200);
  expect((await csv.text()).split('\n')[0]).toBe('kind,rowId,target,detail,cents');

  // commit; the counts are phase2:proof's A line
  await page.getByRole('button', { name: 'Commit exactly this preview' }).click();
  await expect(page.getByTestId('status')).toHaveText('COMMITTED', { timeout: 120_000 });
  for (const [id, n] of [['constituents', 71], ['versions', 172], ['gifts', 298], ['merges', 246], ['items', 74], ['rows', 68]] as const) {
    await expect(page.getByTestId(`w-${id}`)).toHaveText(String(n));
  }

  // a member sees the queue and the pair, but no action buttons and no upload form
  const mctx = await browser.newContext({ baseURL: page.url().split('/o/')[0] });
  const member = await mctx.newPage();
  await signIn(member, emails.member);
  await member.goto(`${org}/review?batch=${batchId}`);
  await expect(member.getByTestId('open-count')).toHaveText('68 open row(s)');
  await member.getByRole('link', { name: /^A-\d{4}$/ }).first().click();
  await expect(member.getByRole('heading', { name: /^Review A-/ })).toBeVisible();
  await expect(member.getByRole('button', { name: 'MERGE' })).toHaveCount(0);
  await member.goto(`${org}/imports`);
  await expect(member.getByLabel('CSV file')).toHaveCount(0);
  await mctx.close();

  // one review item of each action; MERGE without a reason is refused first. A row whose candidate is itself a row
  // still in review is refused CANDIDATE_PENDING (D-77), so each action takes the first row that accepts it.
  const decide = async (action: string, reason: string) => {
    await page.goto(`${org}/review?batch=${batchId}`);
    const links = await page.getByRole('link', { name: /^A-\d{4}$/ }).evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href));
    for (const href of links) {
      await page.goto(href);
      await page.getByLabel(/Reason/).first().fill(reason);
      await page.getByRole('button', { name: action, exact: true }).first().click();
      const done = await Promise.race([
        page.waitForURL(/decided=/, { timeout: 30_000 }).then(() => true),
        page.locator('form p[role=alert]').first().waitFor({ timeout: 30_000 }).then(() => false),
      ]);
      if (done) return;
    }
    throw new Error(`no row accepted ${action}`);
  };
  await page.goto(`${org}/review?batch=${batchId}`);
  await page.getByRole('link', { name: /^A-\d{4}$/ }).first().click();
  await page.getByRole('button', { name: 'MERGE', exact: true }).first().click();
  await expect(page.locator('form p[role=alert]')).toContainText('need a reason');
  await decide('MERGE', 'same person: email and name agree');
  await expect(page.getByRole('status')).toContainText('Decided MERGE');
  await decide('KEEP_SEPARATE', 'different people at one address');
  await decide('SAME_HOUSEHOLD', '');
  await decide('DEFER', '');

  // undo: allowed, then the proof line shows the two hashes equal, and the before hash is the Phase 2 seed hash
  await page.goto(batchUrl);
  await expect(page.getByTestId('undo-state')).toContainText('Undo is available');
  await page.getByRole('button', { name: 'Undo this batch' }).click();
  await expect(page.getByTestId('status')).toHaveText('UNDONE', { timeout: 120_000 });
  const proof = page.getByTestId('undo-proof');
  await expect(proof).toContainText('==');
  const [after, before] = await proof.locator('code').allTextContents();
  expect(after).toBe(before);
  expect(before).toMatch(/^7d3bd174/);
});
