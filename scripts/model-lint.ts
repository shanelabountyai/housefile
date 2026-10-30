// `npm run model:lint` (CLAUDE.md commands): schema-checks matching/model.v1.json, confirms its content hash
// matches the one recorded in docs/decisions.md (D-16), greps all of src/ for experiments/ imports and the model API host (D-95),
// and greps src/matching/, src/import/ and src/segments/ for anything that would break
// purity (clock, randomness, database, network, model client, template core). Exit 1 on any finding.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { sha256Hex } from '../src/lib/canonical';
import { lintModel } from '../src/matching/model';

const problems: string[] = [];

const modelPath = 'matching/model.v1.json';
const raw: unknown = JSON.parse(readFileSync(modelPath, 'utf8'));
for (const p of lintModel(raw)) problems.push(`${modelPath}: ${p}`);

const hash = sha256Hex(raw);
const decisions = readFileSync('docs/decisions.md', 'utf8');
const recorded = /model\.v1\.json[^\n]*?sha256(?:[^\n]*?)`([0-9a-f]{64})`/i.exec(decisions)?.[1];
if (!recorded) problems.push('docs/decisions.md: no model.v1.json sha256 recorded (D-16)');
else if (recorded !== hash) problems.push(`model hash ${hash} differs from docs/decisions.md D-16 ${recorded}: a model change needs a decision entry and a golden pair`);

const FORBIDDEN = [/\bDate\b/, /Math\.random/, /prisma/i, /\bfetch\b/, /anthropic/i, /@\/core/, /@\/generated/, /\bpg\b/, /node:/, /\bprocess\./, /\brequire\(/, /\bimport\(/];
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}
// src/import is scanned too (review 2026-10-17), minus node:/process tokens it has no use for either; src/segments too (task 3.4, D-76).
for (const file of [...walk('src/matching'), ...walk('src/import'), ...walk('src/segments')]) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, ''); // a comment that names the rule is not a use of it
      for (const re of FORBIDDEN) if (re.test(code)) problems.push(`${file}:${i + 1}: forbidden ${re.source}: ${line.trim()}`);
    });
}

// Phase 4 (task 4.8, D-95): the assist experiment stays outside the product. Nothing under src/ imports experiments/
// or names the model API host; a quoted path is caught whether it is a static import, import() or require().
const PRODUCT_FORBIDDEN = [/['"`][^'"`]*\bexperiments\//, /api\.anthropic\.com/];
for (const file of walk('src')) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const code = line.replace(/(^|[^:])\/\/.*$/, '$1'); // strip a comment, not the // in https://
      for (const re of PRODUCT_FORBIDDEN) if (re.test(code)) problems.push(`${file}:${i + 1}: forbidden in src/ ${re.source}: ${line.trim()}`);
    });
}

console.log(`model ${modelPath} sha256 ${hash}`);
if (problems.length) {
  for (const p of problems) console.error(`model:lint FAIL ${p}`);
  process.exit(1);
}
console.log('model:lint OK');
