import { useEffect, useState } from 'react';
import { BigButton, Note } from './ui';
import { isApple, isStandalone } from './platform';

// Safari has no install prompt, so on an iPhone the only way in is Share → Add
// to Home Screen, and somebody has to say so. Chrome fires beforeinstallprompt
// and can be offered a button instead.
//
// Both disappear once the app is installed, and the iOS hint can be dismissed,
// because a permanent instruction on a screen you use weekly is clutter.

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
}

const DISMISSED = 'registrar:install-hint-dismissed';

export function InstallHint() {
  const [prompt, setPrompt] = useState<InstallPrompt | undefined>();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISSED) === 'true');
    } catch {
      setDismissed(false);
    }

    function remember(event: Event) {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    }

    window.addEventListener('beforeinstallprompt', remember);
    return () => window.removeEventListener('beforeinstallprompt', remember);
  }, []);

  function hide() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED, 'true');
    } catch {
      // A private window refusing storage is not worth a broken screen.
    }
  }

  if (isStandalone() || dismissed) return null;

  if (prompt) {
    return (
      <BigButton
        tone="quiet"
        onClick={() => {
          void prompt.prompt();
          hide();
        }}
      >
        Add to home screen
      </BigButton>
    );
  }

  if (!isApple()) return null;

  return (
    <Note>
      <p>
        <strong className="text-slate-100">Keep this on your home screen.</strong> Tap the Share
        button, then <strong className="text-slate-100">Add to Home Screen</strong>. It'll open
        straight here, already signed in.
      </p>
      <button
        type="button"
        onClick={hide}
        className="mt-2 min-h-11 text-base text-slate-400 underline"
      >
        Don't show this again
      </button>
    </Note>
  );
}
