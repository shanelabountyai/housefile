import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { reviewItems } from '../../../experiments/assist/items';
import { parseCsv } from '../../../src/import/csv';

// The oracle's pair set (tools/assist_truth.py, D-90); only the pair columns are read here, never the truth.
const oracle = parseCsv(new Uint8Array(readFileSync('eval/assist/truth.csv'))).rows.map((r) => r.cells);

describe('assist review items (task 4.3)', () => {
  const items = reviewItems();

  it('lists exactly the oracle items, in the same order', () => {
    expect(items.map((i) => `${i.file} ${i.rowId} ${i.candidate}`)).toEqual(oracle.map((o) => `${o.file} ${o.row_id} ${o.candidate}`));
  });

  it('counts per file equal the oracle: A 61, B 37', () => {
    expect(items.filter((i) => i.file === 'A')).toHaveLength(61);
    expect(items.filter((i) => i.file === 'B')).toHaveLength(37);
  });

  it('carries both records as the matcher scored them, ties as separate items', () => {
    for (const i of items) {
      expect(i.row.id).toBe(i.rowId);
      expect(i.candidateRecord.id).toBe(i.candidate);
    }
    // A-0393 tied three ways at 50 (one REVIEW row, three items)
    expect(items.filter((i) => i.rowId === 'A-0393').map((i) => i.candidate)).toEqual(['A-0115', 'A-0147', 'C0243']);
  });
});
