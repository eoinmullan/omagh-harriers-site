import { useEffect, useRef } from 'react';

// Cloudflare's security check, which `/signin/send-email` asks for exactly as
// `/signin` does. Each token is good once, so the parent remounts this (a new
// `key`) after every send. Development has no site key and no check.

interface TurnstileApi {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export const TURNSTILE_SITE_KEY: string | undefined = import.meta.env.DEV
  ? undefined
  : import.meta.env.PUBLIC_TURNSTILE_SITE_KEY || undefined;

let loading: Promise<TurnstileApi> | undefined;

function loadTurnstile(): Promise<TurnstileApi> {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile missing')));
    script.onerror = () => {
      loading = undefined;
      reject(new Error('Turnstile failed to load'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const latestOnToken = useRef(onToken);
  latestOnToken.current = onToken;

  useEffect(() => {
    let widgetId: string | undefined;
    let cancelled = false;

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container.current) return;
        widgetId = turnstile.render(container.current, {
          sitekey: siteKey,
          theme: 'dark',
          callback: (token: string) => latestOnToken.current(token),
          'expired-callback': () => latestOnToken.current(''),
          'error-callback': () => latestOnToken.current(''),
        });
      })
      .catch(() => latestOnToken.current(''));

    return () => {
      cancelled = true;
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [siteKey]);

  return <div ref={container} className="min-h-[65px]" />;
}
