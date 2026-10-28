import Link from 'next/link';
import { requireOrg } from '@/core/authz/guards';
import { db } from '@/core/db';
import { loadAppealCampaigns, loadEffectiveState } from '@/commit/db-state';
import { rollups, type Rollup } from '@/derive/rollups';
import { formatCents } from '@/lib/money';

export const metadata = { title: 'Campaigns' };
export const dynamic = 'force-dynamic';

const Rows = ({ id, r, kind }: { id: string; r: Rollup; kind: string }) => (
  <>
    <tr data-testid={`${kind}-${id}`}><th scope="row">{id}</th><td>{r.gifts}</td><td>{r.donors}</td><td data-cents={r.raised}>{formatCents(r.raised)}</td><td>{formatCents(r.average)} r {r.remainder}</td></tr>
    {Object.entries(r.appeals).map(([a, s]) => <tr key={a}><td>&nbsp;&nbsp;{a}</td><td>{s.gifts}</td><td>{s.donors}</td><td>{formatCents(s.raised)}</td><td>{formatCents(s.average)} r {s.remainder}</td></tr>)}
  </>
);

export default async function Campaigns({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ asOf?: string }> }) {
  const ctx = await requireOrg((await params).org);
  const sp = await searchParams;
  const asOf = sp.asOf && /^\d{4}-\d{2}-\d{2}$/.test(sp.asOf) ? sp.asOf : new Date().toISOString().slice(0, 10);
  const view = rollups(await loadEffectiveState(db, ctx.orgId), asOf, await loadAppealCampaigns(db, ctx.orgId));
  const head = <thead><tr><th>Name</th><th>Gifts</th><th>Donors</th><th>Raised</th><th>Average</th></tr></thead>;
  return (
    <main>
      <h1>Campaigns and funds</h1>
      <form method="get"><label>As of <input name="asOf" type="date" defaultValue={asOf} /></label> <button type="submit">Show</button></form>
      <p data-testid="campaign-total">Total {formatCents(view.total.raised)} in {view.total.gifts} gift(s) from {view.total.donors} donor(s), average {formatCents(view.total.average)} r {view.total.remainder}. Soft credits are never counted here.</p>
      <h2>Campaigns</h2>
      <table data-testid="campaigns">{head}<tbody>{Object.entries(view.campaigns).map(([c, r]) => <Rows key={c} id={c} r={r} kind="campaign" />)}</tbody></table>
      <h2>Funds</h2>
      <p>An imported gift carries a fund and no appeal, so it shows as <code>(no appeal)</code> under its fund, never guessed into a campaign.</p>
      <table data-testid="funds">{head}<tbody>{Object.entries(view.funds).map(([f, r]) => <Rows key={f} id={f} r={r} kind="fund" />)}</tbody></table>
      <p><Link href={`/o/${ctx.slug}/gifts?asOf=${asOf}`}>Gift list</Link></p>
    </main>
  );
}
