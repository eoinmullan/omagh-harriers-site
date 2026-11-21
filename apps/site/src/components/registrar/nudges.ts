import type { SupabaseBrowserClient } from '../../lib/supabase/browser';
import { NUDGE_EVENT } from '../../lib/training/nudge';

// Sending and hearing "something changed". The rules about which channels and
// why are in lib/training/nudge.ts.

/**
 * Tell whoever is listening on each channel. Over HTTP, so this phone needn't
 * be subscribed to send. A nudge that fails to go is not worth anybody's
 * attention: the other phone's poll will catch up anyway.
 */
export async function sendNudges(supabase: SupabaseBrowserClient, channels: string[]): Promise<void> {
  await Promise.all(
    channels.map(async (name) => {
      // supabase.channel() hands back the channel this phone is already
      // listening on when there is one by that name. Removing it after sending
      // used to unsubscribe the phone from its own session, so a phone stopped
      // hearing the other one the first time it sent a nudge itself. Only a
      // channel opened here just to send is tidied away.
      const alreadyListening = supabase.getChannels().some((open) => open.topic === `realtime:${name}`);
      const channel = supabase.channel(name);
      try {
        await channel.httpSend(NUDGE_EVENT, {});
      } catch {
        // Missed. The poll covers it.
      } finally {
        if (!alreadyListening) void supabase.removeChannel(channel);
      }
    }),
  );
}

/**
 * Listen on a channel and call `onNudge` whenever another phone says
 * something changed. Returns the unsubscribe. Messages this phone sends
 * itself aren't echoed back to it.
 */
export function listenForNudges(
  supabase: SupabaseBrowserClient,
  name: string,
  onNudge: () => void,
): () => void {
  const channel = supabase.channel(name).on('broadcast', { event: NUDGE_EVENT }, () => onNudge()).subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
