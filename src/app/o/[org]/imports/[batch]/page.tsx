import Link from 'next/link';
import { notFound } from 'next/navigation';
import { inOrg, requireOrg } from '@/core/authz/guards';
import { can } from '@/core/authz/permissions';
import { db } from '@/core/db';
import { ActionForm } from '@/core/ui/action-form';
import { undoBatch } from '@/commit/undo';
import { batchStatus, listReview } from '@/commit/review';
import type { StoredMap } from '@/commit/preview';
import { FIELDS } from '@/import/map';
import type { Preview } from '@/import/preview';
import { formatPreview } from '@/import/report';
import { commitImport, remapImport, undoImport } from '../actions';

export const metadata = { title: 'Import batch' };
export const dynamic = 'force-dynamic';

class DryRun extends Error {}

/** Is undo blocked, and why? Runs the real undo and rolls it back at the proof step: the answer is the function's own refusal, not a copy of its rules. */
async function undoBlock(batchId: string, userId: string): Promise<string | null> {
  try {
    const r = await undoBatch(db, { batchId, userId, beforeProof: async () => { throw new DryRun(); } });
    return r.status === 'REFUSED' ? `${r.code}${r.detail ? ` (${r.detail})` : ''}` : null;
  } catch (e) {
    if (e instanceof DryRun) return null;
    throw e;
  }
}

export default async function BatchPage({ params }: { params: Promise<{ org: string; batch: string }> }) {
  const ctx = await requireOrg((await params).org);
  const p = await params;
  const b = await db.importBatch.findFirst({ where: { id: p.batch, ...inOrg(ctx) }, include: { events: { orderBy: { at: 'asc' } } } });
  if (!b) notFound();
  const status = await batchStatus(db, b.id);
  const plan = b.plan as unknown as Preview;
  const map = (b.map as StoredMap).fields as Record<string, string>;
  const headers = plan.file.headers;
  const writer = can(ctx.role, 'results.write');
  const committed = status === 'COMMITTED' || status === 'COMPLETE';
  const undone = b.events.find((e) => e.kind === 'UNDONE');
  const failed = b.events.filter((e) => e.kind === 'UNDO_FAILED');

  const written = committed
    ? {
        constituents: (await db.constituentVersion.findMany({ where: { importBatchId: b.id, version: 1 }, select: { constituentId: true } })).length,
        versions: await db.constituentVersion.count({ where: { OR: [{ importBatchId: b.id }, { mergeEvent: { importBatchId: b.id } }] } }),
        gifts: await db.gift.count({ where: { importBatchId: b.id } }),
        merges: await db.mergeEvent.count({ where: { importBatchId: b.id } }),
        reviewItems: await db.reviewItem.count({ where: { importBatchId: b.id } }),
        reviewRows: (await db.reviewItem.findMany({ where: { importBatchId: b.id }, distinct: ['rowIndex'], select: { rowIndex: true } })).length,
      }
    : null;
  const open = committed ? (await listReview(db, { orgId: ctx.orgId, batchId: b.id })).length : 0;
  const blocked = committed && writer ? await undoBlock(b.id, ctx.userId) : null;
  const t = plan.totals;
  const base = `/o/${ctx.slug}`;

  return (
    <main>
      <h1>{b.fileName}</h1>
      <p><Link href={`${base}/imports`}>All imports</Link></p>
      <p>Status: <strong data-testid="status">{status}</strong> · as-of {plan.file.asOf} · plan hash <code>{b.planHash}</code> · before hash <code>{b.beforeHash}</code></p>

      <h2>Column map</h2>
      <table>
        <thead><tr><th>Field</th><th>Column</th></tr></thead>
        <tbody>{Object.entries(map).map(([f, h]) => <tr key={f}><td>{f}</td><td>{h}</td></tr>)}</tbody>
      </table>
      <p>Unmapped columns kept as extras: {plan.file.extras.join(', ') || '(none)'}</p>
      {writer && status === 'PREVIEWED' && (
        <details>
          <summary>Correct the map</summary>
          <ActionForm action={remapImport.bind(null, ctx.slug)}>
            <input type="hidden" name="batchId" value={b.id} />
            {FIELDS.map((f) => (
              <label key={f}>{f}{' '}
                <select name={`map_${f}`} defaultValue={map[f] ?? ''}>
                  <option value="">(none)</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
            <button type="submit">Re-preview with this map</button>
          </ActionForm>
        </details>
      )}

      <h2>Preview</h2>
      <p data-testid="totals">
        rows {t.rows} = merged {t.merged} + reviewed {t.reviewed} + new {t.new} + rejected {t.rejected} · gifts to add {t.giftsToAdd} · pending review {t.giftsPendingReview} · skipped {t.dupGift + t.dupGiftInFile} · held {t.giftsHeld}
      </p>
      <p><a href={`${base}/imports/${b.id}/preview.csv`}>Download the preview as CSV</a></p>
      <details>
        <summary>Full report (validation, creates, changes, review pairs)</summary>
        <pre>{formatPreview(plan)}</pre>
      </details>

      {writer && status === 'PREVIEWED' && (
        <ActionForm action={commitImport.bind(null, ctx.slug)}>
          <input type="hidden" name="batchId" value={b.id} />
          <button type="submit">Commit exactly this preview</button>
        </ActionForm>
      )}

      {written && (
        <>
          <h2>Written at commit</h2>
          <dl data-testid="written">
            <dt>constituents created</dt><dd data-testid="w-constituents">{written.constituents}</dd>
            <dt>versions</dt><dd data-testid="w-versions">{written.versions}</dd>
            <dt>gifts</dt><dd data-testid="w-gifts">{written.gifts}</dd>
            <dt>merges</dt><dd data-testid="w-merges">{written.merges}</dd>
            <dt>review items</dt><dd data-testid="w-items">{written.reviewItems}</dd>
            <dt>review rows</dt><dd data-testid="w-rows">{written.reviewRows}</dd>
          </dl>
          <p>{open} review row(s) still open. <Link href={`${base}/review?batch=${b.id}`}>Review queue</Link></p>
          <h2>Undo</h2>
          {writer ? (
            blocked ? (
              <p data-testid="undo-state">Undo is blocked: <code>{blocked}</code>. Undo later batches first, newest first.</p>
            ) : (
              <>
                <p data-testid="undo-state">Undo is available. It restores the exact prior state, proven by hash, or it rolls back.</p>
                <ActionForm action={undoImport.bind(null, ctx.slug)}>
                  <input type="hidden" name="batchId" value={b.id} />
                  <button type="submit">Undo this batch</button>
                </ActionForm>
              </>
            )
          ) : (
            <p data-testid="undo-state">Undo needs the results.write permission.</p>
          )}
        </>
      )}
      {undone && (
        <p data-testid="undo-proof">
          Undone: state hash <code>{undone.actualHash}</code> {undone.actualHash === undone.expectedHash ? '==' : '!='} before hash <code>{undone.expectedHash}</code>
        </p>
      )}
      {failed.map((f) => <p key={f.id} role="alert">Undo failed and rolled back: expected <code>{f.expectedHash}</code>, actual <code>{f.actualHash}</code></p>)}
    </main>
  );
}
