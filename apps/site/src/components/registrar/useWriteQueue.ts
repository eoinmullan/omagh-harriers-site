import { useCallback, useEffect, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '../../lib/supabase/browser';
import {
  enqueue,
  isWorthRetrying,
  nextToSend,
  settle,
  type Queued,
  type Write,
} from '../../lib/training/queue';
import { loadQueue, saveQueue } from '../../lib/training/queue-store';
import { send } from '../../lib/training/queue-sender';

// The queue, driven.
//
// Nothing here decides anything: `queue.ts` says what cancels what and what is
// worth retrying, `queue-sender.ts` says how a write is made, and this keeps
// the wheel turning and the screen honest about how much is still in flight.

/**
 * How long a tap is held before it is sent.
 *
 * Long enough that a mis-tap and its correction cancel each other without the
 * database ever hearing about it; short enough that a registrar who puts the
 * phone down has their work on its way. A tick is already on screen, so this
 * costs the registrar nothing.
 */
const COALESCING_WINDOW_MS = 2_000;

/** How long to wait after a failure that is worth retrying. */
const RETRY_AFTER_MS = 5_000;

export function useWriteQueue(sessionId: string, recordedBy: string) {
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [refused, setRefused] = useState<string | null>(null);

  const queue = useRef<Queued[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sending = useRef(false);

  const persist = useCallback(() => {
    setPending(queue.current.length);
    void saveQueue(sessionId, queue.current);
  }, [sessionId]);

  const flush = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;

    try {
      const supabase = createSupabaseBrowserClient();

      // One at a time, oldest first, so a tick never lands after its own
      // untick. A failure stops the run rather than skipping ahead.
      while (queue.current.length > 0) {
        const item = nextToSend(queue.current)!;
        const failure = await send(supabase, item.write, recordedBy);

        if (!failure) {
          queue.current = settle(queue.current, item.id);
          persist();
          continue;
        }

        if (isWorthRetrying(failure)) {
          timer.current = setTimeout(() => void flush(), RETRY_AFTER_MS);
          return;
        }

        // Postgres refused it. Retrying would only hide the problem until the
        // end of the night, so drop it and say so.
        queue.current = settle(queue.current, item.id);
        persist();
        setRefused(failure.message);
      }
    } finally {
      sending.current = false;
    }
  }, [persist, recordedBy]);

  const add = useCallback(
    (write: Write) => {
      setRefused(null);
      queue.current = enqueue(queue.current, {
        id: crypto.randomUUID(),
        write,
        queuedAt: Date.now(),
      });
      persist();

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), COALESCING_WINDOW_MS);
    },
    [flush, persist],
  );

  // Pick up whatever the last opening of the app left behind.
  useEffect(() => {
    let live = true;
    void loadQueue(sessionId).then((stored) => {
      if (!live || stored.length === 0) return;
      queue.current = [...stored, ...queue.current];
      setPending(queue.current.length);
      void flush();
    });
    return () => {
      live = false;
    };
  }, [sessionId, flush]);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void flush();
    };
    const goOffline = () => setOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [flush]);

  return { add, pending, online, refused };
}
