// `npm run constituents:unmerge -- --event <mergeEventId> [--reason "..."] [--user email]` (task 2.7, D-24): reverses
// one merge from its snapshots and prints both proof hashes. Exits non-zero on a refusal.
import { db } from '@/core/db';
import { unmerge } from '@/commit/unmerge';

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const mergeEventId = opt('--event');
if (!mergeEventId) {
  console.error('usage: npm run constituents:unmerge -- --event <mergeEventId> [--reason "..."] [--user email]');
  process.exit(2);
}

async function main() {
  const user = await db.user.findUniqueOrThrow({ where: { email: opt('--user') ?? 'seed@housefile.test' } });
  const r = await unmerge(db, { mergeEventId: mergeEventId!, userId: user.id, reason: opt('--reason') });
  if (r.status === 'REFUSED') {
    console.log(`REFUSED ${r.code}${r.detail ? ` (${r.detail})` : ''}`);
    process.exitCode = 1;
    return;
  }
  const ev = await db.unmergeEvent.findUniqueOrThrow({ where: { id: r.unmergeEventId } });
  console.log(`UNMERGED ${mergeEventId}: survivor ${r.survivorId} hash ${ev.survivorHash}; loser ${r.loserId} hash ${ev.loserHash} (both equal their snapshots)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
