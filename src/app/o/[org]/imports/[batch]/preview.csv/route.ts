import { notFound } from 'next/navigation';
import { inOrg, requireOrg } from '@/core/authz/guards';
import { db } from '@/core/db';
import type { Preview } from '@/import/preview';

// The previewed writes as CSV (task 3.9): what commit will create and add, read from the stored plan.
const cell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export async function GET(_req: Request, { params }: { params: Promise<{ org: string; batch: string }> }) {
  const ctx = await requireOrg((await params).org);
  const p = await params;
  const b = await db.importBatch.findFirst({ where: { id: p.batch, ...inOrg(ctx) }, select: { plan: true } });
  if (!b) notFound();
  const plan = b.plan as unknown as Preview;
  const lines = [['kind', 'rowId', 'target', 'detail', 'cents']];
  for (const c of plan.create) lines.push(['CREATE', c.rowId, '', `${c.name} <${c.email}> ${c.address}`, '']);
  for (const g of plan.gifts) lines.push(['GIFT', g.rowId, g.constituentRef, `${g.giftDate} ${g.fundCode} ${g.externalRef}`, String(g.cents)]);
  for (const c of plan.changes) lines.push(['CHANGE', c.rowId, c.constituentId, `${c.field}: "${c.old}" -> "${c.new}" (${c.rule})`, '']);
  for (const r of plan.review) lines.push(['REVIEW', r.rowId, r.target, `score ${r.score} ${r.reasons.join('+')}`, '']);
  return new Response(lines.map((l) => l.map(cell).join(',')).join('\n') + '\n', {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="preview-${p.batch}.csv"` },
  });
}
