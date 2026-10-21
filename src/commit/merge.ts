// Task 2.6 (brief §8, D-23, D-24, D-46, D-48, D-49): one constituent merged into another. The record with the
// earlier createdAt survives S3 (names, suffix, DOB); S1/S2 apply field by field with the loser's values kept as
// alternates; the loser's name becomes an alias; the loser is RETIRED by a new version; its active gifts move by
// superseding rows with the same giftRef. The MergeEvent holds both effective states and the choice per field.
import type { Gift, PrismaClient } from '@/generated/prisma/client';
import { latestVersion, loadEffectiveConstituent, type ConstituentSnapshot, type Tx } from './db-state';
import type { EffectiveConstituent } from './state';
import { carry, supersedeGift } from './write';

export type MergeWriter = { userId: string } | { reviewDecisionId: string };
export type MergeInput = { aId: string; bId: string; reason: string } & MergeWriter;
export type MergeRefusal = 'SAME' | 'NOT_FOUND' | 'DIFFERENT_ORG' | 'MERGE_RETIRED';
export type MergeResult = { status: 'MERGED'; code?: undefined; mergeEventId: string; survivorId: string; loserId: string } | { status: 'REFUSED'; code: MergeRefusal; mergeEventId?: undefined; survivorId?: undefined; loserId?: undefined };
export type Choice = { value: string; rule: 'S1' | 'S2' | 'S3' | 'S5' | 'KEEP' };

const addressOf = (c: EffectiveConstituent) => [c.addressLine1, c.addressLine2, c.city, c.state, c.zip].filter(Boolean).join(', ');
const newestAsOf = (c: EffectiveConstituent) => Object.values(c.fieldMeta).map((m) => m.asOf).sort().at(-1) ?? '';

export async function mergeConstituents(db: PrismaClient, input: MergeInput): Promise<MergeResult> {
  return db.$transaction((tx) => mergeConstituentsTx(tx, input), { timeout: 60_000, isolationLevel: 'Serializable' });
}

