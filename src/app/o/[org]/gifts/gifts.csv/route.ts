import { requireOrg } from '@/core/authz/guards';
import { giftList, parseGiftQuery } from '../query';

// The gift list as CSV (task 3.10): the same filtered query as the page, one row per active gift.
const cell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export async function GET(req: Request, { params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrg((await params).org);
  const q = parseGiftQuery(Object.fromEntries(new URL(req.url).searchParams));
  const { gifts, names } = await giftList(ctx.orgId, q);
  const lines = [['giftRef', 'constituent', 'name', 'giftDate', 'fund', 'appeal', 'amountCents'], ...gifts.map((g) => [g.giftRef, g.constituent, names.get(g.constituent) ?? '', g.giftDate, g.fund, g.appeal, String(g.amountCents)])];
  return new Response(lines.map((l) => l.map(cell).join(',')).join('\n') + '\n', {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="gifts-${q.asOf}.csv"` },
  });
}
