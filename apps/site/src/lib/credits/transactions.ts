import type { CreditTransactionType } from '../supabase/types';
import { formatPounds } from './money';
import { formatClubNight } from '../training/club-time';

// Names arrive here from the rows a statement joins, never from the ledger's
// own notes: the ledger is append-only, so it holds ids and this is where they
// become people. `counterpartyName` is left out on a member's own statement,
// which says "another account" rather than naming somebody else's household.
export interface LedgerEntry {
  type: CreditTransactionType;
  amountPence: number;
  memberName?: string | null;
  counterpartyName?: string | null;
  recordedBy?: string | null;
  notes?: string | null;
  /**
   * When the session this entry belongs to started. A night can be put right
   * days later from the registrar's Past sessions, and the line is dated when
   * it was entered, so the session's own date has to be said as well.
   */
  sessionStartsAt?: string | null;
  /** The squad of the session this entry belongs to, so a line says which. */
  sessionSquad?: string | null;
}

export function isCredit(entry: LedgerEntry): boolean {
  return entry.amountPence > 0;
}

export function describeEntry(entry: LedgerEntry): string {
  const movement = isCredit(entry) ? 'added' : 'deducted';
  return `${formatPounds(entry.amountPence)} ${movement} — ${reasonFor(entry)}`;
}

function reasonFor(entry: LedgerEntry): string {
  switch (entry.type) {
    case 'top_up_stripe':
      return 'paid by card via Stripe';
    case 'top_up_cash':
      return attributed(onTheNight('paid by cash at training', entry), entry.recordedBy);
    case 'session':
      return onTheNight(forMember(sessionName(entry.sessionSquad), entry.memberName), entry);
    case 'refund':
      // A refund carries its reason the way an adjustment does. "£10.00
      // deducted — refunded" does not say why, and a keying slip corrected in
      // front of the member deserves a sentence they can check against the
      // evening they remember.
      return attributed(onTheNight(noteOr(entry.notes, 'refunded'), entry), entry.recordedBy);
    case 'manual_adjustment':
      // Only the untick sets a member on an adjustment, and its note names the
      // squad, not the runner. The runner comes from the member row.
      return attributed(
        onTheNight(forMember(noteOr(entry.notes, 'adjusted by the club'), entry.memberName), entry),
        entry.recordedBy,
      );
    case 'transfer_in':
      return attributed(
        `transferred in from ${entry.counterpartyName ?? 'another account'}`,
        entry.recordedBy,
      );
    case 'transfer_out':
      return attributed(
        `transferred out to ${entry.counterpartyName ?? 'another account'}`,
        entry.recordedBy,
      );
  }
}

/**
 * A session that cost nothing, which leaves no row in the ledger. A
 * household's history lists it anyway, so that every session a member was
 * signed in at is there, whatever it cost.
 */
export function describeFreeSession(session: { squad: string | null; memberName: string; startsAt: string }): string {
  return `No charge — ${forMember(sessionName(session.squad), session.memberName)} on ${formatClubNight(session.startsAt)}`;
}

function sessionName(squad?: string | null): string {
  return squad ? `${squad} session` : 'training session';
}

function forMember(reason: string, memberName?: string | null): string {
  return memberName ? `${reason} for ${memberName}` : reason;
}

function onTheNight(reason: string, entry: LedgerEntry): string {
  return entry.sessionStartsAt ? `${reason} on ${formatClubNight(entry.sessionStartsAt)}` : reason;
}

function noteOr(notes: string | null | undefined, fallback: string): string {
  return notes?.trim() || fallback;
}

function attributed(reason: string, recordedBy?: string | null): string {
  return recordedBy ? `${reason}, recorded by ${recordedBy}` : reason;
}


/**
 * A line of a statement as a phone shows it, like a bank's: what it was in a
 * few words, who and who recorded it under that, and the amount on its own
 * on the right where it can be scanned. The night a session or cash belongs
 * to is the line's date, so it isn't repeated here. describeEntry is the same
 * line as one sentence, for screen readers and the admin's export.
 */
export interface EntrySummary {
  title: string;
  detail: string;
}

export function summariseEntry(entry: LedgerEntry): EntrySummary {
  const by = entry.recordedBy ? `recorded by ${entry.recordedBy}` : null;

  switch (entry.type) {
    case 'top_up_stripe':
      return summary('Card payment', []);
    case 'top_up_cash':
      return summary('Cash paid at training', [by]);
    case 'session':
      return summary(capitalised(sessionName(entry.sessionSquad)), [entry.memberName]);
    case 'refund':
      return summary(noteOr(entry.notes, 'Refund'), [by]);
    case 'manual_adjustment':
      return summary(noteOr(entry.notes, 'Adjusted by the club'), [entry.memberName, by]);
    case 'transfer_in':
      return summary(`Transferred in from ${entry.counterpartyName ?? 'another account'}`, [by]);
    case 'transfer_out':
      return summary(`Transferred out to ${entry.counterpartyName ?? 'another account'}`, [by]);
  }
}

export function summariseFreeSession(session: { squad: string | null; memberName: string }): EntrySummary {
  return summary(capitalised(sessionName(session.squad)), [session.memberName, 'no charge']);
}

function summary(title: string, details: (string | null | undefined)[]): EntrySummary {
  return { title, detail: details.filter(Boolean).join(' · ') };
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
