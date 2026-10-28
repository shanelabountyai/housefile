// The Phase 4 pair set (task 4.3, P4-1, D-90): every review item the Phase 1 pipeline produces in memory for file A
// then file B against the CRM file, one item per (REVIEW row, candidate tied at the row's best score). The truth for
// each item lives only in eval/assist/truth.csv, written by tools/assist_truth.py; nothing here reads the answer key.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConstituents } from '../../src/import/crm';
import { loadImportFile } from '../../src/import/pipeline';
import { createMatchState, resolveBatch } from '../../src/import/resolve';
import type { MatchRecord } from '../../src/matching/types';

export type ReviewItem = {
  file: 'A' | 'B';
  rowId: string;
  candidate: string;
  row: MatchRecord;
  candidateRecord: MatchRecord; // as scored: a CRM record already enriched by earlier merges (S1), or an earlier row
};

const bytes = (p: string) => new Uint8Array(readFileSync(p));
const clone = (r: MatchRecord): MatchRecord => ({ ...r, name: { ...r.name }, addr: { ...r.addr } });

export function reviewItems(fixtures = 'fixtures'): ReviewItem[] {
  const state = createMatchState(loadConstituents(bytes(join(fixtures, 'crm_constituents.csv'))));
  const items: ReviewItem[] = [];
  // File B resolves over the CRM as enriched by file A, as import:eval and the oracle do (D-34).
  for (const file of ['A', 'B'] as const) {
    const { rows } = loadImportFile(bytes(join(fixtures, `import_${file.toLowerCase()}.csv`)), { tag: file });
    const records = new Map<string, MatchRecord>(state.crm.map((c) => [c.record.id, c.record]));
    for (const r of rows) records.set(r.id, r.record);
    resolveBatch(rows, state, {
      onRow: (d) => {
        if (d.decision !== 'REVIEW') return;
        const tied = d.candidates.filter((c) => c.score.total === d.score).map((c) => c.id).sort();
        const row = clone(records.get(d.rowId)!);
        for (const id of tied) items.push({ file, rowId: d.rowId, candidate: id, row, candidateRecord: clone(records.get(id)!) });
      },
    });
  }
  return items;
}
