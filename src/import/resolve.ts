// Stages 5–7 (brief §4, §7 "within a batch", D-15): rows resolve in file order against the CRM plus the rows
// accepted earlier in the batch. On MERGE the target absorbs the identifiers it lacked (S1) and the row's
// blocking keys point at the target; a REVIEW or NEW row is indexed as itself; a REJECT row is not indexed.
// The CRM records in a MatchState are mutated by those merges, so a second file resolved over the same state
// sees the CRM as enriched by the first (the reference matcher does the same; see decisions.md, provisional).
import type { CrmConstituent } from './crm';
import type { ImportRow } from './validate';
import { blockingKeys } from '../matching/blocking';
import { MODEL_V1, type Model } from '../matching/model';
import { scorePair } from '../matching/score';
import { addressIsEmpty, type MatchRecord, type Score } from '../matching/types';

export type RowOutcome = 'MERGE' | 'REVIEW' | 'NEW' | 'REJECT';

export type CandidateScore = { id: string; score: Score };

export type RowDecision = {
  rowId: string;
  decision: RowOutcome;
  target: string; // constituent id or earlier row id on MERGE/REVIEW; the reject code on REJECT; "" on NEW
  score: number | null; // null on REJECT
  reasons: string[];
  flags: string[];
  candidates: CandidateScore[]; // every blocked pair, in candidate order, with its score
  tieBreak: string; // how the best candidate was chosen, for the report ("" when at most one candidate)
};

export type MatchState = {
  crm: CrmConstituent[]; // records are mutated in place by in-batch survivorship (S1)
};

const cloneRecord = (r: MatchRecord): MatchRecord => ({ ...r, name: { ...r.name }, addr: { ...r.addr } });

/** A fresh in-memory state: the CRM records are copied so a run never leaks mutations into the caller's data. */
export function createMatchState(crm: CrmConstituent[]): MatchState {
  return { crm: crm.map((c) => ({ ...c, fields: { ...c.fields }, record: cloneRecord(c.record) })) };
}

export type ResolveOptions = {
  model?: Model;
  /** Called after each non-rejected row with the ids of every record the index holds at that point. */
  onRow?: (decision: RowDecision, indexedIds: ReadonlySet<string>) => void;
};

export type BatchResolution = { decisions: RowDecision[]; pairsCompared: number };

/** Highest score wins; on a tie the highest id by plain string comparison (the reference matcher's rule). */
export function betterCandidate(a: CandidateScore, b: CandidateScore): boolean {
  return a.score.total > b.score.total || (a.score.total === b.score.total && a.id > b.id);
}

export function resolveBatch(rows: ImportRow[], state: MatchState, opts: ResolveOptions = {}): BatchResolution {
  const model = opts.model ?? MODEL_V1;
  const index = new Map<string, MatchRecord[]>();
  const indexed = new Set<string>();
  const addToIndex = (key: string, r: MatchRecord) => {
    let list = index.get(key);
    if (!list) index.set(key, (list = []));
    if (!list.includes(r)) list.push(r);
    indexed.add(r.id);
  };
  for (const c of state.crm) for (const k of blockingKeys(c.record)) addToIndex(k, c.record);

  const decisions: RowDecision[] = [];
  let pairsCompared = 0;
  for (const row of rows) {
    if (row.reject) {
      decisions.push({ rowId: row.id, decision: 'REJECT', target: row.reject, score: null, reasons: [], flags: [], candidates: [], tieBreak: '' });
      continue;
    }
    const rec = row.record;
    const keys = blockingKeys(rec);
    const cands = new Map<string, MatchRecord>();
    for (const k of keys) for (const c of index.get(k) ?? []) cands.set(c.id, c);
    pairsCompared += cands.size;

    const candidates: CandidateScore[] = [];
    let best: CandidateScore | undefined;
    let tied = 0;
    for (const c of cands.values()) {
      const cs = { id: c.id, score: scorePair(rec, c, model) };
      candidates.push(cs);
      if (!best) best = cs;
      else if (cs.score.total === best.score.total) {
        tied++;
        if (cs.id > best.id) best = cs;
      } else if (betterCandidate(cs, best)) {
        best = cs;
        tied = 0;
      }
    }
    const tieBreak = best && tied > 0 ? `${tied + 1} candidates scored ${best.score.total}; highest id wins (${best.id})` : '';

    let d: RowDecision;
    if (best && best.score.decision === 'MERGE') {
      d = { rowId: row.id, decision: 'MERGE', target: best.id, score: best.score.total, reasons: best.score.reasons, flags: best.score.flags, candidates, tieBreak };
      const t = cands.get(best.id)!;
      // S1 within the batch: the target absorbs identifiers it lacked; the row's keys now point at the target.
      t.email = t.email || rec.email;
      t.phone = t.phone || rec.phone;
      t.dob = t.dob || rec.dob;
      if (addressIsEmpty(t.addr) && !addressIsEmpty(rec.addr)) t.addr = { ...rec.addr };
      for (const k of keys) addToIndex(k, t);
    } else if (best && best.score.decision === 'REVIEW') {
      d = { rowId: row.id, decision: 'REVIEW', target: best.id, score: best.score.total, reasons: best.score.reasons, flags: best.score.flags, candidates, tieBreak };
      for (const k of keys) addToIndex(k, rec);
    } else {
      d = { rowId: row.id, decision: 'NEW', target: '', score: best ? best.score.total : 0, reasons: best ? best.score.reasons : [], flags: best ? best.score.flags : [], candidates, tieBreak };
      for (const k of keys) addToIndex(k, rec);
    }
    decisions.push(d);
    opts.onRow?.(d, indexed);
  }
  return { decisions, pairsCompared };
}
