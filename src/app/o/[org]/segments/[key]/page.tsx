import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOrg } from '@/core/authz/guards';
import { can } from '@/core/authz/permissions';
import { db } from '@/core/db';
import { ActionForm } from '@/core/ui/action-form';
import type { SegmentDefinition } from '@/segments/segment';
import { runSegmentAction } from '../actions';

export const metadata = { title: 'Segment' };
export const dynamic = 'force-dynamic';

export default async function Segment({ params }: { params: Promise<{ org: string; key: string }> }) {
  const ctx = await requireOrg((await params).org);
  const p = await params;
  const d = await db.segmentDefinition.findFirst({ where: { orgId: ctx.orgId, key: p.key }, orderBy: { version: 'desc' } });
  if (!d) notFound();
  const def = d.definition as unknown as SegmentDefinition;
  const runs = await db.segmentRun.findMany({ where: { orgId: ctx.orgId, definitionId: d.id }, orderBy: { at: 'desc' }, take: 10 });
  const last = runs[0];
  const names = last ? new Map((await db.constituentVersion.findMany({ where: { constituent: { orgId: ctx.orgId, businessId: { in: last.members } } }, orderBy: { version: 'asc' }, select: { firstName: true, lastName: true, constituent: { select: { businessId: true } } } })).map((v) => [v.constituent.businessId, `${v.firstName} ${v.lastName}`.trim()])) : new Map<string, string>();
  return (
    <main>
      <h1>{def.name} <small>{d.key} v{d.version}</small></h1>
      <p><Link href={`/o/${ctx.slug}/segments`}>All segments</Link></p>
      {def.description && <p>{def.description}</p>}
      <h2>Definition</h2>
      <p>Hash <code data-testid="definition-hash">{d.definitionHash}</code></p>
      <pre data-testid="definition">{JSON.stringify(def.filters, null, 2)}</pre>
      {can(ctx.role, 'results.write') && (
        <ActionForm action={runSegmentAction.bind(null, ctx.slug)}>
          <input type="hidden" name="definitionId" value={d.id} />
          <label>As of <input name="asOf" type="date" required defaultValue={last?.asOf.toISOString().slice(0, 10)} /></label> <button type="submit">Run</button>
        </ActionForm>
      )}
      <h2>Latest run</h2>
      {last ? (
        <>
          <p data-testid="run">Ran {last.at.toISOString()} as of {last.asOf.toISOString().slice(0, 10)}: <strong data-testid="run-count">{last.count}</strong> member(s), member-list hash <code>{last.memberListHash}</code>, definition hash {last.definitionHash === d.definitionHash ? 'matches' : 'DIFFERS from'} the saved version.</p>
          <ul data-testid="members">
            {last.members.map((m) => <li key={m}><Link href={`/o/${ctx.slug}/constituents/${m}`}>{m}</Link> {names.get(m)}</li>)}
          </ul>
          {runs.length > 1 && <p>{runs.length - 1} earlier run(s): {runs.slice(1).map((r) => `${r.asOf.toISOString().slice(0, 10)} → ${r.count}`).join(', ')}</p>}
        </>
      ) : <p data-testid="run">Never run.</p>}
    </main>
  );
}
