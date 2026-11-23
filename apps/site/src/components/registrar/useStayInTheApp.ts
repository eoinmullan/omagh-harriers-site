import { useEffect } from 'react';

// Back never leaves the app for the website.
//
// Opened from its icon, the app is the first thing in its window's history,
// so back from today's list closes it, as an app's should. But it can also
// start with website pages behind it: tapped from the members' area in a
// browser, or inside the installed app after "Go to sign in" took a lapsed
// registrar through the sign-in pages and back. Back from today's list then
// walked out to the members' area, or to a sign-in page.
//
// The app can't see what's behind it, only that something is. So when it
// starts on today's list with history already behind it, it turns the entry
// it arrived on into a guard and puts today's list on top. Back from today
// lands on the guard, which is still this page, and steps forward again. With
// nothing behind, as on a launch from the icon, there's no guard, and back
// still closes the app.

const GUARD = 'registrarGuard';

export function useStayInTheApp() {
  useEffect(() => {
    // A fresh arrival carries no state of the app's own. A reload or a step
    // back into the app does, and its guard, if it had one, is still there.
    const arrivedFresh = window.history.state === null;
    if (arrivedFresh && window.history.length > 1) {
      window.history.replaceState({ [GUARD]: true }, '');
      window.history.pushState({}, '');
    }

    function onPopState(event: PopStateEvent) {
      if (event.state?.[GUARD]) window.history.forward();
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
}
