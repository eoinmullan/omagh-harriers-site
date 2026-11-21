import { describe, expect, it } from 'vitest';
import type { SupabaseBrowserClient } from '../../lib/supabase/browser';
import { listenForNudges, sendNudges } from './nudges';

// A stand-in for the Realtime client, which hands back the channel it already
// has when asked for one by name, as supabase-js does.
function fakeClient() {
  const channels: { topic: string; sent: number }[] = [];
  const removed: string[] = [];

  const client = {
    channel(name: string) {
      const topic = `realtime:${name}`;
      let channel = channels.find((c) => c.topic === topic);
      if (!channel) {
        channel = { topic, sent: 0 };
        channels.push(channel);
      }
      const found = channel;
      return {
        topic,
        on() {
          return this;
        },
        subscribe() {
          return this;
        },
        async httpSend() {
          found.sent += 1;
          return { success: true };
        },
      };
    },
    getChannels() {
      return channels;
    },
    async removeChannel(channel: { topic: string }) {
      removed.push(channel.topic);
      channels.splice(channels.findIndex((c) => c.topic === channel.topic), 1);
      return 'ok';
    },
  };

  return { client: client as unknown as SupabaseBrowserClient, channels, removed };
}

describe('sendNudges', () => {
  it('keeps listening on a channel it also sends on', async () => {
    const { client, channels } = fakeClient();
    listenForNudges(client, 'session-s1', () => {});

    await sendNudges(client, ['session-s1']);

    expect(channels.map((c) => c.topic)).toContain('realtime:session-s1');
  });

  it('tidies up a channel it opened only to send', async () => {
    const { client, removed } = fakeClient();

    await sendNudges(client, ['sessions-2026-11-21']);

    expect(removed).toEqual(['realtime:sessions-2026-11-21']);
  });

  it('sends on both kinds of channel', async () => {
    const { client, channels } = fakeClient();
    listenForNudges(client, 'session-s1', () => {});

    await sendNudges(client, ['session-s1', 'sessions-2026-11-21']);

    expect(channels.find((c) => c.topic === 'realtime:session-s1')?.sent).toBe(1);
  });
});
