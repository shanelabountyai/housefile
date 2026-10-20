// N2 email, N3 phone, N5 ZIP.
import type { Normalized } from './result';

export function normalizeEmail(raw: string): Normalized<string> {
  const s = (raw ?? '').replace(/\s+/g, '').toLowerCase();
  if (!s) return { value: null, codes: ['EMAIL_MISSING'] };
  const parts = s.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { value: null, codes: ['EMAIL_INVALID'] };
  let local = (parts[0] ?? '').split('+')[0] ?? '';
  let domain = parts[1] ?? '';
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.replace(/\./g, '');
    domain = 'gmail.com';
  }
  if (!local || !domain.includes('.')) return { value: null, codes: ['EMAIL_INVALID'] };
  return { value: `${local}@${domain}`, codes: [] };
}

export function normalizePhone(raw: string): Normalized<string> {
  let d = (raw ?? '').replace(/\D/g, '');
  if (!d) return { value: null, codes: ['PHONE_MISSING'] };
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  if (d.length !== 10) return { value: null, codes: ['PHONE_INVALID'] };
  return { value: d, codes: [] };
}

export function normalizeZip(raw: string): Normalized<string> {
  if (!(raw ?? '').trim()) return { value: null, codes: ['ZIP_MISSING'] };
  const head = ((raw ?? '').trim().split('-')[0] ?? '').replace(/\D/g, '');
  if (head.length === 5) return { value: head, codes: [] };
  if (head.length === 9) return { value: head.slice(0, 5), codes: [] };
  if (head.length === 3 || head.length === 4) return { value: head.padStart(5, '0'), codes: ['ZIP_PADDED'] };
  return { value: null, codes: ['ZIP_INVALID'] };
}
