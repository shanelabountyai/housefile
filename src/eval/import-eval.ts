// `import:eval` (D-29, D-30): the TypeScript pipeline over the frozen fixtures, scored against the answer
// keys the same way tools/reference_matcher.py scores itself, printed in the same line format so the two
// outputs diff, plus a per-pair drift check against fixtures/decisions_*.csv. This module is the only code
// that reads truth_persons.csv, answer_key_*.csv and decisions_*.csv (CLAUDE.md non-negotiable 5).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConstituents } from '../import/crm';
import { parseCsv } from '../import/csv';
import { loadImportFile, type LoadedFile } from '../import/pipeline';
import { createMatchState, resolveBatch, type MatchState, type RowDecision } from '../import/resolve';
import { MODEL_V1, type Model } from '../matching/model';

export type FileEval = {
  file: string;
  encoding: string;
  rows: number;
  rejected: number;
  rows_merge: number;
  rows_review: number;
  rows_new: number;
  pairs_compared: number;
  auto_merge_pairs: number;
  auto_merge_correct: number;
  auto_merge_wrong: number;
  true_pairs_scored_below_review: number;
  true_pairs_not_blocked: number;
  review_pairs: number;
  review_pairs_true: number;
  pair_precision: number;
  pair_recall: number;
  validation_mismatches: number;
  row_confusion: Record<string, number>;
  rejects: Record<string, number>;
  wrong_merges: string[];
  unblocked: string[];
  decisions: RowDecision[];
  drift: string[]; // per-row differences against fixtures/decisions_<x>.csv
};

const bytes = (p: string) => new Uint8Array(readFileSync(p));
const csvRows = (p: string) => parseCsv(bytes(p)).rows.map((r) => r.cells);

/** A Python-style float repr for the diffable output: 1 → "1.0", 0.9462 → "0.9462", NaN → "nan". */
export const pyFloat = (x: number): string => (Number.isNaN(x) ? 'nan' : Number.isInteger(x) ? `${x}.0` : String(x));
/** A Python-style dict repr for the diffable output: {'a': 1, 'b': 2}. */
export const pyDict = (d: Record<string, number>): string => `{${Object.entries(d).map(([k, v]) => `'${k}': ${v}`).join(', ')}}`;

const round4 = (x: number) => (Number.isNaN(x) ? x : Number(x.toFixed(4)));

export function decisionRow(d: RowDecision): [string, string, string, string, string, string] {
  if (d.decision === 'REJECT') return [d.rowId, 'REJECT', d.target, '', '0', ''];
  return [d.rowId, d.decision, d.target, String(d.score ?? 0), d.reasons.join('+'), d.flags.join(';')];
}

