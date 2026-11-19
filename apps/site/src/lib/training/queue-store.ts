import type { Queued } from './queue';

// Where the queue lives between taps, and between one opening of the app and
// the next.
//
// IndexedDB rather than localStorage, for durability rather than size: the
// queue is a few dozen small objects at most. A registrar who closes the app on
// the walk back to the car must not lose the last three sign-ins.
//
// Every call is wrapped. A private window, a browser with storage blocked, or a
// quota refusal must degrade to "this phone keeps the queue in memory for as
// long as the page is open" rather than to a screen that will not tick.

const DATABASE = 'omagh-registrar';
const STORE = 'queue';
const VERSION = 1;

function open(): Promise<IDBDatabase | undefined> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(undefined);

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DATABASE, VERSION);
    } catch {
      return resolve(undefined);
    }

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
    request.onblocked = () => resolve(undefined);
  });
}

/** The queue for one session, so two sessions on one phone cannot mix. */
export async function loadQueue(sessionId: string): Promise<Queued[]> {
  const database = await open();
  if (!database) return [];

  return new Promise((resolve) => {
    try {
      const request = database.transaction(STORE, 'readonly').objectStore(STORE).get(sessionId);
      request.onsuccess = () => resolve((request.result as Queued[] | undefined) ?? []);
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    } finally {
      database.close();
    }
  });
}

export async function saveQueue(sessionId: string, queue: Queued[]): Promise<void> {
  const database = await open();
  if (!database) return;

  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(queue, sessionId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    } catch {
      resolve();
    } finally {
      database.close();
    }
  });
}