export async function mergeConstituentsTx(tx: Tx, input: MergeInput): Promise<MergeResult> {
  if (input.aId === input.bId) return { status: 'REFUSED', code: 'SAME' };
  const [a, b] = await Promise.all([tx.constituent.findUnique({ where: { id: input.aId } }), tx.constituent.findUnique({ where: { id: input.bId } })]);
  if (!a || !b) return { status: 'REFUSED', code: 'NOT_FOUND' };
  if (a.orgId !== b.orgId) return { status: 'REFUSED', code: 'DIFFERENT_ORG' };
  // D-49: the earlier record survives; a tie goes to the lower business id
  const [survivor, loser] = a.createdAt < b.createdAt || (a.createdAt.getTime() === b.createdAt.getTime() && a.businessId < b.businessId) ? [a, b] : [b, a];
  const S: ConstituentSnapshot = await loadEffectiveConstituent(tx, survivor.id);
  const L: ConstituentSnapshot = await loadEffectiveConstituent(tx, loser.id);
  if (S.status !== 'ACTIVE' || L.status !== 'ACTIVE') return { status: 'REFUSED', code: 'MERGE_RETIRED' };

  const sv = await latestVersion(tx, survivor.id);
  const lv = await latestVersion(tx, loser.id);
  const data = carry(sv);
  const choices: Record<string, Choice> = {};
  const s = S.constituent;
  const l = L.constituent;

  // S3: the survivor's names, suffix and DOB stand; the loser's name is kept as an alias
  for (const f of ['firstName', 'middleName', 'lastName', 'suffix'] as const) choices[f] = { value: s[f], rule: 'S3' };
  if (l.firstName || l.lastName) data.aliases.push({ first: l.firstName, middle: l.middleName, last: l.lastName, suffix: l.suffix, source: `constituent:${loser.businessId}`, asOf: newestAsOf(l) });
  if (s.dob) choices.dob = { value: s.dob, rule: 'S3' };
  else if (l.dob) {
    choices.dob = { value: l.dob, rule: 'S1' };
    data.dob = lv.dob;
    data.fieldMeta.dob = l.fieldMeta.dob ?? { asOf: newestAsOf(l), source: `constituent:${loser.businessId}` };
  } else choices.dob = { value: '', rule: 'KEEP' };

  // S1/S2: email, phone, address field by field; the loser of each field is kept as an alternate with its own source and asOf
  const contact = (field: 'email' | 'phone' | 'address', sVal: string, lVal: string, take: () => void) => {
    const sMeta = s.fieldMeta[field] ?? { asOf: '', source: '' };
    const lMeta = l.fieldMeta[field] ?? { asOf: '', source: `constituent:${loser.businessId}` };
    if (!sVal && lVal) {
      take();
      data.fieldMeta[field] = lMeta;
      choices[field] = { value: lVal, rule: 'S1' };
    } else if (sVal && lVal && sVal !== lVal) {
      if (lMeta.asOf > sMeta.asOf) {
        take();
        data.fieldMeta[field] = lMeta;
        data.alternates.push({ field, value: sVal, source: sMeta.source, asOf: sMeta.asOf });
        choices[field] = { value: lVal, rule: 'S2' };
      } else {
        data.alternates.push({ field, value: lVal, source: lMeta.source, asOf: lMeta.asOf });
        choices[field] = { value: sVal, rule: 'S2' };
      }
    } else choices[field] = { value: sVal, rule: 'KEEP' };
  };
  contact('email', s.email, l.email, () => Object.assign(data, { email: lv.email }));
  contact('phone', s.phone, l.phone, () => Object.assign(data, { phone: lv.phone }));
  contact('address', addressOf(s), addressOf(l), () => Object.assign(data, { addressLine1: lv.addressLine1, addressLine2: lv.addressLine2, city: lv.city, state: lv.state, zip: lv.zip }));
  // S5: the survivor keeps its household; an empty one is filled from the loser
  if (sv.householdId) choices.household = { value: s.household, rule: 'S5' };
  else if (lv.householdId) {
    data.householdId = lv.householdId;
    choices.household = { value: l.household, rule: 'S1' };
  } else choices.household = { value: '', rule: 'KEEP' };
  // the loser's own aliases and alternates travel with it (D-7: nothing is lost by a merge)
  data.aliases.push(...l.aliases);
  data.alternates.push(...l.alternates);

  const loserGifts: Gift[] = await tx.gift.findMany({ where: { constituentId: loser.id, status: 'ACTIVE', supersededBy: null }, orderBy: { giftRef: 'asc' } });
  const writer: MergeWriter = 'userId' in input ? { userId: input.userId } : { reviewDecisionId: input.reviewDecisionId };
  const merge = await tx.mergeEvent.create({
    data: {
      orgId: survivor.orgId, kind: 'CONSTITUENT_INTO_CONSTITUENT', survivorId: survivor.id, loserId: loser.id, ...writer,
      survivorSnapshot: S, loserSnapshot: L, choices, giftRefsMoved: loserGifts.map((g) => g.giftRef), softCreditsMoved: [], // ponytail: soft credits are Phase 3; move them here when the table is written
      reason: input.reason,
    },
  });
  await tx.constituentVersion.create({ data: { ...data, version: sv.version + 1, mergeEventId: merge.id } });
  await tx.constituentVersion.create({ data: { ...carry(lv), status: 'RETIRED', version: lv.version + 1, mergeEventId: merge.id } });
  for (const g of loserGifts) await supersedeGift(tx, g, { constituentId: survivor.id }, `MERGED_INTO ${survivor.businessId}`, { mergeEventId: merge.id });
  return { status: 'MERGED', mergeEventId: merge.id, survivorId: survivor.id, loserId: loser.id };
}
