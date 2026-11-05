import { inOrg, requireOrg } from '@/core/authz/guards';
import { db } from '@/core/db';
import { ActionForm } from '@/core/ui/action-form';
import { addProject } from './actions';

export const metadata = { title: 'Projects' };

// The example resource. Notes are internal. D-5: no share links in Housefile.
export default async function Projects({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrg((await params).org);
  const projects = await db.project.findMany({ where: inOrg(ctx), orderBy: { createdAt: 'asc' } });
  const bind = <A extends unknown[], R>(fn: (slug: string, ...a: A) => R) => fn.bind(null, ctx.slug);

  return (
    <main>
      <h1>Projects</h1>
      {projects.map((p) => (
        <section key={p.id}>
          <h2>{p.name}</h2>
          {p.notes && <p>{p.notes}</p>}
        </section>
      ))}

      <h2>New project</h2>
      <ActionForm action={bind(addProject)}>
        <label>Name <input name="name" required maxLength={120} /></label>
        <label>Internal notes <textarea name="notes" maxLength={2000} /></label>
        <button type="submit">Add project</button>
      </ActionForm>
    </main>
  );
}
