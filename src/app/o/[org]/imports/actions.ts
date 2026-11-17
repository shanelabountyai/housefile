'use server';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { orgAction, ref } from '@/core/authz/action';
import { db } from '@/core/db';
import { Refused } from '@/core/errors';
import { commitBatch } from '@/commit/commit';
import { previewBatch } from '@/commit/preview';
import { undoBatch } from '@/commit/undo';
import { FIELDS, MapRefused, type ColumnMap } from '@/import/map';

// Task 3.9 (D-50, P-15): every action is a thin call into src/commit/; the pages write nothing themselves.
// A preview batch is the stored preview (task 2.3), so "upload" and "re-map" both just store a new one.
const asOf = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'As-of date must be YYYY-MM-DD.');
const base = (slug: string) => `/o/${slug}/imports`;

async function ownBatch(orgId: string, id: string) {
  const b = await db.importBatch.findFirst({ where: { id, orgId } });
  if (!b) notFound(); // not yours ≡ not found (INV-04)
  return b;
}

async function preview(orgId: string, userId: string, input: { fileName: string; bytes: Uint8Array; map?: ColumnMap; asOf: string }) {
  try {
    return await previewBatch(db, { orgId, userId, ...input });
  } catch (e) {
    if (e instanceof MapRefused) throw new Refused(e.message);
    throw e;
  }
}

// A File has no JSON Schema, so it is not declared: the loose object passes it through and the body checks it.
export const uploadImport = orgAction('results.write', z.looseObject({ asOf }), async (ctx, i) => {
  const file = i.file;
  if (!(file instanceof File)) throw new Refused('Choose a CSV file.');
  if (!file.size) throw new Refused('That file is empty.');
  const r = await preview(ctx.orgId, ctx.userId, { fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()), asOf: i.asOf });
  redirect(`${base(ctx.slug)}/${r.batchId}`);
});

/** Confirm or correct the proposed map: the same bytes, the posted map, stored as a new preview. */
export const remapImport = orgAction('results.write', z.object({ batchId: ref('importBatch') }).catchall(z.string()), async (ctx, i) => {
  const b = await ownBatch(ctx.orgId, i.batchId);
  const map: ColumnMap = {};
  for (const f of FIELDS) if (i[`map_${f}`]) map[f] = i[`map_${f}`];
  const r = await preview(ctx.orgId, ctx.userId, { fileName: b.fileName, bytes: new Uint8Array(b.rawBytes), map, asOf: b.asOf.toISOString().slice(0, 10) });
  redirect(`${base(ctx.slug)}/${r.batchId}`);
});

export const commitImport = orgAction('results.write', z.object({ batchId: ref('importBatch') }), async (ctx, i) => {
  await ownBatch(ctx.orgId, i.batchId);
  const r = await commitBatch(db, { batchId: i.batchId, userId: ctx.userId });
  if (r.status !== 'COMMITTED') throw new Refused(`Not committed: ${r.status}${r.expected ? ` (the data moved since the preview: expected ${r.expected}, found ${r.actual})` : ''}.`);
  redirect(`${base(ctx.slug)}/${i.batchId}`);
});

export const undoImport = orgAction('results.write', z.object({ batchId: ref('importBatch') }), async (ctx, i) => {
  await ownBatch(ctx.orgId, i.batchId);
  const r = await undoBatch(db, { batchId: i.batchId, userId: ctx.userId });
  if (r.status === 'REFUSED') throw new Refused(`Undo refused: ${r.code}${r.detail ? ` (${r.detail})` : ''}.`);
  if (r.status === 'UNDO_FAILED') throw new Refused(`Undo rolled back: the state hash ${r.actual} did not equal the stored ${r.expected}.`);
  redirect(`${base(ctx.slug)}/${i.batchId}`);
});
