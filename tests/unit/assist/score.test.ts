import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Decision, RunLine } from '../../../experiments/assist/run';
import { formatScore, loadTruth, scoreAll, scoreRun } from '../../../experiments/assist/score';

// Six hand-made items: 4 MERGE and 2 SAME_HOUSEHOLD in truth, 4 with a Shane label (he disagrees with the key on A-3).
const truthCsv = [
  'file,row_id,candidate,truth,shane_label',
  'A,A-1,C1,MERGE,MERGE',
  'A,A-2,C2,MERGE,MERGE',
  'A,A-3,C3,MERGE,SAME_HOUSEHOLD',
  'A,A-4,C4,MERGE,',
  'A,A-5,C5,SAME_HOUSEHOLD,SAME_HOUSEHOLD',
  'B,B-1,C6,SAME_HOUSEHOLD,',
].join('\n');
const decided: [string, Decision, number][] = [
  ['A:A-1:C1', 'MERGE', 100],
  ['A:A-2:C2', 'MERGE', 100],
  ['A:A-3:C3', 'MERGE', 100],
  ['A:A-4:C4', 'ABSTAIN', 100],
  ['A:A-5:C5', 'SAME_HOUSEHOLD', 105],
  ['B:B-1:C6', 'KEEP_SEPARATE', 95],
];
const line = ([itemId, decision, costMicroUsd]: [string, Decision, number]): RunLine => ({
  at: '2026-10-29T12:00:00.000Z', itemId, model: 'claude-haiku-5-5', promptHash: 'h', raw: '', decision,
  reason: decision === 'ABSTAIN' ? null : 'r', inputTokens: 900, outputTokens: 30, costMicroUsd,
});
const truthFile = () => {
  const f = join(mkdtempSync(join(tmpdir(), 'assist-score-')), 'truth.csv');
  writeFileSync(f, truthCsv + '\n');
  return f;
};
const score = (lines = decided.map(line)) => scoreRun('claude-haiku-5-5-2026-10-29', lines, loadTruth(truthFile()));
const plant = (id: string, d: Decision) => decided.map((x) => line(x[0] === id ? [x[0], d, x[2]] : x));

