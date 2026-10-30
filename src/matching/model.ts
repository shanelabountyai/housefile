// The scoring model is data (D-16): matching/model.v1.json, a closed table. This module checks its shape
// and exposes it typed. Nothing here or anywhere under src/matching reads a clock, randomness, the network,
// a database or a model client (CLAUDE.md non-negotiable 4).
import modelJson from '../../matching/model.v1.json';

export const FEATURES = [
  'EMAIL_EXACT', 'PHONE_EXACT', 'FIRST_EXACT', 'FIRST_NICKNAME', 'FIRST_CLOSE', 'FIRST_INITIAL', 'FIRST_DIFF',
  'SURNAME_EXACT', 'SURNAME_CLOSE', 'SURNAME_DIFF', 'NAME_TRANSPOSED', 'SUFFIX_EXACT', 'SUFFIX_CONFLICT',
  'SUFFIX_ONE_SIDED', 'MIDDLE_CONFLICT', 'ADDRESS_EXACT', 'ADDRESS_SAME_BUILDING', 'ZIP_EXACT', 'DOB_EXACT', 'DOB_DIFF',
] as const;
export type Feature = (typeof FEATURES)[number];

export type Condition = { flag: string; all?: Feature[]; any?: Feature[] };

export type Model = {
  version: string;
  thresholds: { MERGE: number; REVIEW: number };
  jaroWinkler: { prefixScale: number; maxPrefix: number; close: number; diff: number };
  points: Record<Feature, number>;
  hardBlock: { feature: Feature; flag: string };
  caps: { feature: Feature; flag: string }[];
  floors: Condition[];
  householdCandidate: Condition;
};

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const isFeature = (v: unknown): v is Feature => typeof v === 'string' && (FEATURES as readonly string[]).includes(v);

/** Shape-check the JSON (closed vocabulary, integers only); returns the problems, empty when OK. */
export function lintModel(raw: unknown): string[] {
  const out: string[] = [];
  const m = raw as Record<string, unknown>;
  if (!m || typeof m !== 'object') return ['model is not an object'];
  if (typeof m.version !== 'string') out.push('version must be a string');
  const th = m.thresholds as Record<string, unknown> | undefined;
  if (!th || !isInt(th.MERGE) || !isInt(th.REVIEW)) out.push('thresholds.MERGE and thresholds.REVIEW must be integers');
  else if (th.REVIEW > th.MERGE) out.push('thresholds.REVIEW must not exceed thresholds.MERGE');
  const jw = (m.similarity as Record<string, unknown> | undefined)?.jaroWinkler as Record<string, unknown> | undefined;
  for (const k of ['prefixScalePct', 'maxPrefix', 'closePct', 'diffPct']) if (!jw || !isInt(jw[k])) out.push(`similarity.jaroWinkler.${k} must be an integer`);
  if (jw && isInt(jw.closePct) && isInt(jw.diffPct) && jw.diffPct > jw.closePct) out.push('similarity.jaroWinkler.diffPct must not exceed closePct');
  const feats = m.features as Record<string, unknown> | undefined;
  if (!feats || typeof feats !== 'object') out.push('features must be an object');
  else {
    for (const f of FEATURES) if (!isInt(feats[f])) out.push(`features.${f} must be an integer`);
    for (const k of Object.keys(feats)) if (!isFeature(k)) out.push(`features.${k} is not a known feature (closed vocabulary)`);
  }
  const hb = m.hardBlock as Record<string, unknown> | undefined;
  if (!hb || !isFeature(hb.feature) || typeof hb.flag !== 'string') out.push('hardBlock needs a known feature and a flag');
  const caps = m.caps;
  if (!Array.isArray(caps) || caps.some((c) => !isFeature(c?.feature) || typeof c?.flag !== 'string')) out.push('caps must list {feature, flag} with known features');
  const cond = (c: unknown, where: string) => {
    const x = c as Record<string, unknown>;
    if (!x || typeof x.flag !== 'string') out.push(`${where}.flag must be a string`);
    for (const k of ['all', 'any']) {
      const v = x?.[k];
      if (v !== undefined && (!Array.isArray(v) || !v.every(isFeature))) out.push(`${where}.${k} must list known features`);
    }
    if (x && x.all === undefined && x.any === undefined) out.push(`${where} needs all or any`);
  };
  if (!Array.isArray(m.floors)) out.push('floors must be an array');
  else m.floors.forEach((f, i) => cond(f, `floors[${i}]`));
  cond(m.householdCandidate, 'householdCandidate');
  return out;
}

export function loadModel(raw: unknown): Model {
  const problems = lintModel(raw);
  if (problems.length) throw new Error(`model.v1.json: ${problems.join('; ')}`);
  const m = raw as {
    version: string;
    thresholds: { MERGE: number; REVIEW: number };
    similarity: { jaroWinkler: { prefixScalePct: number; maxPrefix: number; closePct: number; diffPct: number } };
    features: Record<Feature, number>;
    hardBlock: { feature: Feature; flag: string };
    caps: { feature: Feature; flag: string }[];
    floors: Condition[];
    householdCandidate: Condition;
  };
  const jw = m.similarity.jaroWinkler;
  return {
    version: m.version,
    thresholds: { ...m.thresholds },
    jaroWinkler: { prefixScale: jw.prefixScalePct / 100, maxPrefix: jw.maxPrefix, close: jw.closePct / 100, diff: jw.diffPct / 100 },
    points: { ...m.features },
    hardBlock: { ...m.hardBlock },
    caps: m.caps.map((c) => ({ ...c })),
    floors: m.floors.map((f) => ({ ...f })),
    householdCandidate: { ...m.householdCandidate },
  };
}

export const MODEL_V1_JSON: unknown = modelJson;
export const MODEL_V1: Model = loadModel(modelJson);
export { LABELS } from '../../experiments/assist/prompt'; // RED CHECK task 4.8, do not merge
