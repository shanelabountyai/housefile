import Link from 'next/link';
import { inOrg, requireOrg } from '@/core/authz/guards';
import { db } from '@/core/db';
import { listReview } from '@/commit/review';

export const metadata = { title: 'Review queue' };
export const dynamic = 'force-dynamic';

type SP = { batch?: string; flag?: string; decided?: string };

export default async function Review({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<SP> }) {
  const ctx = await requireOrg((await params).org);
  const sp = await searchParams;
  const base = `/o/${ctx.slug}`;
  const batches = await db.importBatch.findMany({ where: inOrg(ctx), orderBy: { createdAt: 'desc' }, select: { id: true, fileName: true } });
  const all = await listReview(db, { orgId: ctx.orgId, batchId: sp.batch || undefined });
  const flags = [...new Set(all.flatMap((r) => r.items.flatMap((i) => i.flags)))].sort();
  const rows = sp.flag ? all.filter((r) => r.items.some((i) => i.flags.includes(sp.flag!))) : all;
  return (
    <main>
      <h1>Review queue</h1>
      {sp.decided && <p role="status">Decided {sp.decided}.</p>}
      <form method="get">
        <label>Batch{' '}
          <select name="batch" defaultValue={sp.batch ?? ''}>
            <option value="">All batches</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.fileName} ({b.id.slice(0, 8)})</option>)}
          </select>
        </label>
        <label>Flag{' '}
          <select name="flag" defaultValue={sp.flag ?? ''}>
            <option value="">Any</option>
            {flags.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <button type="submit">Filter</button>
      </form>
      <p data-testid="open-count">{rows.length} open row(s)</p>
      <table>
        <thead><tr><th>Row</th><th>Name</th><th>Gift</th><th>Candidates</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.batchId}:${r.rowIndex}`}>
              <td><Link href={`${base}/review/${r.batchId}/${r.rowIndex}`}>{r.rowId}</Link></td>
              <td>{r.row.name}</td>
              <td>{r.row.giftDate} {r.row.cents === null ? '' : `${r.row.cents}c`}</td>
              <td>{r.items.map((i) => `${i.candidate} (${i.score})`).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
