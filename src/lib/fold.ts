// Text folding shared by normalization (brief §5) and money parsing (N7).
// NFKD, strip combining marks (diacritics), collapse whitespace, trim, lowercase.

export function fold(s: string | null | undefined): string {
  const nfkd = (s ?? '').normalize('NFKD');
  let out = '';
  for (const ch of nfkd) if (!/\p{M}/u.test(ch)) out += ch;
  return out.replace(/\s+/g, ' ').trim().toLowerCase();
}
