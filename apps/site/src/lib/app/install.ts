// Whether Home offers to put Harriers on the home screen, and how. Safari has
// no install prompt, so an iPhone is told Share, then Add to Home Screen. A
// browser with its own prompt gets a button. A desktop isn't offered either:
// on a desktop the site is the site.

export type InstallGuide = 'share-sheet' | 'prompt' | 'none';

export interface InstallContext {
  inApp: boolean;
  dismissed: boolean;
  isApple: boolean;
  hasTouch: boolean;
  canPrompt: boolean;
}

export function installGuide(context: InstallContext): InstallGuide {
  if (context.inApp || context.dismissed || !context.hasTouch) return 'none';
  if (context.isApple) return 'share-sheet';
  return context.canPrompt ? 'prompt' : 'none';
}

export const INSTALL_GUIDE_DISMISSED_KEY = 'harriers:install-guide-dismissed';
