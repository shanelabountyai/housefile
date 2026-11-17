// The Phase 4 scorer (task 4.6, P4-4, P4-5): reads only eval/assist/runs/*.jsonl and eval/assist/truth.csv, so CI
// re-scores the committed cache for $0 with no key. One score per run file (one model, one day).
// "Confidence rules" are rules over the decision itself (D-91: the reply has no confidence field): a rule says which
// suggestions a person would accept without looking, and those items leave the review queue.
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { LABELS, type Label } from './prompt';
import { readRun, RUNS_DIR, type Decision, type RunLine } from './run';

export const TRUTH_FILE = 'eval/assist/truth.csv';
const COLUMNS = [...LABELS, 'ABSTAIN', 'MISSING'] as const;
type Column = (typeof COLUMNS)[number];
type Matrix = Record<Label, Record<Column, number>>;

export type TruthItem = { itemId: string; truth: Label; shane: Label | null };

const RULES: { rule: string; acts: (d: Decision) => boolean }[] = [
  { rule: 'merge-only', acts: (d) => d === 'MERGE' },
  { rule: 'non-merge-only', acts: (d) => d === 'SAME_HOUSEHOLD' || d === 'KEEP_SEPARATE' },
  { rule: 'any-label', acts: (d) => d !== 'ABSTAIN' },
];

// Every item is a REVIEW row (D-90): the matcher's band rules decide none of them, so they agree with none of
// Shane's labels on items. P4-4's third clause is the assist's agreement against this baseline.
const MATCHER_SHANE_AGREE = 0;

export function loadTruth(file = TRUTH_FILE): TruthItem[] {
  const [header, ...rows] = readFileSync(file, 'utf8').split('\n').filter(Boolean);
  if (header !== 'file,row_id,candidate,truth,shane_label') throw new Error(`${file}: unexpected header ${header}`);
  return rows.map((r) => {
    const [f, rowId, candidate, truth, shane] = r.split(',');
    const label = (v: string | undefined) => {
      if (!LABELS.includes(v as Label)) throw new Error(`${file}: bad label ${v} in ${r}`);
      return v as Label;
    };
    return { itemId: `${f}:${rowId}:${candidate}`, truth: label(truth), shane: shane ? label(shane) : null };
  });
}

const emptyMatrix = (): Matrix =>
  Object.fromEntries(LABELS.map((l) => [l, Object.fromEntries(COLUMNS.map((c) => [c, 0]))])) as Matrix;

export function scoreRun(runId: string, lines: RunLine[], truth: TruthItem[]) {
  const known = new Set(truth.map((t) => t.itemId));
  const byId = new Map<string, RunLine>();
  for (const l of lines) {
    if (!known.has(l.itemId)) throw new Error(`${runId}: ${l.itemId} is not in ${TRUTH_FILE}`);
    if (byId.has(l.itemId)) throw new Error(`${runId}: ${l.itemId} is cached twice`);
    byId.set(l.itemId, l);
  }
  const models = [...new Set(lines.map((l) => l.model))];
  if (models.length > 1) throw new Error(`${runId}: one run file holds models ${models.join(', ')}`);

  const matrix = emptyMatrix();
  const shaneMatrix = emptyMatrix();
  const decisionOf = (t: TruthItem): Column => byId.get(t.itemId)?.decision ?? 'MISSING';
  for (const t of truth) {
    matrix[t.truth][decisionOf(t)]++;
    if (t.shane) shaneMatrix[t.shane][decisionOf(t)]++;
  }

  const n = truth.length;
  const rules = RULES.map(({ rule, acts }) => {
    const acted = truth.filter((t) => byId.has(t.itemId) && acts(byId.get(t.itemId)!.decision));
    const removed = acted.length;
    const agree = acted.filter((t) => byId.get(t.itemId)!.decision === t.truth).length;
    // P4-4: removes >= 30% of review items at >= 95% agreement on them, in integer arithmetic.
    return { rule, removed, agree, passes: removed > 0 && removed * 10 >= n * 3 && agree * 100 >= removed * 95 };
  });

  const wrongMerges = truth.filter((t) => t.truth !== 'MERGE' && decisionOf(t) === 'MERGE').length;
  const shaneItems = truth.filter((t) => t.shane).length;
  const shaneAgree = truth.filter((t) => t.shane && decisionOf(t) === t.shane).length;
  const missing = truth.filter((t) => !byId.has(t.itemId)).length;
  const totalMicroUsd = lines.reduce((s, l) => s + l.costMicroUsd, 0);
  const verdict =
    missing > 0 ? 'INCOMPLETE'
    : wrongMerges === 0 && rules.some((r) => r.passes) && shaneAgree >= MATCHER_SHANE_AGREE ? 'PASS'
    : 'NO MEASURED GAIN';

  return {
    runId, model: models[0] ?? null, items: n, matrix, shaneMatrix, rules, wrongMerges,
    abstains: lines.filter((l) => l.decision === 'ABSTAIN').length, missing,
    shaneItems, shaneAgree, matcherShaneAgree: MATCHER_SHANE_AGREE,
    totalMicroUsd, perItemMicroUsd: lines.length ? (totalMicroUsd - (totalMicroUsd % lines.length)) / lines.length : 0,
    verdict: verdict as 'PASS' | 'NO MEASURED GAIN' | 'INCOMPLETE',
  };
}

