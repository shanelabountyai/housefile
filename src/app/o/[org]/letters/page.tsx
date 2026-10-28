import { requireOrg } from '@/core/authz/guards';
import { can } from '@/core/authz/permissions';
import { db } from '@/core/db';
import { ActionForm } from '@/core/ui/action-form';
import { loadLetters } from '@/commit/letters';
import { BANNER } from '@/letters/letters';
import { formatCents } from '@/lib/money';
import { queueLettersAction } from './actions';

export const metadata = { title: 'Letters' };
export const dynamic = 'force-dynamic';

export default async function Letters({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ queued?: string; letter?: string }> }) {
  const ctx = await requireOrg((await params).org);
  const sp = await searchParams;
  const letters = await loadLetters(db, ctx.orgId);
  const stale = letters.filter((l) => l.status === 'LETTER_STALE').length;
  const shown = letters.find((l) => l.letterRef === sp.letter);
  return (
    <main>
      <h1>Acknowledgement letters</h1>
      <p data-testid="banner"><strong>{BANNER}</strong></p>
      {sp.queued && <p role="status" data-testid="queued-notice">Queued {sp.queued} letter(s). Nothing was sent.</p>}
      {can(ctx.role, 'results.write') && (
        <ActionForm action={queueLettersAction.bind(null, ctx.slug)}>
          <label>As of <input name="asOf" type="date" required /></label>{' '}
          <label>From <input name="from" type="date" /></label>{' '}
          <label>To <input name="to" type="date" /></label>{' '}
          <label><input name="combine" type="checkbox" /> One letter per household</label>{' '}
          <button type="submit">Queue letters for gifts with none</button>
        </ActionForm>
      )}
      <p data-testid="letter-counts">{letters.length} letter(s): {letters.length - stale} queued, {stale} stale (a covered gift changed after the letter was written).</p>
      <table data-testid="letters">
        <thead><tr><th>Letter</th><th>To</th><th>Gifts</th><th>Total</th><th>As of</th><th>Status</th></tr></thead>
        <tbody>
          {letters.map((l) => (
            <tr key={l.letterRef} data-status={l.status}>
              <td><a href={`?letter=${l.letterRef}`}>{l.letterRef}</a></td><td>{l.recipient}{l.household ? ' (household)' : ''}</td><td>{l.giftRefs.length}</td><td>{formatCents(l.totalCents)}</td><td>{l.asOf}</td><td>{l.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {shown && <section data-testid="letter"><h2>{shown.letterRef}: {shown.subject}</h2><pre style={{ whiteSpace: 'pre-wrap' }}>{shown.body}</pre></section>}
    </main>
  );
}
