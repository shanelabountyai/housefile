// SNAPSHOT NOTE (review 2026-10-17): values in this file other than the reference-output and decisions_*.csv comparisons were measured by this code, not by the oracle. See docs/EVAL.md "Which tests are oracle agreement".
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evalFile, runEval } from '@/eval/import-eval';
import { loadConstituents } from '@/import/crm';
import { parseCsv } from '@/import/csv';
import { createMatchState, resolveBatch } from '@/import/resolve';
import { loadModel, MODEL_V1_JSON } from '@/matching/model';
import { validateRow } from '@/import/validate';

// Task 1.8 acceptance: every field equals fixtures/samples/reference_matcher.output.txt; zero per-pair drift
// against fixtures/decisions_*.csv; the row confusion tables match. The expected numbers are the frozen
// reference's (brief §11); never edit them to pass.

const run = runEval('fixtures');
const A = run.files[0]!;
const B = run.files[1]!;

describe('import:eval reproduces the reference matcher on the frozen fixtures', () => {
  it('zero per-pair decision drift on both files (650 rows)', () => expect(run.drift).toEqual([]));
  it('file A: precision 1.000, recall 0.946, 58 rows in review, 685 pairs, 15 rejected, 256/58/71', () => {
    expect([A.pair_precision, A.pair_recall, A.rows_review, A.pairs_compared, A.rejected]).toEqual([1, 0.9462, 58, 685, 15]);
    expect([A.rows_merge, A.rows_review, A.rows_new]).toEqual([256, 58, 71]);
    expect([A.auto_merge_correct, A.auto_merge_wrong, A.true_pairs_scored_below_review, A.true_pairs_not_blocked]).toEqual([264, 0, 13, 2]);
    expect([A.review_pairs, A.review_pairs_true, A.validation_mismatches]).toEqual([128, 70, 0]);
    expect(A.unblocked.map((u) => u.split(' ')[0])).toEqual(['A-0238', 'A-0312']);
  });
  it('file B: precision 1.000, recall 0.955, 33 rows in review, 394 pairs, 14 rejected, 166/33/37', () => {
    expect([B.pair_precision, B.pair_recall, B.rows_review, B.pairs_compared, B.rejected]).toEqual([1, 0.9548, 33, 394, 14]);
    expect([B.rows_merge, B.rows_review, B.rows_new]).toEqual([166, 33, 37]);
    expect([B.auto_merge_correct, B.auto_merge_wrong, B.true_pairs_scored_below_review, B.true_pairs_not_blocked]).toEqual([169, 0, 8, 0]);
    expect([B.review_pairs, B.review_pairs_true, B.validation_mismatches]).toEqual([65, 37, 0]);
  });
  it('row confusion tables match the reference', () => {
    expect(A.row_confusion).toEqual({
      'DUP_IN_FILE->MERGE': 65, 'DUP_IN_FILE->NEW': 6, 'DUP_IN_FILE->REJECT': 2, 'DUP_IN_FILE->REVIEW': 9,
      'EXISTING->MERGE': 191, 'EXISTING->NEW': 5, 'EXISTING->REJECT': 9, 'EXISTING->REVIEW': 43,
      'NEW->NEW': 60, 'NEW->REJECT': 4, 'NEW->REVIEW': 6,
    });
    expect(B.row_confusion).toEqual({
      'DUP_IN_FILE->MERGE': 35, 'DUP_IN_FILE->NEW': 2, 'DUP_IN_FILE->REJECT': 1, 'DUP_IN_FILE->REVIEW': 3,
      'EXISTING->MERGE': 131, 'EXISTING->NEW': 3, 'EXISTING->REJECT': 10, 'EXISTING->REVIEW': 28,
      'NEW->NEW': 32, 'NEW->REJECT': 3, 'NEW->REVIEW': 2,
    });
  });
  it('the printed text is byte-identical to fixtures/samples/reference_matcher.output.txt', () => {
    expect(run.text).toBe(readFileSync('fixtures/samples/reference_matcher.output.txt', 'utf8'));
  });
  it('is deterministic: a second run gives the same text', () => expect(runEval('fixtures').text).toBe(run.text));
});

describe('A -> B carry-over (provisional decision: the reference runs B over the CRM as enriched by A)', () => {
  it('file B alone on a fresh CRM differs from decisions_b.csv on exactly these 10 rows', () => {
    const bytes = (p: string) => new Uint8Array(readFileSync(p));
    const state = createMatchState(loadConstituents(bytes('fixtures/crm_constituents.csv')));
    const truth = new Map<string, string>();
    for (const p of parseCsv(bytes('fixtures/truth_persons.csv')).rows) if (p.cells.crm_constituent_id) truth.set(p.cells.crm_constituent_id, p.cells.person_id!);
    const r = evalFile('B', 'fixtures', state, truth);
    expect(r.drift.map((d) => d.split(':')[0])).toEqual(['B-0013', 'B-0076', 'B-0089', 'B-0109', 'B-0120', 'B-0154', 'B-0156', 'B-0175', 'B-0204', 'B-0227']);
    expect(r.rows_review).toBe(32); // B-0109 REVIEW -> NEW without A's enrichment
  });
});

describe('the model is data: a point change moves the numbers with no code change (phase-gate check)', () => {
  it('FIRST_NICKNAME 15 -> 10 changes the review count and the drift check fails', () => {
    const json = JSON.parse(JSON.stringify(MODEL_V1_JSON)) as { features: Record<string, number> };
    json.features.FIRST_NICKNAME = 10;
    const changed = runEval('fixtures', { model: loadModel(json) });
    expect(changed.drift.length).toBeGreaterThan(0);
    expect(changed.files[0]!.rows_review + changed.files[1]!.rows_review).not.toBe(A.rows_review + B.rows_review);
  });
});

describe('resolveBatch tie-break', () => {
  it('highest score wins, then the highest id by string comparison, and the reason is reported', () => {
    const crm = [
      { constituent_id: 'C0001', first_name: 'Maria', middle_name: '', last_name: 'Garcia', suffix: '', email: '', phone: '', address_line1: '44 Peoria Ave', address_line2: '', city: 'Tulsa', state: 'OK', zip: '74105', dob: '' },
      { constituent_id: 'C0002', first_name: 'Maria', middle_name: '', last_name: 'Garcia', suffix: '', email: '', phone: '', address_line1: '44 Peoria Ave', address_line2: '', city: 'Tulsa', state: 'OK', zip: '74105', dob: '' },
    ];
    const text = ['constituent_id,first_name,middle_name,last_name,suffix,email,phone,address_line1,address_line2,city,state,zip,dob,household_id,created_at', ...crm.map((c) => Object.values(c).join(',') + ',H1,2025-01-01')].join('\n');
    const state = createMatchState(loadConstituents(new TextEncoder().encode(text)));
    const map = { first: 'F', last: 'L', line1: 'A', zip: 'Z', gift_date: 'G', amount: 'M' } as const;
    const row = validateRow('T-0001', 0, { F: 'Maria', L: 'Garcia', A: '44 Peoria Ave', Z: '74105', G: '2026-01-01', M: '5' }, '', map, { asOf: '2026-10-14', extras: [] });
    const { decisions } = resolveBatch([row], state);
    expect(decisions[0]!.decision).toBe('REVIEW');
    expect(decisions[0]!.target).toBe('C0002');
    expect(decisions[0]!.tieBreak).toBe('2 candidates scored 50; highest id wins (C0002)');
  });
});
