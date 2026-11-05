// Parse → map → normalize → validate for one file. Shared by import:eval and import:dry-run.
import { parseCsv, type ParsedCsv } from './csv';
import { resolveMap, type ColumnMap } from './map';
import { validateRow, type ImportRow } from './validate';

export const DEFAULT_AS_OF = '2026-10-14'; // the fixtures' batch date (brief §3, generated 2026-10-14)

export type LoadedFile = {
  tag: string;
  parsed: ParsedCsv;
  map: ColumnMap;
  extras: string[];
  rows: ImportRow[];
};

export type LoadOptions = { tag: string; asOf?: string; map?: ColumnMap };

export const rowId = (tag: string, index: number) => `${tag}-${String(index + 1).padStart(4, '0')}`;

export function loadImportFile(bytes: Uint8Array, opts: LoadOptions): LoadedFile {
  const parsed = parseCsv(bytes);
  const { map, extras } = resolveMap(parsed.headers, opts.map);
  const asOf = opts.asOf ?? DEFAULT_AS_OF;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error(`asOf must be an ISO date (YYYY-MM-DD), got "${asOf}"`);
  const rows = parsed.rows.map((r) => validateRow(rowId(opts.tag, r.index), r.index, r.cells, r.raw, map, { asOf, extras }));
  return { tag: opts.tag, parsed, map, extras, rows };
}
