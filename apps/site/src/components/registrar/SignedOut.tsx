import { BigButton, Note, Screen } from './ui';
import { isStandalone, isApple } from './platform';

// The signed-out screen, and the one place the installed-app trap has to be
// explained rather than engineered away.
//
// On iOS a home screen web app gets its own cookie container. Cookies are copied
// across once, when the icon is created — so a registrar who signed in first and
// added the app afterwards is already signed in, which is the normal path. But a
// sign-in link tapped in Mail opens Safari, not this window, so if the session
// here ever lapses there is no way to sign back in from inside the app. The
// recovery is to remove the icon and add it again, which copies a fresh cookie.
//
// Nobody guesses that unaided at seven on a wet Monday, so it is written down
// here, and only on the platform where it is true.
export function SignedOut() {
  const trapped = isStandalone() && isApple();

  return (
    <Screen title="Sign in first">
      {trapped ? (
        <>
          <p className="text-lg text-neutral-300">
            This app has been signed out, and on an iPhone the sign-in link can't open in here
            — it opens in Safari instead.
          </p>
          <Note>
            <p className="font-semibold text-neutral-100">To get back in</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Delete this icon from your home screen.</li>
              <li>
                Open <strong className="text-neutral-100">omaghharriers.com</strong> in Safari and
                sign in to the members' area.
              </li>
              <li>Tap <strong className="text-neutral-100">Sign runners in</strong>, then add it to your home screen again.</li>
            </ol>
            <p className="mt-2 text-neutral-400">
              It only happens if the app has sat unused for a long time.
            </p>
          </Note>
        </>
      ) : (
        <>
          <p className="text-lg text-neutral-300">
            Sign in to the members' area and this will pick it up.
          </p>
          <BigButton href="/signin">Go to sign in</BigButton>
        </>
      )}
    </Screen>
  );
}
