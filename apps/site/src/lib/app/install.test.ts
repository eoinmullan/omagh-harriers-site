import { describe, expect, it } from 'vitest';
import { installGuide, type InstallContext } from './install';

const phone: InstallContext = { inApp: false, dismissed: false, isApple: false, hasTouch: true, canPrompt: false };

describe('installGuide', () => {
  it('tells an iPhone to use the Share sheet', () => {
    const guide = installGuide({ ...phone, isApple: true });

    expect(guide).toBe('share-sheet');
  });

  it("offers a button on a phone whose browser has an install prompt", () => {
    const guide = installGuide({ ...phone, canPrompt: true });

    expect(guide).toBe('prompt');
  });

  it('says nothing on a phone with neither', () => {
    const guide = installGuide(phone);

    expect(guide).toBe('none');
  });

  it('says nothing once the app is installed and opened', () => {
    const guide = installGuide({ ...phone, isApple: true, inApp: true });

    expect(guide).toBe('none');
  });

  it('says nothing once dismissed', () => {
    const guide = installGuide({ ...phone, canPrompt: true, dismissed: true });

    expect(guide).toBe('none');
  });

  it('says nothing on a desktop, even one with an install prompt', () => {
    const guide = installGuide({ ...phone, hasTouch: false, canPrompt: true });

    expect(guide).toBe('none');
  });
});
