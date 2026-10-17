// Brief §7: additive, explainable scoring with a three-way decision. Written from the brief; must agree with
// tools/matchlib.py on every pair. Pure: same inputs, same output, in either argument order.
import { MODEL_V1, type Condition, type Feature, type Model } from './model';
import { canonicalSet, setsIntersect } from './nicknames';
import { jaroWinkler } from './similarity';
import { addressIsEmpty, line1Key, type MatchRecord, type Score } from './types';

const firstCanon = (first: string): ReadonlySet<string> => (first ? canonicalSet(first.split(' ')[0]!) : new Set());
const lastCanon = (last: string): ReadonlySet<string> => canonicalSet(last);

const holds = (c: Condition, fired: Set<string>): boolean =>
  (c.all ?? []).every((f) => fired.has(f)) && (c.any === undefined || c.any.some((f) => fired.has(f)));

export function scorePair(a: MatchRecord, b: MatchRecord, model: Model = MODEL_V1): Score {
  const reasons: Feature[] = [];
  const fired = new Set<string>();
  let total = 0;
  const add = (f: Feature) => {
    reasons.push(f);
    fired.add(f);
    total += model.points[f];
  };
  const jw = (x: string, y: string) => jaroWinkler(x, y, model.jaroWinkler.prefixScale, model.jaroWinkler.maxPrefix);
  const { close, diff } = model.jaroWinkler;

  // identifiers
  if (a.email && b.email && a.email === b.email) add('EMAIL_EXACT');
  if (a.phone && b.phone && a.phone === b.phone) add('PHONE_EXACT');

  // names
  const an = a.name;
  const bn = b.name;
  const transposed =
    !!(an.first && an.last && bn.first && bn.last) &&
    an.first !== an.last &&
    setsIntersect(firstCanon(an.first), lastCanon(bn.last)) &&
    setsIntersect(firstCanon(bn.first), lastCanon(an.last));
  if (transposed) add('NAME_TRANSPOSED');
  else {
    if (an.first && bn.first) {
      if (an.first === bn.first) add('FIRST_EXACT');
      else if (setsIntersect(firstCanon(an.first), firstCanon(bn.first))) add('FIRST_NICKNAME');
      else if (an.first.length === 1 || bn.first.length === 1) add(an.first[0] === bn.first[0] ? 'FIRST_INITIAL' : 'FIRST_DIFF');
      else {
        const s = jw(an.first, bn.first);
        if (s >= close) add('FIRST_CLOSE');
        else if (s < diff) add('FIRST_DIFF');
      }
    }
    if (an.last && bn.last) {
      if (an.last === bn.last) add('SURNAME_EXACT');
      else {
        const s = jw(an.last, bn.last);
        if (s >= close) add('SURNAME_CLOSE');
        else if (s < diff) add('SURNAME_DIFF');
      }
    }
  }

  // suffix
  if (an.suffix && bn.suffix) add(an.suffix !== bn.suffix ? 'SUFFIX_CONFLICT' : 'SUFFIX_EXACT');
  else if (an.suffix || bn.suffix) add('SUFFIX_ONE_SIDED');

  // middle: only a conflict when both have one and the initials differ
  if (an.middle && bn.middle && an.middle[0] !== bn.middle[0]) add('MIDDLE_CONFLICT');

  // address
  const aa = a.addr;
  const ba = b.addr;
  if (!addressIsEmpty(aa) && !addressIsEmpty(ba) && aa.zip5 && aa.zip5 === ba.zip5) {
    if (line1Key(aa) === line1Key(ba) && aa.unit === ba.unit) add('ADDRESS_EXACT');
    else if (line1Key(aa) === line1Key(ba)) add('ADDRESS_SAME_BUILDING');
    else add('ZIP_EXACT');
  } else if (aa.zip5 && aa.zip5 === ba.zip5) add('ZIP_EXACT');

  // dob
  if (a.dob && b.dob) add(a.dob === b.dob ? 'DOB_EXACT' : 'DOB_DIFF');

  // decision (brief §7 steps 1–6)
  const flags: string[] = [];
  let decision: Score['decision'];
  const cap = model.caps.find((c) => fired.has(c.feature));
  if (fired.has(model.hardBlock.feature)) {
    decision = 'NEW';
    flags.push(model.hardBlock.flag);
  } else if (total >= model.thresholds.MERGE && cap) {
    decision = 'REVIEW';
    flags.push(cap.flag);
  } else if (total >= model.thresholds.MERGE) decision = 'MERGE';
  else if (total >= model.thresholds.REVIEW) decision = 'REVIEW';
  else {
    decision = 'NEW';
    const floor = model.floors.find((f) => holds(f, fired));
    if (floor) {
      decision = 'REVIEW';
      flags.push(floor.flag);
    }
  }
  if (decision === 'NEW' && holds(model.householdCandidate, fired)) flags.push(model.householdCandidate.flag);
  return { total, reasons, decision, flags };
}
