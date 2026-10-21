// `npm run review:decide -- --item <id> --action MERGE|KEEP_SEPARATE|SAME_HOUSEHOLD|DEFER [--reason "..."] [--user email]`
// (task 2.5, D-22). Exits non-zero on a refusal and prints its code.
import { db } from '@/core/db';
import { decideReview } from '@/commit/review';
import type { ReviewAction } from '@/generated/prisma/client';

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const itemId = opt('--item');
const action = opt('--action') as ReviewAction | undefined;
if (!itemId || !action || !['MERGE', 'KEEP_SEPARATE', 'SAME_HOUSEHOLD', 'DEFER'].includes(action)) {
  console.error('usage: npm run review:decide -- --item <id> --action MERGE|KEEP_SEPARATE|SAME_HOUSEHOLD|DEFER [--reason "..."] [--user email]');
  process.exit(2);
}

async function main() {
  const user = await db.user.findUniqueOrThrow({ where: { email: opt('--user') ?? 'seed@housefile.test' } });
  const r = await decideReview(db, { itemId: itemId!, action: action!, reason: opt('--reason'), userId: user.id });
  if (r.status === 'REFUSED') {
    console.log(`REFUSED ${r.code}`);
    process.exitCode = 1;
    return;
  }
  console.log(`DECIDED ${action} decision ${r.decisionId}${r.constituentId ? ` constituent ${r.constituentId}` : ''}${r.followed ? ` (${r.followed} waiting row(s) followed, D-55)` : ''}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
