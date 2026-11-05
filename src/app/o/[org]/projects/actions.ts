'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@/core/audit';
import { orgAction, ref } from '@/core/authz/action';
import { inOrg, type OrgCtx } from '@/core/authz/guards';
import { db } from '@/core/db';

// The example resource (spec §7c). A clone replaces Project with its own.
// D-5: Housefile shares nothing, so the share/revoke actions are removed; src/core/share stays as the template ships it.
const page = (ctx: OrgCtx) => `/o/${ctx.slug}/projects`;

export const addProject = orgAction(
  null,
  z.object({ name: z.string().trim().min(1, 'Give the project a name.').max(120), notes: z.string().max(2000).default('') }),
  async (ctx, i) => {
    await db.$transaction(async (tx) => {
      const p = await tx.project.create({ data: { ...inOrg(ctx), name: i.name, notes: i.notes } });
      await audit(ctx, 'project.created', { targetType: 'project', targetId: p.id }, tx);
    });
    redirect(page(ctx));
  },
);
