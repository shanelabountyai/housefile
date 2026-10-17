// `npm run model:lint` (CLAUDE.md commands): schema-checks matching/model.v1.json, confirms its content hash
// matches the one recorded in docs/decisions.md (D-16), and greps src/matching/ for anything that would break
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
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}
for (const file of walk('src/matching')) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const re of FORBIDDEN) if (re.test(line)) problems.push(`${file}:${i + 1}: forbidden ${re.source}: ${line.trim()}`);
    });
}

console.log(`model ${modelPath} sha256 ${hash}`);
if (problems.length) {
  for (const p of problems) console.error(`model:lint FAIL ${p}`);
  process.exit(1);
}
console.log('model:lint OK');
