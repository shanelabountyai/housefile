// `npm run import:dry-run -- --file <csv> [--map <json>]` (CLAUDE.md commands; task 1.10): prints the preview
// report Phase 2 will execute. Writes nothing.
//   --file <csv>        the import file (required)
//   --map <json>        a column map {field: header}; default: the proposal from import/synonyms.json
//   --crm <dir>         directory holding crm_constituents.csv and crm_gifts.csv (default fixtures)
//   --as-of <date>      ISO as-of date for DATE_FUTURE (default 2026-10-14)
//   --tag <X>           row id prefix (default: the letter in import_<x>.csv, else R)
//   --after <csv>       resolve this earlier file first over the same in-memory CRM (with --after-map), so the
//                       preview sees the CRM as that batch's merges would leave it; default: the fresh CRM
//   --json              print the preview as JSON instead of text
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { loadConstituents, loadGifts } from '../src/import/crm';
import type { ColumnMap } from '../src/import/map';
import { DEFAULT_AS_OF, loadImportFile } from '../src/import/pipeline';
import { buildPreview } from '../src/import/preview';
import { formatPreview } from '../src/import/report';
import { createMatchState, resolveBatch } from '../src/import/resolve';

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name: string) => args.includes(name);

const filePath = opt('--file');
if (!filePath) {
  console.error('usage: npm run import:dry-run -- --file <csv> [--map <json>] [--crm <dir>] [--as-of YYYY-MM-DD] [--tag X] [--after <csv> --after-map <json>] [--json]');
  process.exit(2);
}
const crmDir = opt('--crm') ?? 'fixtures';
const asOf = opt('--as-of') ?? DEFAULT_AS_OF;
const tagOf = (p: string, fallback: string) => /import_([a-z])\.csv$/i.exec(basename(p))?.[1]?.toUpperCase() ?? fallback;
const readMap = (p: string | undefined): ColumnMap | undefined => (p ? (JSON.parse(readFileSync(p, 'utf8')) as ColumnMap) : undefined);
const bytes = (p: string) => new Uint8Array(readFileSync(p));

const crm = loadConstituents(bytes(join(crmDir, 'crm_constituents.csv')));
const gifts = loadGifts(bytes(join(crmDir, 'crm_gifts.csv')));
const state = createMatchState(crm);

const after = opt('--after');
if (after) {
  const prior = loadImportFile(bytes(after), { tag: tagOf(after, 'P'), asOf, map: readMap(opt('--after-map')) });
  resolveBatch(prior.rows, state);
}

const file = loadImportFile(bytes(filePath), { tag: opt('--tag') ?? tagOf(filePath, 'R'), asOf, map: readMap(opt('--map')) });
const beforeBatch = createMatchState(state.crm); // the CRM as it stands before this batch: survivorship is planned against it
const { decisions } = resolveBatch(file.rows, state);
const preview = buildPreview(file, decisions, beforeBatch.crm, gifts, { path: filePath, asOf, after });
process.stdout.write(flag('--json') ? JSON.stringify(preview, null, 2) + '\n' : formatPreview(preview));
