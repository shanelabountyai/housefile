'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@/core/audit';
import { orgAction } from '@/core/authz/action';
import { inOrg, type OrgCtx } from '@/core/authz/guards';
import { withOrg } from '@/core/db/rls';
import { emit } from '@/core/events';

// The example resource (spec §7c). A clone replaces Project with its own.
// D-5: Housefile shares nothing, so the share/revoke actions are removed; src/core/share stays as the template ships it.
const page = (ctx: OrgCtx) => `/o/${ctx.slug}/projects`;

export const addProject = orgAction(
  null,
  z.object({ name: z.string().trim().min(1, 'Give the project a name.').max(120), notes: z.string().max(2000).default('') }),
  async (ctx, i) => {
    await withOrg(ctx, async (tx) => {
      const p = await tx.project.create({ data: { ...inOrg(ctx), name: i.name, notes: i.notes } });
      await audit(ctx, 'project.created', { targetType: 'project', targetId: p.id }, tx);
      await emit(ctx, 'project.created', { project: { id: p.id, name: p.name, createdAt: p.createdAt.toISOString() } }, tx); // never notes (INV-08)
    });
    redirect(page(ctx));
  },
);
