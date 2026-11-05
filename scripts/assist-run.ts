// `npm run assist:run -- --model <id> [--limit n] [--date YYYY-MM-DD]` (task 4.5): calls the model once per review
// item not yet in eval/assist/runs/<model>-<date>.jsonl and appends one line each. Paid calls; caps in spend.ts.
//   --model <id>   a model id priced in config/prices.json (required)
//   --limit <n>    at most n new calls this invocation
//   --date <d>     resume an earlier day's run file (default: today, UTC)
import { reviewItems } from '../experiments/assist/items';
import { runAssist, runFileFor } from '../experiments/assist/run';

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const model = opt('--model');
const limit = opt('--limit');
if (!model || (limit !== undefined && !/^\d+$/.test(limit))) {
  console.error('usage: npm run assist:run -- --model <id> [--limit n] [--date YYYY-MM-DD]');
  process.exit(2);
}
const runFile = runFileFor(model, opt('--date') ?? new Date().toISOString().slice(0, 10));

runAssist({ model, items: reviewItems(), limit: limit === undefined ? undefined : Number(limit), runFile })
  .then(({ called, skipped }) => console.log(`${runFile}: ${called} called, ${skipped} already cached`))
  .catch((e: Error) => {
    console.error(`assist:run stopped (${runFile} keeps every line written): ${e.message}`);
    process.exit(1);
  });
