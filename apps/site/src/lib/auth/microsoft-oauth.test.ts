import { describe, expect, it } from 'vitest';
import {
  MICROSOFT_CLIENT_SECRET_EXPIRES_ON,
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
