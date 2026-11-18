// Two questions the screens ask about where they are running. Both are
// unavoidably sniffy — there is no feature test for "iOS will not let a mail
// link open in this window" — so they are kept in one place and used only to
// change wording, never to decide what the app can do.

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS sets this instead of honouring the display-mode query.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isApple(): boolean {
  if (typeof navigator === 'undefined') return false;
  // iPadOS reports itself as a Mac, so the touch check is what separates a
  // tablet from a desktop.
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