export type RunScore = ReturnType<typeof scoreRun>;

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : '-');
const usd = (micro: number) => `$${(micro - (micro % 1000000)) / 1000000}.${String(micro % 1000000).padStart(6, '0')}`;

function formatMatrix(title: string, m: Matrix): string[] {
  const w = 15;
  return [
    title,
    `  ${'truth \\ said'.padEnd(w)}${COLUMNS.map((c) => c.padStart(w)).join('')}`,
    ...LABELS.map((l) => `  ${l.padEnd(w)}${COLUMNS.map((c) => String(m[l][c]).padStart(w)).join('')}`),
  ];
}

export function formatScore(s: RunScore): string {
  const best = s.rules.find((r) => r.passes) ?? s.rules[0]!;
  return [
    `run ${s.runId} (model ${s.model ?? '-'}): ${s.items} items, ${s.items - s.missing} answered, ${s.abstains} ABSTAIN, ${s.missing} missing`,
    ...formatMatrix('answer key:', s.matrix),
    ...formatMatrix(`Shane's labels (${s.shaneItems} items):`, s.shaneMatrix),
    `wrong MERGE (answer key): ${s.wrongMerges}`,
    `Shane agreement: ${s.shaneAgree} / ${s.shaneItems} (${pct(s.shaneAgree, s.shaneItems)}); matcher's band rules: ${s.matcherShaneAgree}`,
    ...s.rules.map((r) => `rule ${r.rule.padEnd(15)} removes ${r.removed} / ${s.items} (${pct(r.removed, s.items)}), agrees on ${r.agree} / ${r.removed} (${pct(r.agree, r.removed)})${r.passes ? '  meets 30% at 95%' : ''}`),
    `cost: ${s.totalMicroUsd} micro-USD (${usd(s.totalMicroUsd)}), ${s.perItemMicroUsd} per answered item`,
    `P4-4 ${s.runId}: ${s.verdict} (wrong MERGE ${s.wrongMerges}; ${best.rule} removes ${pct(best.removed, s.items)} at ${pct(best.agree, best.removed)}; Shane ${s.shaneAgree} >= matcher ${s.matcherShaneAgree})`,
    '',
  ].join('\n');
}

export function scoreAll(dir = RUNS_DIR, truthFile = TRUTH_FILE): string {
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort();
  } catch {
    // no runs directory yet: same as no run files
  }
  if (!files.length) return `assist:eval: 0 run files in ${dir}\n`;
  const truth = loadTruth(truthFile);
  return files.map((f) => formatScore(scoreRun(basename(f, '.jsonl'), readRun(join(dir, f)), truth))).join('\n');
}
