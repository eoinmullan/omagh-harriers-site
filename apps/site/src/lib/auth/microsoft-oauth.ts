// Azure caps an OAuth client secret's lifetime at 24 months. Once it lapses,
// Microsoft sign-in fails for every member with an error neither they nor we
// can act on, so the button retires itself instead of rotting in place.
// Renewing the secret in Azure means moving this date to match.
export const MICROSOFT_CLIENT_SECRET_EXPIRES_ON = new Date('2028-11-16T00:00:00Z');

export function microsoftSignInIsAvailable(now: Date): boolean {
  return now < MICROSOFT_CLIENT_SECRET_EXPIRES_ON;
}

// How much warning to give. Renewing takes a few minutes in Azure, but only if
// somebody remembers. microsoft-oauth.test.ts fails once fewer days than this
// are left, and CI runs it on every push, so a reminder arrives without a
// calendar.
export const MICROSOFT_SECRET_WARNING_DAYS = 60;

export function daysUntilMicrosoftSecretExpires(now: Date): number {
  return Math.floor((MICROSOFT_CLIENT_SECRET_EXPIRES_ON.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}
