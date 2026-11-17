import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOrg } from '@/core/authz/guards';
import { can } from '@/core/authz/permissions';
import { db } from '@/core/db';
import { ActionForm } from '@/core/ui/action-form';
import { loadEffectiveConstituent } from '@/commit/db-state';
import { listReview } from '@/commit/review';
import { decideItem } from '../../actions';

export const metadata = { title: 'Review pair' };
export const dynamic = 'force-dynamic';

const ACTIONS = ['MERGE', 'KEEP_SEPARATE', 'SAME_HOUSEHOLD', 'DEFER'] as const;

export default async function Pair({ params }: { params: Promise<{ org: string; batch: string; row: string }> }) {
  const ctx = await requireOrg((await params).org);
  const p = await params;
  const queue = await listReview(db, { orgId: ctx.orgId, batchId: p.batch });
  const r = queue.find((x) => String(x.rowIndex) === p.row);
  if (!r) notFound();
  const writer = can(ctx.role, 'results.write');
  const base = `/o/${ctx.slug}`;
  return (
    <main>
      <h1>Review {r.rowId}</h1>
      <p><Link href={`${base}/review?batch=${r.batchId}`}>Back to the queue</Link></p>
      {await Promise.all(r.items.map(async (it) => {
        const c = it.constituentId ? (await loadEffectiveConstituent(db, it.constituentId)).constituent : null;
        return (
          <section key={it.id} aria-label={`candidate ${it.candidate}`}>
            <h2>vs {it.candidate} — score {it.score}</h2>
            <table>
              <thead><tr><th /><th>Import row</th><th>{it.candidate}</th></tr></thead>
              <tbody>
                <tr><th>Name</th><td>{r.row.name}</td><td>{c ? [c.firstName, c.middleName, c.lastName, c.suffix].filter(Boolean).join(' ') : '(a row still in review)'}</td></tr>
                <tr><th>Email</th><td>{r.row.email}</td><td>{c?.email}</td></tr>
                <tr><th>Phone</th><td>{r.row.phone}</td><td>{c?.phone}</td></tr>
                <tr><th>Address</th><td>{r.row.address}</td><td>{c ? [c.addressLine1, c.addressLine2, c.city, c.state, c.zip].filter(Boolean).join(', ') : ''}</td></tr>
                <tr><th>Gift</th><td>{r.row.giftDate} {r.row.cents === null ? '' : `${r.row.cents}c`}</td><td /></tr>
              </tbody>
            </table>
            <p>Reasons: <code>{it.reasons.join(' + ')}</code></p>
            {it.flags.length > 0 && <p>Flags: <code>{it.flags.join(', ')}</code></p>}
            {writer && (
              <ActionForm action={decideItem.bind(null, ctx.slug)}>
                <input type="hidden" name="itemId" value={it.id} />
                <label>Reason (required for MERGE and KEEP_SEPARATE) <input name="reason" maxLength={2000} /></label>
                {ACTIONS.map((a) => <button key={a} type="submit" name="action" value={a}>{a}</button>)}
              </ActionForm>
            )}
          </section>
        );
      }))}
    </main>
  );
}
