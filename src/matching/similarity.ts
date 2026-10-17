// Brief §6: Jaro-Winkler and American Soundex, written here on purpose (CLAUDE.md: no fuzzy or phonetic library).
import { fold } from '../lib/fold';

/**
 * Round to 4 decimal places the way the oracle's `round(x, 4)` does: on the exact binary value, ties to even.
 * toFixed rounds exact ties up, so an exact tie (5 followed by zeros in the exact expansion) is handled here.
 */
export function round4(x: number): number {
  if (x < 0) throw new RangeError('round4: non-negative values only');
  const exact = x.toFixed(30); // exact decimal expansion of the double for |x| < 1e21
  const dot = exact.indexOf('.');
  const tail = exact.slice(dot + 5);
  if (/^50*$/.test(tail)) {
    const down = Number(exact.slice(0, dot + 5));
    const lastDigit = Number(exact[dot + 4]);
    return lastDigit % 2 === 0 ? down : Number((down + 1e-4).toFixed(4));
  }
  return Number(x.toFixed(4));
}

/** Standard Jaro-Winkler: window max(len)/2 − 1, transpositions halved, prefix scale 0.1, max prefix 4; rounded to 4 places. */
export function jaroWinkler(a: string, b: string, prefixScale = 0.1, maxPrefix = 4): number {
  if (a === b) return 1.0;
  if (!a || !b) return 0.0;
  const la = a.length;
  const lb = b.length;
  const window = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);
  const ma = new Array<boolean>(la).fill(false);
  const mb = new Array<boolean>(lb).fill(false);
  let matches = 0;
  for (let i = 0; i < la; i++) {
    const lo = Math.max(0, i - window);
    const hi = Math.min(lb, i + window + 1);
    for (let j = lo; j < hi; j++) {
      if (!mb[j] && a[i] === b[j]) {
        ma[i] = mb[j] = true;
        matches++;
        break;
      }
    }
  }
  if (matches === 0) return 0.0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < la; i++) {
    if (!ma[i]) continue;
    while (!mb[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  t = Math.floor(t / 2);
  const jaro = (matches / la + matches / lb + (matches - t) / matches) / 3;
  let p = 0;
  for (let i = 0; i < Math.min(maxPrefix, la, lb); i++) {
    if (a[i] === b[i]) p++;
    else break;
  }
  return round4(jaro + p * prefixScale * (1 - jaro));
}

const SOUNDEX_CODES: Record<string, string> = {};
for (const c of 'bfpv') SOUNDEX_CODES[c] = '1';
for (const c of 'cgjkqsxz') SOUNDEX_CODES[c] = '2';
for (const c of 'dt') SOUNDEX_CODES[c] = '3';
SOUNDEX_CODES.l = '4';
for (const c of 'mn') SOUNDEX_CODES[c] = '5';
SOUNDEX_CODES.r = '6';

/** American Soundex: first letter kept; H and W transparent; vowels reset; 4 characters. "" for no letters. */
export function soundex(s: string): string {
  const t = fold(s).replace(/[^a-z]/g, '');
  if (!t) return '';
  let out = t[0]!.toUpperCase();
  let last = SOUNDEX_CODES[t[0]!] ?? '';
  for (const ch of t.slice(1)) {
    const c = SOUNDEX_CODES[ch] ?? '';
    if (c && c !== last) out += c;
    if (ch !== 'h' && ch !== 'w') last = c;
  }
  return (out + '000').slice(0, 4);
}