export function evalFile(tag: string, fixtures: string, state: MatchState, truthOfCrm: Map<string, string>, opts: { asOf?: string; model?: Model } = {}): FileEval {
  const lower = tag.toLowerCase();
  const file: LoadedFile = loadImportFile(bytes(join(fixtures, `import_${lower}.csv`)), { tag, asOf: opts.asOf });
  const key = new Map(csvRows(join(fixtures, `answer_key_${lower}.csv`)).map((k) => [k.row_id!, k]));
  const truthOf = new Map(truthOfCrm);
  for (const r of file.rows) truthOf.set(r.id, key.get(r.id)!.true_person_id!);

  let tp = 0;
  let fp = 0;
  let fn = 0;
  let reviewPairs = 0;
  let reviewTrue = 0;
  let notBlocked = 0;
  let validationMismatch = 0;
  const wrong: string[] = [];
  const missed: string[] = [];
  const rejects: Record<string, number> = {};
  for (const r of file.rows) {
    const exp = key.get(r.id)!.expected_validation!;
    if (r.reject) {
      rejects[r.reject] = (rejects[r.reject] ?? 0) + 1;
      if (!exp.startsWith('REJECT')) validationMismatch++;
    } else if (exp.startsWith('REJECT')) validationMismatch++;
  }

  const { decisions, pairsCompared } = resolveBatch(file.rows, state, {
    model: opts.model ?? MODEL_V1,
    onRow: (d, indexed) => {
      const k = key.get(d.rowId)!;
      const truth = k.true_person_id!;
      let anyTrueCandidate = false;
      for (const c of d.candidates) {
        const same = truthOf.get(c.id) === truth;
        anyTrueCandidate ||= same;
        if (c.score.decision === 'MERGE') {
          if (same) tp++;
          else {
            fp++;
            wrong.push(`${d.rowId}->${c.id} ${c.score.total} ${c.score.reasons.join('+')} [${k.trap || k.defects}]`);
          }
        } else if (c.score.decision === 'REVIEW') {
          reviewPairs++;
          if (same) reviewTrue++;
        } else if (same) fn++;
      }
      // Did a true match exist among anything indexed at all? (recall denominator includes the unblocked)
      let trueTargetExists = false;
      for (const id of indexed) if (id !== d.rowId && truthOf.get(id) === truth) trueTargetExists = true;
      if (trueTargetExists && !anyTrueCandidate) {
        notBlocked++;
        missed.push(`${d.rowId} (no candidate blocked) [${k.defects}]`);
      }
    },
  });

  const confusion: Record<string, number> = {};
  for (const d of decisions) {
    const c = `${key.get(d.rowId)!.expected_link}->${d.decision}`;
    confusion[c] = (confusion[c] ?? 0) + 1;
  }
  const sortedConfusion = Object.fromEntries(Object.entries(confusion).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  const count = (x: string) => decisions.filter((d) => d.decision === x).length;
  const precision = tp + fp ? tp / (tp + fp) : NaN;
  const recallDen = tp + fn + notBlocked;
  const recall = recallDen ? tp / recallDen : NaN;

  const reference = csvRows(join(fixtures, `decisions_${lower}.csv`));
  const drift: string[] = [];
  decisions.forEach((d, i) => {
    const ref = reference[i];
    const got = decisionRow(d);
    const want = ref ? [ref.row_id, ref.decision, ref.target, ref.score, ref.reasons, ref.flags] : undefined;
    if (!want || got.some((v, j) => v !== want[j])) drift.push(`${d.rowId}: got ${got.join(',')} expected ${want ? want.join(',') : '(no reference row)'}`);
  });
  if (reference.length !== decisions.length) drift.push(`reference has ${reference.length} rows, pipeline produced ${decisions.length}`);

  return {
    file: tag,
    encoding: file.parsed.encoding,
    rows: file.rows.length,
    rejected: count('REJECT'),
    rows_merge: count('MERGE'),
    rows_review: count('REVIEW'),
    rows_new: count('NEW'),
    pairs_compared: pairsCompared,
    auto_merge_pairs: tp + fp,
    auto_merge_correct: tp,
    auto_merge_wrong: fp,
    true_pairs_scored_below_review: fn,
    true_pairs_not_blocked: notBlocked,
    review_pairs: reviewPairs,
    review_pairs_true: reviewTrue,
    pair_precision: round4(precision),
    pair_recall: round4(recall),
    validation_mismatches: validationMismatch,
    row_confusion: sortedConfusion,
    rejects,
    wrong_merges: wrong,
    unblocked: missed.slice(0, 10),
    decisions,
    drift,
  };
}

/** The reference matcher's line format, so `import:eval` output diffs against fixtures/samples/reference_matcher.output.txt. */
export function formatFileEval(r: FileEval): string {
  const t = r.file;
  const lines = [
    `${t} file: ${r.file}`,
    `${t} encoding: ${r.encoding}`,
    `${t} rows: ${r.rows}`,
    `${t} rejected: ${r.rejected}`,
    `${t} rows_merge: ${r.rows_merge}`,
    `${t} rows_review: ${r.rows_review}`,
    `${t} rows_new: ${r.rows_new}`,
    `${t} pairs_compared: ${r.pairs_compared}`,
    `${t} auto_merge_pairs: ${r.auto_merge_pairs}`,
    `${t} auto_merge_correct: ${r.auto_merge_correct}`,
    `${t} auto_merge_wrong: ${r.auto_merge_wrong}`,
    `${t} true_pairs_scored_below_review: ${r.true_pairs_scored_below_review}`,
    `${t} true_pairs_not_blocked: ${r.true_pairs_not_blocked}`,
    `${t} review_pairs: ${r.review_pairs}`,
    `${t} review_pairs_true: ${r.review_pairs_true}`,
    `${t} pair_precision: ${pyFloat(r.pair_precision)}`,
    `${t} pair_recall: ${pyFloat(r.pair_recall)}`,
    `${t} validation_mismatches: ${r.validation_mismatches}`,
    `${t} row_confusion: ${pyDict(r.row_confusion)}`,
    `${t} rejects: ${pyDict(r.rejects)}`,
    ...r.wrong_merges.map((w) => `${t} WRONG MERGE: ${w}`),
    ...r.unblocked.map((u) => `${t} NOT BLOCKED: ${u}`),
    '',
  ];
  return lines.join('\n');
}

export type EvalRun = { files: FileEval[]; text: string; drift: string[] };

/** Run both files in order over one in-memory CRM state (file B sees the CRM as enriched by file A, as the reference does). */
export function runEval(fixtures = 'fixtures', opts: { asOf?: string; model?: Model } = {}): EvalRun {
  const model = opts.model ?? MODEL_V1;
  const crm = loadConstituents(bytes(join(fixtures, 'crm_constituents.csv')));
  const state = createMatchState(crm);
  const truthOfCrm = new Map<string, string>();
  for (const tag of ['a', 'b']) for (const k of csvRows(join(fixtures, `answer_key_${tag}.csv`))) if (k.crm_constituent_id) truthOfCrm.set(k.crm_constituent_id, k.true_person_id!);
  for (const p of csvRows(join(fixtures, 'truth_persons.csv'))) if (p.crm_constituent_id) truthOfCrm.set(p.crm_constituent_id, p.person_id!);

  const files = ['A', 'B'].map((tag) => evalFile(tag, fixtures, state, truthOfCrm, { asOf: opts.asOf, model }));
  const text = [`thresholds: MERGE>=${model.thresholds.MERGE} REVIEW>=${model.thresholds.REVIEW}`, ...files.map(formatFileEval)].join('\n') + '\n';
  return { files, text, drift: files.flatMap((f) => f.drift.map((d) => `${f.file} ${d}`)) };
}

export type LabelTruth = 'MERGE' | 'SAME_HOUSEHOLD' | 'KEEP_SEPARATE';
export type LabelRow = { rowId: string; target: string; label: LabelTruth; truth: LabelTruth; score: number; reasons: string };

/**
 * Task 1.9 / D-31: Shane's blind labels against the truth. A pair is MERGE when both sides are the same true
 * person, SAME_HOUSEHOLD when they are different people in one true household, else KEEP_SEPARATE. Target is a
 * CRM id (C####) or an earlier row of the same file (A-####). Score and reasons come from decisions_<x>.csv.
 */
export function labelAgreement(labels: { row_id: string; target: string; label: LabelTruth }[], fixtures = 'fixtures', tag = 'a'): LabelRow[] {
  const key = new Map(csvRows(join(fixtures, `answer_key_${tag}.csv`)).map((k) => [k.row_id!, k]));
  const dec = new Map(csvRows(join(fixtures, `decisions_${tag}.csv`)).map((d) => [d.row_id!, d]));
  const persons = csvRows(join(fixtures, 'truth_persons.csv'));
  const personOfCrm = new Map(persons.filter((p) => p.crm_constituent_id).map((p) => [p.crm_constituent_id!, p.person_id!]));
  const householdOf = new Map(persons.map((p) => [p.person_id!, p.household_id!]));
  const personOf = (id: string) => (id.startsWith('C') ? personOfCrm.get(id) : key.get(id)?.true_person_id);
  return labels.map((l) => {
    const a = personOf(l.row_id);
    const b = personOf(l.target);
    if (!a || !b) throw new Error(`no truth for pair ${l.row_id} -> ${l.target}`);
    const truth: LabelTruth = a === b ? 'MERGE' : householdOf.get(a) === householdOf.get(b) ? 'SAME_HOUSEHOLD' : 'KEEP_SEPARATE';
    const d = dec.get(l.row_id);
    if (d?.target !== l.target) throw new Error(`label ${l.row_id} -> ${l.target} is not the pair in decisions_${tag}.csv`);
    return { rowId: l.row_id, target: l.target, label: l.label, truth, score: Number(d.score), reasons: d.reasons! };
  });
}

export function formatLabelAgreement(rows: LabelRow[]): string {
  const agree = rows.filter((r) => r.label === r.truth).length;
  const merge = rows.filter((r) => r.label === 'MERGE');
  const apart = rows.filter((r) => r.label !== 'MERGE');
  const pct = (n: number) => `${((100 * n) / rows.length).toFixed(1)}%`;
  return [
    `labels: ${rows.length} pairs (eval/labels/shane-30.json; model decided all of them REVIEW)`,
    `labels agreement (3-way): ${agree} / ${rows.length} (${pct(agree)})`,
    `labels agreement (merge vs not): ${rows.filter((r) => (r.label === 'MERGE') === (r.truth === 'MERGE')).length} / ${rows.length}`,
    `labels would merge (model held for review): ${merge.length}, truly same person: ${merge.filter((r) => r.truth === 'MERGE').length}`,
    `labels would keep apart: ${apart.length}, truly different people: ${apart.filter((r) => r.truth !== 'MERGE').length}`,
    ...rows.map((r) => `  ${r.label === r.truth ? 'ok  ' : 'DIFF'} ${r.rowId} -> ${r.target} score ${r.score} label ${r.label} truth ${r.truth} [${r.reasons}]`),
    '',
  ].join('\n');
}
