// `npm run constituents:merge -- --a C0001 --b C0002 --reason "..." [--org slug] [--user email]` (task 2.6, D-49):
// merges two constituents; the earlier record survives. Prints the MergeEvent id (unmerge is task 2.7).
import { db } from '@/core/db';
import { mergeConstituents } from '@/commit/merge';

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const [a, b, reason] = [opt('--a'), opt('--b'), opt('--reason')?.trim()];
if (!a || !b || !reason) {
  console.error('usage: npm run constituents:merge -- --a <businessId> --b <businessId> --reason "..." [--org slug] [--user email]');
  process.exit(2);
}

async function main() {
  const org = await db.org.findUniqueOrThrow({ where: { slug: opt('--org') ?? 'housefile' } });
  const user = await db.user.findUniqueOrThrow({ where: { email: opt('--user') ?? 'seed@housefile.test' } });
  const ca = await db.constituent.findUniqueOrThrow({ where: { orgId_businessId: { orgId: org.id, businessId: a! } } });
  const cb = await db.constituent.findUniqueOrThrow({ where: { orgId_businessId: { orgId: org.id, businessId: b! } } });
  const r = await mergeConstituents(db, { aId: ca.id, bId: cb.id, userId: user.id, reason: reason! });
  if (r.status === 'REFUSED') {
    console.log(`REFUSED ${r.code}`);
    process.exitCode = 1;
    return;
  }
  const survivor = r.survivorId === ca.id ? a : b;
  console.log(`MERGED ${r.survivorId === ca.id ? b : a} into ${survivor}: MergeEvent ${r.mergeEventId}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
