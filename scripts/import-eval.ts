// `npm run import:eval` (CLAUDE.md commands; D-29): runs the TypeScript pipeline over fixtures/import_a.csv and
// import_b.csv against fixtures/crm_constituents.csv, prints the brief §11 numbers in the reference matcher's
// format, and exits non-zero if any per-pair decision differs from fixtures/decisions_*.csv.
// Options: --fixtures <dir> (default fixtures), --as-of <YYYY-MM-DD> (default 2026-10-14), --model <json>
// (a model file to run instead of matching/model.v1.json; drift is then expected and reported).
import { existsSync, readFileSync } from 'node:fs';
import { formatLabelAgreement, labelAgreement, runEval } from '../src/eval/import-eval';
import { loadModel } from '../src/matching/model';

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const fixtures = opt('--fixtures') ?? 'fixtures';
const asOf = opt('--as-of');
const modelPath = opt('--model');
const model = modelPath ? loadModel(JSON.parse(readFileSync(modelPath, 'utf8'))) : undefined;

const run = runEval(fixtures, { asOf, model });
process.stdout.write(run.text);
// Task 1.9: printed after the reference-format block so that block still diffs byte-for-byte.
const labelsPath = 'eval/labels/shane-30.json';
const printLabels = () => {
  if (existsSync(labelsPath)) process.stdout.write('\n' + formatLabelAgreement(labelAgreement(JSON.parse(readFileSync(labelsPath, 'utf8')).labels, fixtures)));
};
console.log(`pipeline: typescript (src/import, src/matching, model ${modelPath ?? 'matching/model.v1.json'}, as-of ${asOf ?? '2026-10-14'})`);
if (run.drift.length) {
  console.log(`DRIFT: ${run.drift.length} row decision(s) differ from fixtures/decisions_*.csv`);
  for (const d of run.drift.slice(0, 50)) console.log(`  ${d}`);
  if (run.drift.length > 50) console.log(`  ... ${run.drift.length - 50} more`);
  printLabels();
  process.exit(1);
}
console.log('drift vs fixtures/decisions_*.csv: 0 rows');
printLabels();