describe('assist scorer (task 4.6)', () => {
  it('gives the known matrix, rules, Shane agreement, cost and a PASS on the 6-item cache', () => {
    const s = score();
    expect(s.matrix).toEqual({
      MERGE: { MERGE: 3, SAME_HOUSEHOLD: 0, KEEP_SEPARATE: 0, ABSTAIN: 1, MISSING: 0 },
      SAME_HOUSEHOLD: { MERGE: 0, SAME_HOUSEHOLD: 1, KEEP_SEPARATE: 1, ABSTAIN: 0, MISSING: 0 },
      KEEP_SEPARATE: { MERGE: 0, SAME_HOUSEHOLD: 0, KEEP_SEPARATE: 0, ABSTAIN: 0, MISSING: 0 },
    });
    expect(s.shaneMatrix.MERGE).toEqual({ MERGE: 2, SAME_HOUSEHOLD: 0, KEEP_SEPARATE: 0, ABSTAIN: 0, MISSING: 0 });
    expect(s.shaneMatrix.SAME_HOUSEHOLD).toEqual({ MERGE: 1, SAME_HOUSEHOLD: 1, KEEP_SEPARATE: 0, ABSTAIN: 0, MISSING: 0 });
    expect(s).toMatchObject({
      items: 6, wrongMerges: 0, abstains: 1, missing: 0, shaneItems: 4, shaneAgree: 3, matcherShaneAgree: 0,
      totalMicroUsd: 600, perItemMicroUsd: 100, verdict: 'PASS',
    });
    expect(s.rules).toEqual([
      { rule: 'merge-only', removed: 3, agree: 3, passes: true },
      { rule: 'non-merge-only', removed: 2, agree: 1, passes: false },
      { rule: 'any-label', removed: 5, agree: 4, passes: false },
    ]);
    expect(formatScore(s)).toMatch(/^P4-4 claude-haiku-5-5-2026-10-29: PASS /m);
  });

  it('flips the verdict when one wrong MERGE is planted', () => {
    const s = score(plant('B:B-1:C6', 'MERGE'));
    expect(s.wrongMerges).toBe(1);
    expect(s.matrix.SAME_HOUSEHOLD.MERGE).toBe(1);
    expect(s.verdict).toBe('NO MEASURED GAIN');
    expect(formatScore(s)).toMatch(/^P4-4 claude-haiku-5-5-2026-10-29: NO MEASURED GAIN .*wrong MERGE 1/m);
  });

  it('fails on one wrong MERGE even when another rule meets 30% at 95%', () => {
    const truth = [
      ...['A:A-1:C1', 'A:A-2:C2', 'A:A-3:C3', 'A:A-4:C4'].map((itemId) => ({ itemId, truth: 'MERGE' as const, shane: null })),
      ...['A:A-5:C5', 'A:A-6:C6', 'A:A-7:C7'].map((itemId) => ({ itemId, truth: 'SAME_HOUSEHOLD' as const, shane: null })),
      { itemId: 'B:B-1:C8', truth: 'KEEP_SEPARATE' as const, shane: null },
    ];
    const said = (d: Decision) => (t: { itemId: string }) => line([t.itemId, d, 1]);
    const lines = [...truth.slice(0, 4).map(said('ABSTAIN')), ...truth.slice(4, 7).map(said('SAME_HOUSEHOLD'))];
    expect(scoreRun('r', lines.concat(said('KEEP_SEPARATE')(truth[7]!)), truth).verdict).toBe('PASS');
    const s = scoreRun('r', lines.concat(said('MERGE')(truth[7]!)), truth);
    expect(s.rules[1]).toEqual({ rule: 'non-merge-only', removed: 3, agree: 3, passes: true });
    expect(s.wrongMerges).toBe(1);
    expect(s.verdict).toBe('NO MEASURED GAIN');
  });

  it('is no measured gain when no rule removes 30% at 95%', () => {
    const lines = decided.map((x, i) => line(i === 0 ? x : [x[0], 'ABSTAIN', x[2]]));
    const s = score(lines);
    expect(s.rules[0]).toEqual({ rule: 'merge-only', removed: 1, agree: 1, passes: false });
    expect(s.verdict).toBe('NO MEASURED GAIN');
  });

  it('is INCOMPLETE while an item has no cached answer, counted as left with a person', () => {
    const s = score(decided.slice(1).map(line));
    expect(s.missing).toBe(1);
    expect(s.matrix.MERGE.MISSING).toBe(1);
    expect(s.verdict).toBe('INCOMPLETE');
  });

  it('refuses an unknown item, a duplicate item and a run that mixes models', () => {
    expect(() => score([...decided.map(line), line(['A:A-9:C9', 'MERGE', 1])])).toThrow(/A:A-9:C9.*not in/);
    expect(() => score([...decided.map(line), line(decided[0]!)])).toThrow(/A:A-1:C1.*twice/);
    expect(() => score([{ ...line(decided[0]!), model: 'claude-sonnet-5-5' }, ...decided.slice(1).map(line)])).toThrow(/models/);
  });

  it('reads the committed truth: 98 items, 28 with a Shane label', () => {
    const t = loadTruth();
    expect(t).toHaveLength(98);
    expect(t.filter((i) => i.shane).length).toBe(28);
  });

  it('scores every run file in a directory, and says so when there are none', () => {
    const dir = mkdtempSync(join(tmpdir(), 'assist-runs-'));
    expect(scoreAll(dir, truthFile())).toBe('assist:eval: 0 run files in ' + dir + '\n');
    writeFileSync(join(dir, 'claude-haiku-5-5-2026-10-29.jsonl'), decided.map((x) => JSON.stringify(line(x))).join('\n') + '\n');
    expect(scoreAll(dir, truthFile())).toMatch(/P4-4 claude-haiku-5-5-2026-10-29: PASS/);
  });
});
