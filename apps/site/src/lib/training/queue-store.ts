import { QUEUE, read, write } from './idb';
import type { Queued } from './queue';

// Where the queue lives between taps, and between one opening of the app and
// the next. A registrar who closes the app on the walk back to the car must not
// lose the last three sign-ins.

/** Keyed per session, so two sessions on one phone cannot mix. */
export async function loadQueue(sessionId: string): Promise<Queued[]> {
  return (await read<Queued[]>(QUEUE, sessionId)) ?? [];
}

export async function saveQueue(sessionId: string, queue: Queued[]): Promise<void> {
  await write(QUEUE, sessionId, queue);
}
