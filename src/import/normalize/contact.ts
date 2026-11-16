// N2 email, N3 phone, N5 ZIP, N8 state. Written from brief §5.
import { fold } from '../../lib/fold';

export type Normalized<C extends string> = { value: string; code: C | ''; rule: string };

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const GMAIL = new Set(['gmail.com', 'googlemail.com']);

/** N2: lowercase, strip spaces; exactly one `@`; `+tag` removed everywhere; Gmail dots folded (O-4, D-20). */
export function normEmail(raw: string | null | undefined): Normalized<'EMAIL_MISSING' | 'EMAIL_INVALID'> {
  const e = fold(raw).replaceAll(' ', '');
  if (!e) return { value: '', code: 'EMAIL_MISSING', rule: 'N2' };
  if ((e.match(/@/g) ?? []).length !== 1 || !EMAIL_RE.test(e)) return { value: '', code: 'EMAIL_INVALID', rule: 'N2' };
  const [localRaw, domainRaw] = e.split('@') as [string, string];
  let local = localRaw.split('+')[0]!;
  let domain = domainRaw;
  if (GMAIL.has(domain)) {
    local = local.replaceAll('.', '');
    domain = 'gmail.com';
  }
  return { value: `${local}@${domain}`, code: '', rule: 'N2' };
}

/** N3: digits only; 11 digits starting with 1 drop the 1; anything but 10 digits is PHONE_INVALID. */
export function normPhone(raw: string | null | undefined): Normalized<'PHONE_MISSING' | 'PHONE_INVALID'> {
  let d = (raw ?? '').replace(/\D/g, '');
  if (!d) return { value: '', code: 'PHONE_MISSING', rule: 'N3' };
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  if (d.length !== 10) return { value: '', code: 'PHONE_INVALID', rule: 'N3' };
  return { value: d, code: '', rule: 'N3' };
}

/** N5: digits of the part before any hyphen; 9 digits → first 5; 3–4 digits → left-pad (ZIP_PADDED); else ZIP_INVALID. */
export function normZip(raw: string | null | undefined): Normalized<'ZIP_MISSING' | 'ZIP_PADDED' | 'ZIP_INVALID'> {
  const s = (raw ?? '').trim();
  if (!s) return { value: '', code: 'ZIP_MISSING', rule: 'N5' };
  const first = s.split('-')[0]!.trim();
  let d = first.replace(/\D/g, '');
  if (d.length === 9) d = d.slice(0, 5);
  if (d.length === 3 || d.length === 4) return { value: d.padStart(5, '0'), code: 'ZIP_PADDED', rule: 'N5' };
  if (d.length !== 5) return { value: '', code: 'ZIP_INVALID', rule: 'N5' };
  return { value: d, code: '', rule: 'N5' };
}

const STATES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT',
  delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI',
  minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC',
  'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
};
const STATE_CODES = new Set(Object.values(STATES));

/** N8: two-letter code uppercased, or full name → code; else STATE_INVALID. */
export function normState(raw: string | null | undefined): Normalized<'STATE_MISSING' | 'STATE_INVALID'> {
  const s = fold(raw).replaceAll('.', '');
  if (!s) return { value: '', code: 'STATE_MISSING', rule: 'N8' };
  if (STATE_CODES.has(s.toUpperCase())) return { value: s.toUpperCase(), code: '', rule: 'N8' };
  if (Object.hasOwn(STATES, s)) return { value: STATES[s]!, code: '', rule: 'N8' };
  return { value: '', code: 'STATE_INVALID', rule: 'N8' };
}
