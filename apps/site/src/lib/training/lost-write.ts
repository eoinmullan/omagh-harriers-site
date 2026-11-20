import { cashLabel } from '../credits/cash-label';
import type { Write } from './queue';

// What a registrar is told when Postgres refuses a queued write.
//
// The refusal used to be shown in Postgres's own words: fine for "That
// session was cancelled.", meaningless for "new row violates row-level
// security policy". Either way it never said what had been lost. The write
// itself knows: whose tick, how much cash, from which household. That's the
// fact the registrar can act on, and for money it decides whether anything
// gets recorded at all, because cash handed over and then lost is only
// recovered if somebody writes it down now.
//
// Postgres's text is kept beside this sentence for whoever investigates
// later. It isn't what the registrar reads first.

export interface Names {
  member(id: string): string | undefined;
  household(id: string): string | undefined;
  guest(id: string): string | undefined;
}

const NOTE_IT = 'Note it on paper.';

export function describeLostWrite(write: Write, names: Names): string {
  switch (write.kind) {
    case 'create_session':
      return "Tonight's session couldn't be started, so nothing on it was saved. Note the night on paper.";

    case 'sign_in': {
      const who = names.member(write.memberId);
      return who ? `${who}'s sign-in wasn't saved.` : "A runner's sign-in wasn't saved.";
    }

    case 'undo_sign_in': {
      const who = write.memberId ? names.member(write.memberId) : undefined;
      return who
        ? `${who}'s untick wasn't saved, so they're still signed in.`
        : "An untick wasn't saved, so that runner is still signed in.";
    }

    case 'guest_sign_in': {
      const who = names.guest(write.guestId);
      return `${who ? `${who}'s` : "A guest's"} sign-in wasn't saved. If they paid, ${NOTE_IT.toLowerCase()}`;
    }

    case 'guest_undo': {
      const who = names.guest(write.guestId);
      return who
        ? `${who}'s untick wasn't saved, so they're still signed in.`
        : "A guest's untick wasn't saved, so they're still signed in.";
    }

    case 'cash': {
      const amount = cashLabel(Math.abs(write.row.amount_pence));
      const household = names.household(write.row.principal_id) ?? 'a household';
      return write.row.type === 'refund'
        ? `${amount} handed back to ${household} wasn't recorded. ${NOTE_IT}`
        : `${amount} from ${household} wasn't recorded. ${NOTE_IT}`;
    }
  }
}
