import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types';
import { planGuestSignIn } from './guests';
import { failureFrom, type Failure, type Write } from './queue';

// Turning a queued write into the call that lands it.
//
// Everything here is idempotent by construction, because a retry may be the
// second, third or tenth attempt at the same tap. The keys are built from ids
// decided when the registrar's finger came off the screen, not from anything
// generated at send time.

export async function send(
  supabase: SupabaseClient<Database>,
  write: Write,
): Promise<Failure | undefined> {
  switch (write.kind) {
    case 'create_session': {
      // Keyed on the id the phone minted, so a retry presents the same session
      // rather than starting a second one.
      const response = await supabase
        .from('training_sessions')
        .upsert(write.row, { onConflict: 'id', ignoreDuplicates: true });
      return failureFrom(response);
    }

    case 'sign_in': {
      // The attendance id travels with the write, so a retry re-presents the
      // same row rather than minting a second one.
      const response = await supabase.rpc('sign_in_member', {
        p_member_id: write.memberId,
        p_session_id: write.sessionId,
        p_attendance_id: write.attendanceId,
      });
      return failureFrom(response);
    }

    case 'undo_sign_in': {
      const response = await supabase.rpc('undo_member_sign_in', {
        p_attendance_id: write.attendanceId,
      });
      return failureFrom(response);
    }

    case 'guest_sign_in': {
      const response = await supabase.from('attendance').upsert(
        planGuestSignIn({
          guestId: write.guestId,
          sessionId: write.sessionId,
          recordedBy: write.recordedBy,
          pricePence: write.pricePence,
        }),
        { onConflict: 'idempotency_key', ignoreDuplicates: true },
      );
      return failureFrom(response);
    }

    case 'guest_undo': {
      // By guest and session rather than by row id: the row may have been
      // written by the other phone at the gate, and this is the same fact
      // either way.
      const response = await supabase
        .from('attendance')
        .delete()
        .eq('session_id', write.sessionId)
        .eq('guest_id', write.guestId);
      return failureFrom(response);
    }

    case 'cash': {
      const response = await supabase.from('credit_transactions').insert(write.row);

      // The unique index refusing the key means this exact entry already
      // landed — an earlier attempt that we never heard the answer to. That is
      // success, not failure.
      if (response.error && isDuplicate(response.error)) return undefined;
      return failureFrom(response);
    }
  }
}

function isDuplicate(error: { code?: string }): boolean {
  return error.code === '23505';
}


