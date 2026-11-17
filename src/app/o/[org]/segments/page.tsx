import Link from 'next/link';
import { requireOrg } from '@/core/authz/guards';
import { db } from '@/core/db';
import type { SegmentDefinition } from '@/segments/segment';

export const metadata = { title: 'Segments' };
export const dynamic = 'force-dynamic';

export default async function Segments({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrg((await params).org);
  // latest version per key, with its latest run
  const all = await db.segmentDefinition.findMany({ where: { orgId: ctx.orgId }, orderBy: [{ key: 'asc' }, { version: 'desc' }], include: { runs: { orderBy: { at: 'desc' }, take: 1 } } });
  const latest = all.filter((d, i) => i === 0 || all[i - 1]!.key !== d.key);
  return (
    <main>
      <h1>Segments</h1>
      <p>A segment is data: a closed set of filters, all ANDed, run at an explicit as-of date. A run is a snapshot, never read back as truth.</p>
      <table data-testid="segments">
        <thead><tr><th>Key</th><th>Name</th><th>Version</th><th>Last run</th><th>As of</th><th>Count</th></tr></thead>
        <tbody>
          {latest.map((d) => {
            const r = d.runs[0];
            return (
              <tr key={d.id}>
                <td><Link href={`/o/${ctx.slug}/segments/${d.key}`}>{d.key}</Link></td><td>{(d.definition as unknown as SegmentDefinition).name}</td><td>{d.version}</td>
                <td>{r ? r.at.toISOString() : 'never run'}</td><td>{r ? r.asOf.toISOString().slice(0, 10) : ''}</td><td>{r ? r.count : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
