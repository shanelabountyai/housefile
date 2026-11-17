// `npm run import:commit -- --batch <id> [--user email]` (task 2.4): commits a stored preview. Prints the status
// (COMMITTED | ALREADY_COMMITTED | STATE_MOVED | PLAN_TAMPERED) and the rows written; exits non-zero unless committed.
import { db } from '@/core/db';
import { commitBatch } from '@/commit/commit';

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const batchId = opt('--batch');
if (!batchId) {
  console.error('usage: npm run import:commit -- --batch <id> [--user email]');
  process.exit(2);
}

async function main() {
  const user = await db.user.findUniqueOrThrow({ where: { email: opt('--user') ?? 'seed@housefile.test' } });
  const r = await commitBatch(db, { batchId: batchId!, userId: user.id });
  console.log(`batch ${batchId}: ${r.status}${r.expected ? ` (expected ${r.expected}, actual ${r.actual})` : ''}`);
  console.log(Object.entries(r.written).map(([k, v]) => `${k} ${v}`).join(', '));
  if (r.status !== 'COMMITTED') process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
