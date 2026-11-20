import { allKeys, QUEUE, read, remove, write } from './idb';
import type { Queued } from './queue';

// Where the queue lives between taps, and between one opening of the app and
// the next. A registrar who closes the app on the walk back to the car must not
// lose the last three sign-ins.
//
// **One outbox for the phone**, not one per screen. It used to be keyed per
// session, which meant work pending for Monday's session sat untouched while
// the registrar was looking at the picker or at another session — nothing was
// lost, but "flushed when connectivity returns" was not true. Writes are owed
// by the phone, not by whatever happens to be on screen.

const OUTBOX = 'outbox';

/**
 * Everything this phone still owes the database.
 *
 * Anything left under the old per-session keys is swept in and the old key
 * dropped, so a queue stranded by the previous shape is sent rather than
 * forgotten. The sweep costs one read of a store that is almost always empty.
 */
export async function loadQueue(): Promise<Queued[]> {
  const mine = (await read<Queued[]>(QUEUE, OUTBOX)) ?? [];

  const stranded = (await allKeys(QUEUE)).filter((key) => key !== OUTBOX);
  if (stranded.length === 0) return mine;

  const recovered: Queued[] = [];
  for (const key of stranded) {
    recovered.push(...((await read<Queued[]>(QUEUE, key)) ?? []));
    await remove(QUEUE, key);
  }

  // Oldest first, so a tick still lands before the untick that reverses it.
  const all = [...recovered, ...mine].sort((a, b) => a.queuedAt - b.queuedAt);
  await write(QUEUE, OUTBOX, all);
  return all;
}

export async function saveQueue(queue: Queued[]): Promise<void> {
  await write(QUEUE, OUTBOX, queue);
}
