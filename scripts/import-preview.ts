// `npm run import:preview -- --file <csv> [--map <json>] [--as-of YYYY-MM-DD] [--org slug] [--user email] [--json]`
// (task 2.3): previews the file against the org's effective state and stores ONE ImportBatch row. Prints the
// report and the batch id; nothing else is written. Commit is `import:commit -- --batch <id>` (task 2.4).
import { readFileSync } from 'node:fs';
import { db } from '@/core/db';
import { previewBatch } from '@/commit/preview';
import type { ColumnMap } from '@/import/map';
import { DEFAULT_AS_OF } from '@/import/pipeline';
import { formatPreview } from '@/import/report';

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const filePath = opt('--file');
if (!filePath) {
  console.error('usage: npm run import:preview -- --file <csv> [--map <json>] [--as-of YYYY-MM-DD] [--org slug] [--user email] [--json]');
  process.exit(2);
}

async function main() {
  const org = await db.org.findUniqueOrThrow({ where: { slug: opt('--org') ?? 'housefile' } });
  const user = await db.user.findUniqueOrThrow({ where: { email: opt('--user') ?? 'seed@housefile.test' } });
  const mapPath = opt('--map');
  const map = mapPath ? (JSON.parse(readFileSync(mapPath, 'utf8')) as ColumnMap) : undefined;
  const r = await previewBatch(db, { orgId: org.id, userId: user.id, fileName: filePath!, bytes: new Uint8Array(readFileSync(filePath!)), map, asOf: opt('--as-of') ?? DEFAULT_AS_OF });
  process.stdout.write(args.includes('--json') ? JSON.stringify({ batchId: r.batchId, planHash: r.planHash, preview: r.preview }, null, 2) + '\n' : formatPreview(r.preview));
  console.log(`batch ${r.batchId} stored: planHash ${r.planHash} beforeHash ${r.beforeHash} (${r.pairsCompared} pairs compared)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
