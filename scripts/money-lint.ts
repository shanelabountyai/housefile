// `npm run money:lint` (task 1.12, non-negotiable 6): fails if a float can reach a cents field. Any code line
// under src/ (template core and generated code excepted) or scripts/ that names cents or an amount must not
// use parseFloat, toFixed, Math.round/floor/ceil/trunc, a decimal literal or a /100 or *0.x conversion.
// money.ts parses text to cents in integer arithmetic; nothing else needs those tools near an amount.
// ponytail: line-level grep, misses a float laundered through a variable on another line; a type-level
// Cents brand is the upgrade if that ever happens.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SKIP = new Set(['src/core', 'src/generated']);
const MONEY = /cents|amount/i;
const FLOAT = /parseFloat|toFixed|Math\.(round|floor|ceil|trunc)|\b\d+\.\d+|\/\s*100\b|\*\s*0?\.\d/;

function walk(dir: string): string[] {
  if (SKIP.has(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}

const problems: string[] = [];
for (const file of [...walk('src'), ...walk('scripts')]) {
  if (file === 'scripts/money-lint.ts') continue;
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (/^\s*(\*|\/\*)/.test(line)) return; // block-comment line
      const code = line.replace(/\/\/.*$/, '');
      if (MONEY.test(code) && FLOAT.test(code)) problems.push(`${file}:${i + 1}: ${line.trim()}`);
    });
}

// The column itself: a cents field in the Prisma schema is Int, never Float or Decimal (task 2.1).
for (const file of readdirSync('prisma/schema').map((f) => join('prisma/schema', f))) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      if (MONEY.test(code) && /\b(Float|Decimal)\b/.test(code)) problems.push(`${file}:${i + 1}: ${line.trim()}`);
    });
}

if (problems.length) {
  for (const p of problems) console.error(`money:lint FAIL float near a cents field: ${p}`);
  process.exit(1);
}
console.log('money:lint OK');
