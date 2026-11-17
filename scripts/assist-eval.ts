// `npm run assist:eval` (task 4.6): scores every committed run in eval/assist/runs/ against eval/assist/truth.csv and
// prints the P4-4 verdict per run. Reads no key and calls nothing. A verdict is a finding, not a failure: exit 0;
// exit 1 only when a run file or the truth file is malformed.
import { scoreAll } from '../experiments/assist/score';

try {
  process.stdout.write(scoreAll());
} catch (e) {
  console.error(`assist:eval FAILED: ${(e as Error).message}`);
  process.exit(1);
}
