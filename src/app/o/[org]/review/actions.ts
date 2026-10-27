'use server';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { orgAction, ref } from '@/core/authz/action';
import { db } from '@/core/db';
import { Refused } from '@/core/errors';
import { decideReview } from '@/commit/review';

// Task 3.9: the four review actions call decideReview (task 2.5) and nothing else.
const WHY = {
  NOT_FOUND: 'That review item no longer exists.',
  FORBIDDEN: 'You may not decide review items.',
  REASON_REQUIRED: 'MERGE and KEEP_SEPARATE need a reason.',
  ROW_DECIDED: 'This row was already decided.',
  CANDIDATE_PENDING: 'The candidate is an earlier row still in review; decide that row first.',
} as const;

export const decideItem = orgAction(
  'results.write',
  z.object({ itemId: ref('reviewItem'), action: z.enum(['MERGE', 'KEEP_SEPARATE', 'SAME_HOUSEHOLD', 'DEFER']), reason: z.string().max(2000).default('') }),
  async (ctx, i) => {
    const item = await db.reviewItem.findFirst({ where: { id: i.itemId, orgId: ctx.orgId }, select: { id: true } });
    if (!item) notFound(); // not yours ≡ not found (INV-04)
    const r = await decideReview(db, { itemId: i.itemId, action: i.action, reason: i.reason, userId: ctx.userId });
    if (r.status === 'REFUSED') throw new Refused(WHY[r.code]);
    redirect(`/o/${ctx.slug}/review?decided=${i.action}`);
  },
);
