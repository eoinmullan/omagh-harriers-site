import { microsoftSignInIsAvailable } from './microsoft-oauth';

export type OAuthProvider = {
  name: string;
  supabaseProvider: 'google' | 'azure';
  emailDomains: string[];
};

const google: OAuthProvider = {
  name: 'Google',
  supabaseProvider: 'google',
  emailDomains: ['gmail.com', 'googlemail.com'],
};

const microsoft: OAuthProvider = {
  name: 'Microsoft',
  supabaseProvider: 'azure',
  emailDomains: [
    'outlook.com',
    'outlook.ie',
    'hotmail.com',
    'hotmail.co.uk',
    'live.com',
    'live.co.uk',
    'msn.com',
  ],
};

export function availableProviders(now: Date): OAuthProvider[] {
  return microsoftSignInIsAvailable(now) ? [google, microsoft] : [google];
}

export function providerForEmail(email: string, now: Date): OAuthProvider | undefined {
  const domain = email.split('@')[1]?.trim().toLowerCase();
  if (!domain) return undefined;
  return availableProviders(now).find((provider) => provider.emailDomains.includes(domain));
}
