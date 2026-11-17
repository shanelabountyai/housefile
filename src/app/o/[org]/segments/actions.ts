'use server';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { orgAction, ref } from '@/core/authz/action';
import { db } from '@/core/db';
import { Refused } from '@/core/errors';
import { runSegment } from '@/commit/segments';

// Task 3.10: asOf is checked by runSegment (BAD_AS_OF), after the ownership check, so a foreign id is not-found first. The segment page's Run button calls runSegment (task 3.4) and nothing else.
export const runSegmentAction = orgAction('results.write', z.object({ definitionId: ref('segmentDefinition'), asOf: z.string() }), async (ctx, i) => {
  const d = await db.segmentDefinition.findFirst({ where: { id: i.definitionId, orgId: ctx.orgId }, select: { key: true } });
  if (!d) notFound(); // not yours ≡ not found (INV-04)
  const r = await runSegment(db, { definitionId: i.definitionId, userId: ctx.userId, asOf: i.asOf });
  if (r.status === 'REFUSED') throw new Refused(r.code === 'BAD_AS_OF' ? 'As-of date must be YYYY-MM-DD.' : `Run refused: ${r.code}.`);
  redirect(`/o/${ctx.slug}/segments/${d.key}`);
});
