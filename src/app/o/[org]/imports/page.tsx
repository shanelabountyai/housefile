import Link from 'next/link';
import { inOrg, requireOrg } from '@/core/authz/guards';
import { can } from '@/core/authz/permissions';
import { db } from '@/core/db';
import { ActionForm } from '@/core/ui/action-form';
import { batchStatus } from '@/commit/review';
import { DEFAULT_AS_OF } from '@/import/pipeline';
import { uploadImport } from './actions';

export const metadata = { title: 'Imports' };
export const dynamic = 'force-dynamic';

export default async function Imports({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrg((await params).org);
  const batches = await db.importBatch.findMany({ where: inOrg(ctx), orderBy: { createdAt: 'desc' }, select: { id: true, fileName: true, createdAt: true, planHash: true } });
  const rows = await Promise.all(batches.map(async (b) => ({ ...b, status: await batchStatus(db, b.id) })));
  return (
    <main>
      <h1>Imports</h1>
      <p>Nothing is written until you commit a batch you have previewed. Synthetic data only.</p>
      {can(ctx.role, 'results.write') && (
        <>
          <h2>Upload a file</h2>
          <ActionForm action={uploadImport.bind(null, ctx.slug)}>
            <label>CSV file <input type="file" name="file" accept=".csv,text/csv" required /></label>
            <label>As-of date <input name="asOf" defaultValue={DEFAULT_AS_OF} required pattern="\d{4}-\d{2}-\d{2}" /></label>
            <button type="submit">Upload and preview</button>
          </ActionForm>
        </>
      )}
      <h2>Batches</h2>
      <table>
        <thead><tr><th>File</th><th>Status</th><th>Plan hash</th></tr></thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id}>
              <td><Link href={`/o/${ctx.slug}/imports/${b.id}`}>{b.fileName}</Link></td>
              <td>{b.status}</td>
              <td><code>{b.planHash.slice(0, 12)}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p>No batches yet.</p>}
    </main>
  );
}
