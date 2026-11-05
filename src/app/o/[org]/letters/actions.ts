'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { orgAction } from '@/core/authz/action';
import { db } from '@/core/db';
import { Refused } from '@/core/errors';
import { queueLetters } from '@/commit/letters';

// Task 3.10: queue sample letters through queueLetters (task 3.8). They are queued, never sent.
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD.');
const WHY = { FORBIDDEN: 'You may not queue letters.', BAD_AS_OF: 'As-of date must be YYYY-MM-DD.', BAD_WINDOW: 'The window is not a valid from/to pair.' } as const;

export const queueLettersAction = orgAction(
  'results.write',
  z.object({ asOf: iso, from: iso.or(z.literal('')).default(''), to: iso.or(z.literal('')).default(''), combine: z.string().optional() }),
  async (ctx, i) => {
    const r = await queueLetters(db, { orgId: ctx.orgId, userId: ctx.userId, asOf: i.asOf, from: i.from || undefined, to: i.to || undefined, combine: !!i.combine });
    if (r.status === 'REFUSED') throw new Refused(WHY[r.code]);
    redirect(`/o/${ctx.slug}/letters?queued=${r.letters.length}`);
  },
);
