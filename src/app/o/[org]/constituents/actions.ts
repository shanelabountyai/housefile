'use server';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { orgAction, ref } from '@/core/authz/action';
import { db } from '@/core/db';
import { Refused } from '@/core/errors';
import { unmerge } from '@/commit/unmerge';

// Task 3.10: the constituent page's unmerge button calls the Phase 2 unmerge and nothing else.
export const unmergeMerge = orgAction('results.write', z.object({ mergeEventId: ref('mergeEvent'), reason: z.string().max(2000).default('') }), async (ctx, i) => {
  const m = await db.mergeEvent.findFirst({ where: { id: i.mergeEventId, orgId: ctx.orgId }, select: { survivor: { select: { businessId: true } } } });
  if (!m) notFound(); // not yours ≡ not found (INV-04)
  const r = await unmerge(db, { mergeEventId: i.mergeEventId, userId: ctx.userId, reason: i.reason.trim() || undefined });
  if (r.status === 'REFUSED') throw new Refused(`Unmerge refused: ${r.code}${r.detail ? ` (${r.detail})` : ''}.`);
  redirect(`/o/${ctx.slug}/constituents/${m.survivor.businessId}`);
});
