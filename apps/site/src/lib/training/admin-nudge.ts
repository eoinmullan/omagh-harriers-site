import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types';
import { clubDayKey } from './club-time';
import { channelsForAdminChange, NUDGE_EVENT } from './nudge';
import { clubDayWindow } from './tonight';

// The admin site's half of the nudge (nudge.ts): after an admin's change
// succeeds, tell the registrar app's phones to refresh.
//
// It waits for the sends, because a Cloudflare Worker stops work still in
// flight once the response has gone, but never for longer than SEND_TIMEOUT_MS,
// and a failure is ignored: the phones' once-a-minute poll catches up anyway,
// and an admin's form must never fail because a nudge did.

const SEND_TIMEOUT_MS = 2000;

export async function nudgeTheRegistrarApp(
  adminClient: SupabaseClient<Database>,
  session?: { id?: string; startsAt: string },
): Promise<void> {
  try {
    const now = new Date();
    const today = clubDayWindow(now);
    const { data } = await adminClient
      .from('training_sessions')
      .select('id')
      .gte('starts_at', today.from)
      .lt('starts_at', today.until);

    const channels = channelsForAdminChange({
      today: clubDayKey(now),
      todaysSessionIds: (data ?? []).map((row) => row.id),
      session,
    });

    await Promise.all(
      channels.map(async (name) => {
        const channel = adminClient.channel(name);
        try {
          await channel.httpSend(NUDGE_EVENT, {}, { timeout: SEND_TIMEOUT_MS });
        } catch {
          // Missed. The poll covers it.
        } finally {
          void adminClient.removeChannel(channel);
        }
      }),
    );
  } catch {
    // Not worth failing an admin's form over.
  }
}
