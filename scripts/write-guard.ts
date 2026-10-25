// `npm run write:lint` (task 2.9, D-64): the only module tree that writes the Phase 2 tables is src/commit/. Every
// other file under src/ (template-owned src/core/ and the generated client excepted) must not call a write method on
// a Phase 2 model, nor run raw INSERT/UPDATE/DELETE against one of its tables. Like model:lint, a grep over the
// source: cheap, explicit, and red on a planted violation (tests/unit/write-guard.test.ts).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PHASE2_MODELS = ['constituent', 'constituentVersion', 'household', 'fund', 'campaign', 'appeal', 'gift', 'softCredit', 'importBatch', 'importBatchEvent', 'reviewItem', 'reviewDecision', 'mergeEvent', 'pairMemory', 'unmergeEvent', 'segmentDefinition', 'segmentRun'] as const;
const WRITE_METHODS = ['create', 'createMany', 'createManyAndReturn', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'];
const TABLES = PHASE2_MODELS.map((m) => m[0]!.toUpperCase() + m.slice(1));
const MODEL_WRITE = new RegExp(`\\.(${PHASE2_MODELS.join('|')})\\.(${WRITE_METHODS.join('|')})\\s*\\(`);
const RAW_WRITE = new RegExp(`\\b(INSERT\\s+INTO|UPDATE|DELETE\\s+FROM|TRUNCATE)\\s+"?(${TABLES.join('|')})"?\\b`, 'i');

export const ALLOWED = ['src/commit'];
const SKIPPED = ['src/core', 'src/generated'];

export function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(name)) yield p;
  }
}

export type Violation = { file: string; line: number; text: string };

/** Every write to a Phase 2 table outside the allowed trees, as file:line. */
export function findViolations(root = process.cwd(), opts: { allowed?: string[]; skipped?: string[] } = {}): Violation[] {
  const allowed = opts.allowed ?? ALLOWED;
  const skipped = opts.skipped ?? SKIPPED;
  const out: Violation[] = [];
  for (const file of walk(join(root, 'src'))) {
    const rel = relative(root, file);
    if ([...allowed, ...skipped].some((d) => rel.startsWith(d + '/'))) continue;
    readFileSync(file, 'utf8').split('\n').forEach((raw, i) => {
      const code = raw.replace(/\/\/.*$/, '');
      if (MODEL_WRITE.test(code) || RAW_WRITE.test(code)) out.push({ file: rel, line: i + 1, text: raw.trim() });
    });
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const v = findViolations();
  for (const x of v) console.error(`${x.file}:${x.line}: writes a Phase 2 table outside src/commit/: ${x.text}`);
  console.log(v.length ? `write:lint FAILED (${v.length})` : `write:lint OK (only ${ALLOWED.join(', ')} writes the Phase 2 tables)`);
  process.exit(v.length ? 1 : 0);
}
