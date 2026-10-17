import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/import/csv';
import { loadImportFile } from '@/import/pipeline';
import { validateRow, validationTotals } from '@/import/validate';

// Task 1.6 acceptance: expected_validation matches on all 650 rows (REJECT vs not, and the code when REJECT);
// rejected rows carry their reason. The answer key is read here by the test only (CLAUDE.md non-negotiable 5).

const bytes = (p: string) => new Uint8Array(readFileSync(p));
const key = (tag: string) => {
  const rows = parseCsv(bytes(`fixtures/answer_key_${tag.toLowerCase()}.csv`)).rows;
  return new Map(rows.map((r) => [r.cells.row_id!, r.cells]));
};

describe('validation against expected_validation (as-of 2026-10-14)', () => {
  for (const tag of ['A', 'B']) {
    it(`file ${tag}: REJECT vs not and the REJECT code agree on every row`, () => {
      const file = loadImportFile(bytes(`fixtures/import_${tag.toLowerCase()}.csv`), { tag });
      const k = key(tag);
      const mismatches: string[] = [];
      for (const r of file.rows) {
        const expected = k.get(r.id)!.expected_validation!;
        const got = r.reject ? `REJECT:${r.reject}` : 'ACCEPTED';
        const want = expected.startsWith('REJECT') ? expected : 'ACCEPTED';
        if (got !== want) mismatches.push(`${r.id}: expected ${expected}, got ${r.status}`);
        // The key names one WARN per row; when it does, that warning must be among ours.
        if (expected.startsWith('WARN:') && !r.warnings.includes(expected.slice(5) as never)) mismatches.push(`${r.id}: expected ${expected}, got ${r.status}`);
      }
      expect(mismatches).toEqual([]);
      expect(file.rows).toHaveLength(tag === 'A' ? 400 : 250);
    });
  }
  it('file A totals: 15 rejected (AMOUNT_MISSING 10, NAME_MISSING 2, DATE_FUTURE 2, AMOUNT_INVALID 1) — brief §11', () => {
    const t = validationTotals(loadImportFile(bytes('fixtures/import_a.csv'), { tag: 'A' }).rows);
    expect(t.reject).toBe(15);
    expect(t.byCode['REJECT:AMOUNT_MISSING']).toBe(10);
    expect(t.byCode['REJECT:NAME_MISSING']).toBe(2);
    expect(t.byCode['REJECT:DATE_FUTURE']).toBe(2);
    expect(t.byCode['REJECT:AMOUNT_INVALID']).toBe(1);
  });
  it('file B totals: 14 rejected (AMOUNT_MISSING 7, AMOUNT_INVALID 6, DATE_FUTURE 1)', () => {
    const t = validationTotals(loadImportFile(bytes('fixtures/import_b.csv'), { tag: 'B' }).rows);
    expect(t.reject).toBe(14);
    expect(t.byCode['REJECT:AMOUNT_MISSING']).toBe(7);
    expect(t.byCode['REJECT:AMOUNT_INVALID']).toBe(6);
    expect(t.byCode['REJECT:DATE_FUTURE']).toBe(1);
  });
});

describe('validateRow', () => {
  const map = { first: 'F', last: 'L', email: 'E', dob: 'D', gift_date: 'G', amount: 'M', zip: 'Z' } as const;
  const row = (cells: Record<string, string>) => validateRow('T-0001', 0, cells, '', map, { asOf: '2026-10-14', extras: ['X'] });

  it('OK row carries rules fired and extras', () => {
    const r = row({ F: 'Bob', L: 'Jones', E: 'b@example.com', G: '2026-01-02', M: '10', X: 'kept' });
    expect(r.status).toBe('OK');
    expect(r.rules).toContain('N2:email');
    expect(r.extras).toEqual({ X: 'kept' });
    expect(r.cents).toBe(1000);
  });
  it('reject precedence: NAME_MISSING beats AMOUNT_MISSING beats GIFT_DATE_INVALID beats DATE_FUTURE', () => {
    expect(row({ F: '', L: '', M: '', G: 'nope' }).reject).toBe('NAME_MISSING');
    expect(row({ F: 'A', L: 'B', M: '', G: 'nope' }).reject).toBe('AMOUNT_MISSING');
    expect(row({ F: 'A', L: 'B', M: 'x', G: '' }).reject).toBe('AMOUNT_INVALID');
    expect(row({ F: 'A', L: 'B', M: '5', G: '' }).reject).toBe('GIFT_DATE_MISSING');
    expect(row({ F: 'A', L: 'B', M: '5', G: '13/02/2026' }).reject).toBe('GIFT_DATE_INVALID');
    expect(row({ F: 'A', L: 'B', M: '5', G: '2027-01-01' }).reject).toBe('DATE_FUTURE');
    expect(row({ F: 'A', L: 'B', M: '5', G: '2026-10-14' }).reject).toBe('');
  });
  it('the as-of date is an input: the same row is DATE_FUTURE or not by asOf alone', () => {
    const cells = { F: 'A', L: 'B', M: '5', G: '2026-10-15' };
    expect(validateRow('T', 0, cells, '', map, { asOf: '2026-10-14', extras: [] }).reject).toBe('DATE_FUTURE');
    expect(validateRow('T', 0, cells, '', map, { asOf: '2026-10-15', extras: [] }).reject).toBe('');
  });
  it('warnings: EMAIL_INVALID drops the email, AMOUNT_NEGATIVE keeps the row, DOB warnings prefixed, Excel gift date warned', () => {
    const r = row({ F: 'A', L: 'B', M: '(5)', G: '46113', E: 'x@@y.com', D: '46000', Z: '710' });
    expect(r.reject).toBe('');
    expect(r.record.email).toBe('');
    expect(r.warnings).toEqual(['EMAIL_INVALID', 'ZIP_PADDED', 'DOB_DATE_EXCEL_SERIAL', 'AMOUNT_NEGATIVE', 'DATE_EXCEL_SERIAL']);
    expect(r.record.dob).toBe('2025-12-09');
    expect(r.giftDate).toBe('2026-04-01');
    expect(r.status).toBe('WARN:EMAIL_INVALID+ZIP_PADDED+DOB_DATE_EXCEL_SERIAL+AMOUNT_NEGATIVE+DATE_EXCEL_SERIAL');
  });
  it('an invalid DOB is dropped with DOB_DATE_INVALID', () => {
    const r = row({ F: 'A', L: 'B', M: '5', G: '2026-01-01', D: '31/12/1990' });
    expect(r.warnings).toEqual(['DOB_DATE_INVALID']);
    expect(r.record.dob).toBe('');
  });
});
