import { useCallback, useEffect, useRef } from 'react';

// Something that sits over a screen — the cash sheet, the squad picker — and
// that the phone's back gesture should close, as it would in any app, rather
// than leave the screen underneath.
//
// Opening it adds a history entry carrying `key`. Back pops that entry, and
// the popstate closes the layer. Closing it any other way (Cancel, Save,
// Escape, a tap outside) steps back over its own entry, so it never leaves a
// dead entry that a later back press would spend doing nothing.

export function useHistoryLayer(key: string, open: boolean, onClosed: () => void) {
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  useEffect(() => {
    if (!open) return;
    if (!window.history.state?.[key]) {
      window.history.pushState({ ...(window.history.state ?? {}), [key]: true }, '');
    }

    function onPopState(event: PopStateEvent) {
      if (event.state?.[key]) return;
      onClosedRef.current();
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [key, open]);

  /** Close from inside: step back over the layer's entry if it's on top. */
  const close = useCallback(() => {
    if (window.history.state?.[key]) window.history.back();
    else onClosedRef.current();
  }, [key]);

  return close;
}

/** True when the entry on top belongs to a layer, which the next screen replaces. */
export function onALayer(...keys: string[]): boolean {
  const state = window.history.state;
  return Boolean(state && keys.some((key) => state[key]));
}
