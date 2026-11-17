import Link from 'next/link';
import { requireOrg } from '@/core/authz/guards';
import { formatCents } from '@/lib/money';
import { giftList, parseGiftQuery } from './query';

export const metadata = { title: 'Gifts' };
export const dynamic = 'force-dynamic';

export default async function Gifts({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireOrg((await params).org);
  const base = `/o/${ctx.slug}`;
  const q = parseGiftQuery(await searchParams);
  const { gifts, names, byDate, view, funds, campaigns } = await giftList(ctx.orgId, q);
  const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString();
  return (
    <main>
      <h1>Gifts</h1>
      <form method="get">
        <label>As of <input name="asOf" type="date" defaultValue={q.asOf} /></label>{' '}
        <label>From <input name="from" type="date" defaultValue={q.from} /></label>{' '}
        <label>To <input name="to" type="date" defaultValue={q.to} /></label>{' '}
        <label>Fund{' '}
          <select name="fund" defaultValue={q.fund}><option value="">All</option>{funds.map((f) => <option key={f} value={f}>{f}</option>)}</select>
        </label>{' '}
        <label>Campaign{' '}
          <select name="campaign" defaultValue={q.campaign}><option value="">All</option>{campaigns.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        </label>{' '}
        <button type="submit">Filter</button>
      </form>
      <p data-testid="gift-total">{formatCents(view.total.raised)} in {view.total.gifts} gift(s) from {view.total.donors} donor(s), as of {q.asOf}</p>
      <p><a href={`${base}/gifts/gifts.csv?${qs}`}>Download as CSV</a> · <Link href={`${base}/campaigns?asOf=${q.asOf}`}>Campaign roll-ups</Link></p>
      <h2>By fund</h2>
      <table data-testid="by-fund">
        <thead><tr><th>Fund</th><th>Gifts</th><th>Raised</th></tr></thead>
        <tbody>{Object.entries(view.funds).map(([f, r]) => <tr key={f}><td>{f}</td><td>{r.gifts}</td><td data-cents={r.raised}>{formatCents(r.raised)}</td></tr>)}</tbody>
      </table>
      <h2>By date</h2>
      <table data-testid="by-date">
        <thead><tr><th>Date</th><th>Raised</th></tr></thead>
        <tbody>{byDate.map(([d, n]) => <tr key={d}><td>{d}</td><td>{formatCents(n)}</td></tr>)}</tbody>
      </table>
      <h2>Gifts</h2>
      <table data-testid="gift-rows">
        <thead><tr><th>Gift</th><th>Date</th><th>Donor</th><th>Fund</th><th>Appeal</th><th>Amount</th></tr></thead>
        <tbody>
          {gifts.map((g) => (
            <tr key={g.giftRef}>
              <td>{g.giftRef}</td><td>{g.giftDate}</td>
              <td><Link href={`${base}/constituents/${g.constituent}`}>{names.get(g.constituent) ?? g.constituent}</Link></td>
              <td>{g.fund}</td><td>{g.appeal || '(no appeal)'}</td><td>{formatCents(g.amountCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
