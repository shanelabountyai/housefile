// `npm run import:undo -- --batch <id> [--user email]` (task 2.8, D-13): undoes a committed batch and prints the proof
// (the state hash after undo equals the batch's beforeHash) or UNDO_FAILED with both hashes. Exits non-zero unless undone.
import { db } from '@/core/db';
import { undoBatch } from '@/commit/undo';

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const batchId = opt('--batch');
if (!batchId) {
  console.error('usage: npm run import:undo -- --batch <id> [--user email]');
  process.exit(2);
}

async function main() {
  const user = await db.user.findUniqueOrThrow({ where: { email: opt('--user') ?? 'seed@housefile.test' } });
  const r = await undoBatch(db, { batchId: batchId!, userId: user.id });
  if (r.status === 'UNDONE') {
    const batch = await db.importBatch.findUniqueOrThrow({ where: { id: batchId! }, select: { beforeHash: true } });
    console.log(`batch ${batchId}: UNDONE; stateHash ${r.afterHash} == beforeHash ${batch.beforeHash}`);
    console.log(Object.entries(r.reverted).map(([k, v]) => `${k} ${v}`).join(', '));
    return;
  }
  console.log(`batch ${batchId}: ${r.status === 'REFUSED' ? `REFUSED ${r.code}${r.detail ? ` (${r.detail})` : ''}` : `UNDO_FAILED expected ${r.expected} actual ${r.actual}`}`);
  process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
