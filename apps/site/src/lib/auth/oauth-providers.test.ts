import { describe, expect, it } from 'vitest';
import { MICROSOFT_CLIENT_SECRET_EXPIRES_ON } from './microsoft-oauth';
import { providerForEmail } from './oauth-providers';

function daysFromMicrosoftExpiry(days: number): Date {
  return new Date(MICROSOFT_CLIENT_SECRET_EXPIRES_ON.getTime() + days * 24 * 60 * 60 * 1000);
}

const whileMicrosoftIsAvailable = daysFromMicrosoftExpiry(-30);
const afterMicrosoftHasRetired = daysFromMicrosoftExpiry(1);

describe('providerForEmail', () => {
  it('offers Google for a Gmail address', () => {
    const provider = providerForEmail('member@gmail.com', whileMicrosoftIsAvailable);

    expect(provider?.supabaseProvider).toBe('google');
  });

  it('offers Google for the googlemail alias domain', () => {
    const provider = providerForEmail('member@googlemail.com', whileMicrosoftIsAvailable);

    expect(provider?.supabaseProvider).toBe('google');
  });

  it('offers Microsoft for a Hotmail address', () => {
    const provider = providerForEmail('member@hotmail.co.uk', whileMicrosoftIsAvailable);

    expect(provider?.supabaseProvider).toBe('azure');
  });

  it('ignores the case the member typed', () => {
    const provider = providerForEmail('Member@GMail.Com', whileMicrosoftIsAvailable);

    expect(provider?.supabaseProvider).toBe('google');
  });

  it('offers nothing for a domain with no provider behind it', () => {
    const provider = providerForEmail('member@omaghharriers.com', whileMicrosoftIsAvailable);

    expect(provider).toBeUndefined();
  });

  it('offers nothing once the Microsoft client secret has expired', () => {
    const provider = providerForEmail('member@outlook.com', afterMicrosoftHasRetired);

    expect(provider).toBeUndefined();
  });

  it('offers nothing for a value that is not an email address', () => {
    const provider = providerForEmail('member', whileMicrosoftIsAvailable);

    expect(provider).toBeUndefined();
  });
});
