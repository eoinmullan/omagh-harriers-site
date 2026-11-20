import { describe, expect, it } from 'vitest';
import {
  daysUntilMicrosoftSecretExpires,
  MICROSOFT_CLIENT_SECRET_EXPIRES_ON,
  MICROSOFT_SECRET_WARNING_DAYS,
  microsoftSignInIsAvailable,
} from './microsoft-oauth';

function daysFromExpiry(days: number): Date {
  return new Date(MICROSOFT_CLIENT_SECRET_EXPIRES_ON.getTime() + days * 24 * 60 * 60 * 1000);
}

describe('microsoftSignInIsAvailable', () => {
  it('offers Microsoft sign-in while the client secret is still valid', () => {
    const wellBeforeExpiry = daysFromExpiry(-30);

    const available = microsoftSignInIsAvailable(wellBeforeExpiry);

    expect(available).toBe(true);
  });

  it('withdraws Microsoft sign-in once the client secret has expired', () => {
    const afterExpiry = daysFromExpiry(1);

    const available = microsoftSignInIsAvailable(afterExpiry);

    expect(available).toBe(false);
  });

  it('withdraws Microsoft sign-in on the expiry date itself', () => {
    const available = microsoftSignInIsAvailable(MICROSOFT_CLIENT_SECRET_EXPIRES_ON);

    expect(available).toBe(false);
  });
});

describe('daysUntilMicrosoftSecretExpires', () => {
  it('counts whole days left', () => {
    expect(daysUntilMicrosoftSecretExpires(daysFromExpiry(-61))).toBe(61);
  });

  it('goes negative once the secret has expired', () => {
    expect(daysUntilMicrosoftSecretExpires(daysFromExpiry(3))).toBe(-3);
  });
});

// A reminder, not a check on the code: it uses today's date, so it starts
// failing on its own once the secret is close to expiring, and CI runs it on
// every push.
describe('the Microsoft client secret', () => {
  it(`has more than ${MICROSOFT_SECRET_WARNING_DAYS} days left`, () => {
    const daysLeft = daysUntilMicrosoftSecretExpires(new Date());

    expect(
      daysLeft,
      `The Azure client secret for Microsoft sign-in expires in ${daysLeft} days. ` +
        'Azure portal -> App registrations -> the club app -> Certificates & secrets -> New client secret; ' +
        'paste it into Supabase -> Authentication -> Sign In / Providers -> Azure; ' +
        'then move MICROSOFT_CLIENT_SECRET_EXPIRES_ON in microsoft-oauth.ts to the new expiry date. See OPERATIONS.md.',
    ).toBeGreaterThan(MICROSOFT_SECRET_WARNING_DAYS);
  });
});
