// The phone's own storage, wrapped so nothing above has to care about it.
//
// Every call is guarded. A private window, a browser with storage blocked, a
// quota refusal, a database that will not open — all of them have to degrade to
// "this phone remembers nothing between openings" rather than to a screen that
// will not tick. Losing the cache is an inconvenience; a registrar who cannot
// sign anyone in is the failure this whole phase exists to avoid.

const DATABASE = 'omagh-registrar';
const VERSION = 2;

/** Writes waiting to be sent. */
export const QUEUE = 'queue';
/** What the phone last believed about a session, for opening with no signal. */
export const SNAPSHOTS = 'snapshots';

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
      for (const store of [QUEUE, SNAPSHOTS]) {
        if (!request.result.objectStoreNames.contains(store)) {
          request.result.createObjectStore(store);
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
    request.onblocked = () => resolve(undefined);
  });
}

export async function read<T>(store: string, key: string): Promise<T | undefined> {
  const database = await open();
  if (!database) return undefined;

  return new Promise((resolve) => {
    try {
      const request = database.transaction(store, 'readonly').objectStore(store).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    } finally {
      database.close();
    }
  });
}

export async function allKeys(store: string): Promise<string[]> {
  const database = await open();
  if (!database) return [];

  return new Promise((resolve) => {
    try {
      const request = database.transaction(store, 'readonly').objectStore(store).getAllKeys();
      request.onsuccess = () => resolve(request.result.map(String));
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    } finally {
      database.close();
    }
  });
}

export async function remove(store: string, key: string): Promise<void> {
  const database = await open();
  if (!database) return;

  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(store, 'readwrite');
      transaction.objectStore(store).delete(key);
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

export async function write(store: string, key: string, value: unknown): Promise<void> {
  const database = await open();
  if (!database) return;

  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(store, 'readwrite');
      transaction.objectStore(store).put(value, key);
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
