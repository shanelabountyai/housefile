// Setup steps for e2e/crm-pages.spec.ts. Playwright's own loader cannot import the JSON the commit layer reads
// (no import attribute), so the spec shells out to this under tsx. Prints one JSON line.
//   segments <orgId> <userId>              save the six reference segments
//   correct <orgId> <userId> <giftRef>     raise one gift by 1234 cents, with a reason
//   merge <orgId> <userId> <idA> <idB>     merge two constituents by business id; prints the survivor's business id
import { readFileSync } from 'node:fs';
import { db } from '@/core/db';
import { correctGift } from '@/commit/gifts';
import { mergeConstituents } from '@/commit/merge';
import { saveSegment } from '@/commit/segments';

const [op, orgId, userId, a, b] = process.argv.slice(2) as [string, string, string, string, string];

async function main() {
  if (op === 'segments') {
    for (const f of ['colorado-households', 'lapsed-repeat', 'lybunt', 'major-2025', 'south-central-2026', 'sybunt']) {
      const r = await saveSegment(db, { orgId, userId, key: f, definition: JSON.parse(readFileSync(`segments/reference/${f}.json`, 'utf8')) });
      if (r.status === 'REFUSED') throw new Error(`segment ${f}: ${r.code}`);
    }
    return {};
  }
  if (op === 'correct') {
    const g = await db.gift.findFirstOrThrow({ where: { orgId, giftRef: a, supersededBy: null }, include: { constituent: true } });
    const r = await correctGift(db, { orgId, userId, giftRef: a, reason: 'e2e: keyed wrong', change: { amountCents: g.amountCents + 1234 } });
    if (r.status !== 'CORRECTED') throw new Error(`correct: ${r.code}`);
    return { constituent: g.constituent.businessId };
  }
  if (op === 'merge') {
    const [x, y] = await Promise.all([a, b].map((id) => db.constituent.findFirstOrThrow({ where: { orgId, businessId: id } })));
    const m = await mergeConstituents(db, { aId: x!.id, bId: y!.id, userId, reason: 'e2e: same person' });
    if (m.status !== 'MERGED') throw new Error(`merge: ${m.code}`);
    return { survivor: (await db.constituent.findUniqueOrThrow({ where: { id: m.survivorId } })).businessId };
  }
  throw new Error(`unknown op ${op}`);
}

main().then((o) => console.log(JSON.stringify(o))).finally(() => db.$disconnect());
