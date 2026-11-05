// Stage 1, Parse (brief §4): bytes → encoding (N9) → records. RFC 4180 quoting (doubled quotes, embedded
// newlines and commas inside quotes), CRLF or LF, BOM stripped. Written here on purpose (CLAUDE.md: no CSV
// library). The raw text of each record is kept so a byte-identical duplicate row can be recognised (S4).
import { sha256Bytes } from '../lib/canonical';
import { decodeBytes, type Encoding } from './normalize/encoding';

export type CsvRow = {
  index: number; // 0-based data row index (header excluded)
  cells: Record<string, string>; // header → cell; a short row's missing cells are ""
  raw: string; // the record's source text without its line terminator
  extraCells: string[]; // cells past the header count
};

export type ParsedCsv = {
  headers: string[];
  rows: CsvRow[];
  encoding: Encoding;
  contentHash: string; // sha256 of the raw bytes (D-10)
  bytes: number;
};

/** Split decoded text into records of fields. Empty records (blank lines) are skipped, as csv readers do. */
export function parseCsvText(text: string): { records: string[][]; raws: string[] } {
  const records: string[][] = [];
  const raws: string[] = [];
  let fields: string[] = [];
  let field = '';
  let quoted = false;
  let recordStart = 0;
  let i = 0;
  const n = text.length;
  const endRecord = (end: number, next: number) => {
    fields.push(field);
    const raw = text.slice(recordStart, end);
    if (!(fields.length === 1 && fields[0] === '')) {
      records.push(fields);
      raws.push(raw);
    }
    fields = [];
    field = '';
    recordStart = next;
  };
  while (i < n) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"' && field === '') {
      quoted = true;
      i++;
      continue;
    }
    if (c === ',') {
      fields.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r' || c === '\n') {
      const len = c === '\r' && text[i + 1] === '\n' ? 2 : 1;
      endRecord(i, i + len);
      i += len;
      continue;
    }
    field += c;
    i++;
  }
  if (field !== '' || fields.length > 0) endRecord(n, n);
  return { records, raws };
}

export function parseCsv(bytes: Uint8Array): ParsedCsv {
  const { text, encoding } = decodeBytes(bytes);
  const { records, raws } = parseCsvText(text);
  const headers = records[0] ?? [];
  const rows: CsvRow[] = [];
  for (let r = 1; r < records.length; r++) {
    const rec = records[r]!;
    const cells: Record<string, string> = {};
    headers.forEach((h, j) => {
      cells[h] = rec[j] ?? '';
    });
    rows.push({ index: r - 1, cells, raw: raws[r]!, extraCells: rec.slice(headers.length) });
  }
  return { headers, rows, encoding, contentHash: sha256Bytes(bytes), bytes: bytes.length };
}
