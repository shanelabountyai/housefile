// SNAPSHOT NOTE (review 2026-10-17): values in this file other than the reference-output and decisions_*.csv comparisons were measured by this code, not by the oracle. See docs/EVAL.md "Which tests are oracle agreement".
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadConstituents, loadGifts } from '@/import/crm';
import { loadImportFile } from '@/import/pipeline';
import { effectiveStateHash, fixtureState } from '@/commit/state';
import { buildPreview, type Preview } from '@/import/preview';
import { formatPreview } from '@/import/report';
import { createMatchState, resolveBatch } from '@/import/resolve';

// Task 1.10 acceptance: totals reconcile (rows = merged + reviewed + new + rejected) for both files and a
// byte-identical re-run gives a byte-identical report. Nothing is written.

const bytes = (p: string) => new Uint8Array(readFileSync(p));
const crm = loadConstituents(bytes('fixtures/crm_constituents.csv'));
const gifts = loadGifts(bytes('fixtures/crm_gifts.csv'));

function preview(tag: 'A' | 'B'): { p: Preview; text: string } {
  const path = `fixtures/import_${tag.toLowerCase()}.csv`;
  const map = JSON.parse(readFileSync(`import/maps/import_${tag.toLowerCase()}.map.json`, 'utf8'));
  const file = loadImportFile(bytes(path), { tag, map });
  const state = createMatchState(crm);
  const before = createMatchState(state.crm);
  const { decisions } = resolveBatch(file.rows, state);
  const p = buildPreview(file, decisions, before.crm, gifts, { path, asOf: '2026-10-14' });
  return { p, text: formatPreview(p) };
}

describe('dry-run preview', () => {
  for (const tag of ['A', 'B'] as const) {
    it(`file ${tag}: totals reconcile and every list length equals its total`, () => {
      const { p } = preview(tag);
      const t = p.totals;
      expect(t.rows).toBe(t.merged + t.reviewed + t.new + t.rejected);
      expect(t.rows).toBe(tag === 'A' ? 400 : 250);
      expect(p.create).toHaveLength(t.new);
      expect(p.rejected).toHaveLength(t.rejected);
      expect(p.review).toHaveLength(t.reviewed);
      expect(p.gifts).toHaveLength(t.giftsToAdd);
      expect(p.skippedGifts).toHaveLength(t.dupGift + t.dupGiftInFile);
      // every accepted non-review row either adds a gift or skips one, exactly once
      expect(t.giftsToAdd + t.dupGift + t.dupGiftInFile).toBe(t.merged + t.new);
      expect(t.giftsPendingReview).toBe(t.reviewed);
      expect(p.changes).toHaveLength(t.fieldChanges);
    });
    it(`file ${tag}: the report for a re-run is byte-identical`, () => {
      expect(preview(tag).text).toBe(preview(tag).text);
    });
  }
  it('file A numbers: 259/55/71/15 (D-43); DUP_GIFT 2, DUP_GIFT_IN_FILE 19, 7 date+cents matches with a different reference', () => {
    const t = preview('A').p.totals;
    expect([t.merged, t.reviewed, t.new, t.rejected]).toEqual([259, 55, 71, 15]);
    expect([t.dupGift, t.dupGiftInFile, t.dateCentsMatchedRefDiffered]).toEqual([2, 19, 7]);
  });
  it('file B alone (fresh CRM): 166/32/38/14; DUP_GIFT 4 (no reference column: date and cents), DUP_GIFT_IN_FILE 7', () => {
    const t = preview('B').p.totals;
    expect([t.merged, t.reviewed, t.new, t.rejected]).toEqual([166, 32, 38, 14]);
    expect([t.dupGift, t.dupGiftInFile, t.dateCentsMatchedRefDiffered]).toEqual([4, 7, 0]);
  });
  it('beforeHash is the D-11 state hash of the CRM fixture and does not move when the batch is resolved', () => {
    const h = effectiveStateHash(fixtureState(crm, gifts));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(preview('A').p.crm.beforeHash).toBe(h);
    expect(preview('B').p.crm.beforeHash).toBe(h);
    const reversed = effectiveStateHash(fixtureState([...crm].reverse(), [...gifts].reverse()));
    expect(reversed).toBe(h); // sorted by business id, not input order
  });
  it('a byte-identical duplicate row skips its gift as DUP_GIFT_IN_FILE naming the first row', () => {
    const { p } = preview('A');
    const s = p.skippedGifts.find((x) => x.rowId === 'A-0362');
    expect(s).toEqual({ rowId: 'A-0362', reason: 'DUP_GIFT_IN_FILE', of: 'A-0260', giftDate: '2026-04-25', cents: 250000 });
  });
  it('DUP_GIFT names the CRM gift when date, cents and reference all agree', () => {
    const { p } = preview('A');
    expect(p.skippedGifts.filter((x) => x.reason === 'DUP_GIFT').map((x) => [x.rowId, x.of])).toEqual([
      ['A-0048', 'G00796'],
      ['A-0189', 'G00146'],
    ]);
  });
  it('survivorship: S1 fills an empty field; S2 replaces an older contact value and keeps the loser; S3 keeps the name as an alias', () => {
    const { p } = preview('A');
    const c = p.changes.filter((x) => x.constituentId === 'C0160' && x.rowId === 'A-0005');
    expect(c.map((x) => [x.field, x.rule, x.loserKept])).toEqual([
      ['phone', 'S1', false],
      ['address', 'S2', true],
    ]);
    expect(p.alternates.find((a) => a.constituentId === 'C0160' && a.field === 'address')?.asOf).toBe('2025-03-31');
    expect(p.aliases.every((a) => a.rule === 'S3')).toBe(true);
    expect(p.changes.some((x) => x.field === 'dob' && x.rule !== 'S1')).toBe(false); // S3: DOB never replaced
  });
  it('the report lists the extras and the not-implemented warning', () => {
    const { text } = preview('A');
    expect(text).toContain('extras (kept, unmapped): "Table #" "Notes"');
    expect(text).toContain('FUND_UNKNOWN');
    expect(text).toContain('rows 400 = merged 259 + reviewed 55 + new 71 + rejected 15');
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:/); // no timestamps anywhere
  });
});
