// The dry-run preview as text. Deterministic: no timestamps, stable ordering, so a byte-identical re-run
// gives a byte-identical report (task 1.10 acceptance).
import { formatCents } from '../lib/money';
import type { Preview } from './preview';

const pad = (s: string | number, w: number) => String(s).padEnd(w);

export function formatPreview(p: Preview): string {
  const L: string[] = [];
  const h = (t: string) => L.push('', `== ${t}`);
  L.push('HOUSEFILE IMPORT DRY-RUN PREVIEW (nothing is written)');
  L.push(`file: ${p.file.path} (${p.file.bytes} bytes, sha256 ${p.file.contentHash})`);
  L.push(`encoding: ${p.file.encoding}; rows: ${p.file.rows}; as-of date: ${p.file.asOf}`);
  L.push(`map: ${Object.entries(p.file.map).map(([f, hd]) => `${f}<-"${hd}"`).join(' ')}`);
  L.push(`extras (kept, unmapped): ${p.file.extras.map((e) => `"${e}"`).join(' ') || '(none)'}`);
  L.push(`crm: ${p.crm.constituents} constituents, ${p.crm.gifts} gifts; beforeHash ${p.crm.beforeHash}`);
  if (p.file.after) L.push(`prior batch ${p.file.after} resolved first: it enriches the matching state only (Phase 1 writes nothing, so beforeHash is the committed CRM)`);

  h('TOTALS');
  const t = p.totals;
  L.push(`rows ${t.rows} = merged ${t.merged} + reviewed ${t.reviewed} + new ${t.new} + rejected ${t.rejected}`);
  L.push(`gifts to add ${t.giftsToAdd}; pending review ${t.giftsPendingReview}; skipped DUP_GIFT ${t.dupGift}; skipped DUP_GIFT_IN_FILE ${t.dupGiftInFile}; held (zero or negative, never written) ${t.giftsHeld}`);
  L.push(`gifts that matched date+cents on the target but with a different reference (added, look): ${t.dateCentsMatchedRefDiffered}`);
  L.push(`gifts equal to an earlier planned gift of this batch on date, cents and reference (added per S4, look): ${t.inFileSameGiftNotSkipped}`);
  L.push(`field changes on existing constituents ${t.fieldChanges}; alternates kept ${t.alternates}; name aliases ${t.aliases}`);
  L.push(`rows whose target is an earlier row still in review (written when that row is decided, D-55): ${t.pendingTarget}`);
  L.push(`gifts whose fund text is not in import/fund-synonyms.json (default fund used, FUND_UNKNOWN): ${t.fundUnknown}`);
  L.push(`rows re-queued by pair memory (a KEEP_SEPARATE pair where a new identifier now agrees, D-59): ${t.memoryQueued}`);
  const cents = p.gifts.reduce((s, g) => s + g.cents, 0);
  L.push(`gift total to add: ${formatCents(cents)} (${cents} cents)`);

  h(`CONSTITUENTS TO CREATE (${p.create.length})`);
  for (const c of p.create) L.push(`${c.rowId} ${pad(c.name, 28)} ${pad(c.email, 36)} ${pad(c.phone, 11)} ${c.address}${c.bestScore === null ? '  (no candidate blocked)' : `  (best candidate ${c.bestScore}: ${c.bestReasons.join('+') || 'none'})`}`);

  h(`FIELD CHANGES ON EXISTING CONSTITUENTS (${p.changes.length})`);
  for (const c of p.changes) L.push(`${c.constituentId} ${pad(c.field, 7)} ${c.rule} by ${c.rowId}: "${c.old}" (as of ${c.asOfOld}) -> "${c.new}" (as of ${c.asOfNew})${c.loserKept ? '  [old value kept as alternate]' : ''}`);

  h(`ALTERNATES KEPT (${p.alternates.length})`);
  for (const a of p.alternates) L.push(`${a.constituentId} ${pad(a.field, 7)} "${a.value}" (as of ${a.asOf}) from ${a.rowId}: ${a.why}`);

  h(`NAME ALIASES (S3, ${p.aliases.length})`);
  for (const a of p.aliases) L.push(`${a.constituentId} alias "${a.alias}" from ${a.rowId}`);

  h(`GIFTS TO ADD (${p.gifts.length})`);
  for (const g of p.gifts) L.push(`${g.rowId} -> ${pad(g.constituentRef, 7)} ${g.giftDate} ${pad(formatCents(g.cents), 12)} fund "${g.fund}" -> ${g.fundCode}${g.fundKnown ? '' : ' FUND_UNKNOWN'}${g.externalRef ? ` ref ${g.externalRef}` : ''}`);

  h(`GIFTS SKIPPED (${p.skippedGifts.length})`);
  for (const s of p.skippedGifts) L.push(`${s.rowId} ${pad(s.reason, 17)} ${s.giftDate} ${formatCents(s.cents)} duplicate of ${s.of}`);

  h(`GIFTS HELD, NOT WRITTEN (zero or negative amount; a refund is a person's call, D-57; ${p.heldGifts.length})`);
  for (const g of p.heldGifts) L.push(`${g.rowId} -> ${pad(g.constituentRef, 7)} ${g.giftDate} ${pad(formatCents(g.cents), 12)} ${g.reason}`);

  h(`REJECTED ROWS (${p.rejected.length})`);
  for (const r of p.rejected) L.push(`${r.rowId} REJECT:${r.reason}`);

  h(`REVIEW PAIRS (${p.review.length})`);
  for (const r of p.review) L.push(`${r.rowId} vs ${pad(r.target, 7)} ${pad(r.score, 4)} ${r.reasons.join('+')}${r.flags.length ? ` [${r.flags.join(';')}]` : ''}${r.tieBreak ? `  (${r.tieBreak})` : ''}`);

  h(`ROWS WAITING ON A ROW IN REVIEW (D-55, ${p.pending.length})`);
  for (const r of p.pending) L.push(`${r.rowId} ${pad(r.decision, 6)} -> ${r.target} (${r.score}); written when ${r.target} is decided`);

  h(`RE-QUEUED BY PAIR MEMORY (D-59, ${p.memoryQueue.length})`);
  for (const m of p.memoryQueue) L.push(`${m.rowId} merges into ${m.mergedInto}; vs ${m.target} newly agrees ${m.newlyAgreed.join('+')} (remembered: ${m.agreedBefore.join('+') || 'none'}); queued for review`);

  h('NOT IMPLEMENTED IN PHASE 1');
  for (const n of p.notImplemented) L.push(n);
  L.push('');
  return L.join('\n');
}
