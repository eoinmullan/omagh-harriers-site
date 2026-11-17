// Azure caps an OAuth client secret's lifetime at 24 months. Once it lapses,
// Microsoft sign-in fails for every member with an error neither they nor we
// can act on, so the button retires itself instead of rotting in place.
// Renewing the secret in Azure means moving this date to match.
export const MICROSOFT_CLIENT_SECRET_EXPIRES_ON = new Date('2028-11-17T00:00:00Z');

export function microsoftSignInIsAvailable(now: Date): boolean {
  return now < MICROSOFT_CLIENT_SECRET_EXPIRES_ON;
}
