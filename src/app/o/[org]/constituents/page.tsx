import Link from 'next/link';
import { requireOrg } from '@/core/authz/guards';
import { db } from '@/core/db';
import { loadEffectiveState } from '@/commit/db-state';

export const metadata = { title: 'Constituents' };
export const dynamic = 'force-dynamic';
const LIMIT = 100; // ponytail: no pagination; search narrows it

export default async function Constituents({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireOrg((await params).org);
  const q = ((await searchParams).q ?? '').trim().toLowerCase();
  const all = (await loadEffectiveState(db, ctx.orgId)).constituents;
  const rows = all.filter((c) => !q || `${c.id} ${c.firstName} ${c.lastName} ${c.email}`.toLowerCase().includes(q));
  return (
    <main>
      <h1>Constituents</h1>
      <form method="get"><label>Search <input name="q" defaultValue={q} /></label> <button type="submit">Search</button></form>
      <p data-testid="constituent-count">{rows.length} of {all.length}{rows.length > LIMIT ? `, showing the first ${LIMIT}` : ''}</p>
      <table>
        <thead><tr><th>Id</th><th>Name</th><th>Email</th><th>City</th></tr></thead>
        <tbody>
          {rows.slice(0, LIMIT).map((c) => (
            <tr key={c.id}><td><Link href={`/o/${ctx.slug}/constituents/${c.id}`}>{c.id}</Link></td><td>{`${c.firstName} ${c.lastName}`.trim()}</td><td>{c.email}</td><td>{c.city}</td></tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
