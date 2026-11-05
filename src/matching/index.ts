// src/matching: pure and deterministic (CLAUDE.md non-negotiable 4). No database, clock, randomness, network
// or model client is imported anywhere under this directory; `npm run model:lint` checks it.
export { scorePair } from './score';
export { blockingKeys } from './blocking';
export { jaroWinkler, soundex } from './similarity';
export { canonicalSet, setsIntersect } from './nicknames';
export { MODEL_V1, MODEL_V1_JSON, FEATURES, lintModel, loadModel, type Model, type Feature } from './model';
export type { MatchRecord, Name, Address, Score, Decision } from './types';
export { line1Key, addressIsEmpty, emptyAddress } from './types';
