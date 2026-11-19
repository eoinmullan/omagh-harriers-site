import { formatClubTime } from './club-time';
import { read, SNAPSHOTS, write } from './idb';

// What the phone last believed about a session, so it can be opened at a track
// with no signal and still be useful.
//
// The important choice here is *when* a snapshot is taken. Not on a successful
// load — on every change the registrar sees. A tick made offline is part of what
// this phone believes, even though the write is still sitting in the queue, and
// a registrar who closes the app and opens it again two minutes later must see
// the same screen they left. The queue replays the writes separately; every one
// of them is idempotent, so a write already reflected here lands harmlessly.

export interface Snapshot<T> {
  data: T;
  savedAt: number;
}

export async function saveSnapshot<T>(key: string, data: T): Promise<void> {
  await write(SNAPSHOTS, key, { data, savedAt: Date.now() } satisfies Snapshot<T>);
}

export async function loadSnapshot<T>(key: string): Promise<Snapshot<T> | undefined> {
  const stored = await read<Snapshot<T>>(SNAPSHOTS, key);
  if (!stored || typeof stored.savedAt !== 'number') return undefined;
  return stored;
}

/**
 * What to say above a screen that is not live.
 *
 * It names a time rather than an age, because "4 minutes ago" is a number that
 * goes stale while being read, and a registrar glancing at a phone wants to
 * know whether this is from before or after the last group arrived.
 *
 * Minutes old is still described as minutes, because within the first minute
 * the screen is to all intents current and saying so is reassuring rather than
 * alarming.
 */
export function describeSnapshotAge(savedAt: number, now: Date = new Date()): string {
  const secondsOld = Math.max(0, Math.round((now.getTime() - savedAt) / 1000));

  if (secondsOld < 60) return 'Showing what this phone last saw, a moment ago.';

  return `Showing what this phone last saw at ${formatClubTime(new Date(savedAt).toISOString())}.`;
}
