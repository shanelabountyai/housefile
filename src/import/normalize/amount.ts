// N7: amounts to integer cents through the one money module (src/lib/money.ts, LoanBook port).
import { parseCents, type AmountCode } from '../../lib/money';

export const RULE = 'N7';
export type NormalizedAmount = { value: number | null; code: AmountCode; rule: string };

export function normAmount(raw: string | null | undefined): NormalizedAmount {
  const { cents, code } = parseCents(raw);
  return { value: cents, code, rule: RULE };
}
