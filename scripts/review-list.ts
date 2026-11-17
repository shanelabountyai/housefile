// `npm run review:list [-- --batch <id>] [--org slug]` (task 2.5): open review rows with their candidates.
import { db } from '@/core/db';
import { batchStatus, listReview } from '@/commit/review';

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  const org = await db.org.findUniqueOrThrow({ where: { slug: opt('--org') ?? 'housefile' } });
  const batchId = opt('--batch');
  const rows = await listReview(db, { orgId: org.id, batchId });
  if (batchId) console.log(`batch ${batchId}: ${await batchStatus(db, batchId)}`);
  console.log(`${rows.length} open row(s)`);
  for (const r of rows) {
    console.log(`${r.rowId}  ${r.row.name} <${r.row.email}> ${r.row.phone} ${r.row.address}  gift ${r.row.giftDate} ${r.row.cents ?? '?'}c`);
    for (const i of r.items) console.log(`    item ${i.id}  vs ${i.candidate.padEnd(18)} ${String(i.score).padStart(3)}  ${i.reasons.join('+')}${i.flags.length ? ` [${i.flags.join(';')}]` : ''}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
