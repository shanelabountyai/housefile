import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOrg } from '@/core/authz/guards';
import { can } from '@/core/authz/permissions';
import { db } from '@/core/db';
import { ActionForm } from '@/core/ui/action-form';
import { loadEffectiveConstituent, loadEffectiveState, type ConstituentSnapshot } from '@/commit/db-state';
import { laterMerges, snapshotHash } from '@/commit/unmerge';
import { householdGiving, householdMembers, householdName } from '@/derive/households';
import { pledgeBalances } from '@/derive/pledges';
import { recognition } from '@/derive/recognition';
import { formatCents } from '@/lib/money';
import { unmergeMerge } from '../actions';

export const metadata = { title: 'Constituent' };
export const dynamic = 'force-dynamic';

const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function Constituent({ params, searchParams }: { params: Promise<{ org: string; id: string }>; searchParams: Promise<{ asOf?: string }> }) {
  const ctx = await requireOrg((await params).org);
  const p = await params;
  const sp = await searchParams;
  const asOf = sp.asOf && /^\d{4}-\d{2}-\d{2}$/.test(sp.asOf) ? sp.asOf : new Date().toISOString().slice(0, 10);
  const row = await db.constituent.findFirst({ where: { orgId: ctx.orgId, businessId: p.id }, select: { id: true } });
  if (!row) notFound();
  const base = `/o/${ctx.slug}`;
  const writer = can(ctx.role, 'results.write');
  const snap = await loadEffectiveConstituent(db, row.id);
  const c = snap.constituent;
  const state = await loadEffectiveState(db, ctx.orgId);

  const members = c.household ? householdMembers(state, c.household) : [];
  const balances = pledgeBalances(state, asOf);
  const pledges = (state.pledges ?? []).filter((x) => x.constituent === c.id);
  const credits = state.softCredits.filter((s) => s.constituent === c.id);
  const rec = recognition(state, asOf)[c.id] ?? { hardCents: 0, softCents: 0, totalCents: 0 };

  // every row of every chain this constituent holds a gift of: superseded rows stay, struck through, with the reason of the row that replaced them
  const refs = (await db.gift.findMany({ where: { orgId: ctx.orgId, constituentId: row.id }, select: { giftRef: true }, distinct: ['giftRef'] })).map((g) => g.giftRef);
  const history = await db.gift.findMany({
    where: { orgId: ctx.orgId, giftRef: { in: refs } }, include: { fund: true, appeal: true, supersededBy: { select: { reason: true } } }, orderBy: [{ giftRef: 'asc' }, { createdAt: 'asc' }],
  });

  const merges = await db.mergeEvent.findMany({
    where: { orgId: ctx.orgId, OR: [{ survivorId: row.id }, { loserId: row.id }] },
    include: { unmerge: true, survivor: { select: { businessId: true } }, loser: { select: { businessId: true } } }, orderBy: { at: 'asc' },
  });
  const blockers = new Map(await Promise.all(merges.map(async (m) => [m.id, m.unmerge ? [] : await laterMerges(db, m)] as const)));

  return (
    <main>
      <h1>{`${c.firstName} ${c.lastName}`.trim()} <small>{c.id}</small></h1>
      {snap.status === 'RETIRED' && <p role="status" data-testid="retired">Retired: merged into another constituent.</p>}
      <p><Link href={`${base}/constituents`}>All constituents</Link> · <Link href={`${base}/gifts?asOf=${asOf}`}>Gift list</Link></p>

      <h2>Current fields</h2>
      <table data-testid="fields">
        <thead><tr><th>Field</th><th>Value</th><th>Source</th><th>As of</th></tr></thead>
        <tbody>
          {([['name', [c.firstName, c.middleName, c.lastName, c.suffix].filter(Boolean).join(' ')], ['email', c.email], ['phone', c.phone], ['dob', c.dob], ['address', [c.addressLine1, c.addressLine2, c.city, c.state, c.zip].filter(Boolean).join(', ')]] as const).map(([f, v]) => (
            <tr key={f}><td>{f}</td><td>{v}</td><td>{c.fieldMeta[f]?.source ?? ''}</td><td>{c.fieldMeta[f]?.asOf ?? ''}</td></tr>
          ))}
        </tbody>
      </table>
      {(c.aliases.length > 0 || c.alternates.length > 0) && (
        <>
          <h3>Aliases and alternates</h3>
          <ul data-testid="alternates">
            {c.aliases.map((a, i) => <li key={`a${i}`}>alias {[a.first, a.middle, a.last, a.suffix].filter(Boolean).join(' ')} (source {a.source}, as of {a.asOf})</li>)}
            {c.alternates.map((a, i) => <li key={`b${i}`}>{a.field}: {a.value} (source {a.source}, as of {a.asOf})</li>)}
          </ul>
        </>
      )}

      <h2>Household</h2>
      {members.length ? (
        <p data-testid="household">{householdName(members)} ({c.household}): {members.map((m) => m.id).join(', ')} · gave {formatCents(householdGiving(state, c.household))}</p>
      ) : <p data-testid="household">No household.</p>}

      <h2>Giving history</h2>
      <p data-testid="recognition">Recognition as of {asOf}: hard {formatCents(rec.hardCents)} + soft {formatCents(rec.softCents)} = {formatCents(rec.totalCents)}. Raised totals never include soft credits.</p>
      <table data-testid="gifts">
        <thead><tr><th>Gift</th><th>Date</th><th>Fund</th><th>Appeal</th><th>Amount</th><th>Note</th></tr></thead>
        <tbody>
          {history.map((g) => {
            const sup = g.supersededBy;
            const st = sup ? { textDecoration: 'line-through' } : undefined;
            return (
              <tr key={g.id} data-superseded={sup ? 'true' : undefined}>
                <td style={st}>{g.giftRef}</td><td style={st}>{day(g.giftDate)}</td><td style={st}>{g.fund.code}</td><td style={st}>{g.appeal?.name ?? '(no appeal)'}</td><td style={st}>{formatCents(g.amountCents)}</td>
                <td>{sup ? `superseded: ${sup.reason}` : g.status === 'VOIDED' ? `VOIDED: ${g.reason}` : g.reason ?? ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Pledges</h2>
      {pledges.length ? (
        <table data-testid="pledges">
          <thead><tr><th>Pledge</th><th>Date</th><th>Fund</th><th>Total</th><th>Paid</th><th>Balance</th></tr></thead>
          <tbody>{pledges.map((x) => { const b = balances[x.pledgeRef]!; return <tr key={x.pledgeRef}><td>{x.pledgeRef}</td><td>{x.pledgeDate}</td><td>{x.fund}</td><td>{formatCents(b.totalCents)}</td><td>{formatCents(b.paidCents)} ({b.payments})</td><td>{formatCents(b.balanceCents)}</td></tr>; })}</tbody>
        </table>
      ) : <p>No pledges.</p>}

      <h2>Soft credits</h2>
      {credits.length ? (
        <ul data-testid="soft-credits">{credits.map((s) => <li key={s.softCreditRef}>{s.softCreditRef}: {s.role} on {s.giftRef}, {formatCents(s.amountCents)}</li>)}</ul>
      ) : <p>No soft credits.</p>}

      <h2>Merge history</h2>
      {merges.length ? merges.map((m) => {
        const later = blockers.get(m.id) ?? [];
        const survives = m.survivor.businessId;
        const survSnap = snapshotHash(m.survivorSnapshot as unknown as ConstituentSnapshot);
        const loserSnap = m.loserId ? snapshotHash(m.loserSnapshot as unknown as ConstituentSnapshot) : null;
        return (
          <section key={m.id} data-testid="merge">
            <p>{day(m.at)}: {m.kind === 'CONSTITUENT_INTO_CONSTITUENT' ? `${m.loser?.businessId} into ${survives}` : `import row ${m.rowIndex} into ${survives}`}{m.reason ? ` — ${m.reason}` : ''} · moved {m.giftRefsMoved.length} gift(s)</p>
            {m.unmerge ? (
              <p data-testid="unmerge-proof">
                Unmerged. Survivor hash <code>{m.unmerge.survivorHash}</code> {m.unmerge.survivorHash === survSnap ? '==' : '!='} its snapshot <code>{survSnap}</code>
                {loserSnap && <>; loser hash <code>{m.unmerge.loserHash}</code> {m.unmerge.loserHash === loserSnap ? '==' : '!='} its snapshot <code>{loserSnap}</code></>}.
              </p>
            ) : later.length ? (
              <p data-testid="unmerge-state">Unmerge is blocked: <code>UNMERGE_BLOCKED</code> by a later merge ({later.map((l) => l.id.slice(0, 8)).join(', ')}). Reverse the later merge first.</p>
            ) : writer ? (
              <ActionForm action={unmergeMerge.bind(null, ctx.slug)}>
                <p data-testid="unmerge-state">Unmerge is available. Both records come back exactly, proven by hash, or it rolls back.</p>
                <input type="hidden" name="mergeEventId" value={m.id} />
                <label>Reason (optional) <input name="reason" /></label> <button type="submit">Unmerge</button>
              </ActionForm>
            ) : <p data-testid="unmerge-state">Unmerge needs the results.write permission.</p>}
          </section>
        );
      }) : <p>No merges.</p>}
    </main>
  );
}
