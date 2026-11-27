import type { PrincipalRole } from '../supabase/types';
import { mayRunASession } from '../training/registrar';

// The club app, "Harriers": one icon for everybody, with a section for each job
// a person holds. Home is everybody's. The rest follow the role, as the cards
// in the members' area always have.

export type SectionKey = 'home' | 'registration' | 'admin';

export interface AppSection {
  key: SectionKey;
  label: string;
  href: string;
}

const HOME: AppSection = { key: 'home', label: 'Home', href: '/members' };
const REGISTRATION: AppSection = { key: 'registration', label: 'Registration', href: '/registrar/' };
const ADMIN: AppSection = { key: 'admin', label: 'Admin', href: '/admin/sessions' };

export const SECTIONS: readonly AppSection[] = [HOME, REGISTRATION, ADMIN];

export function sectionsFor(role: PrincipalRole | undefined): AppSection[] {
  const isAdmin = role === 'admin' || role === 'superuser';
  return [HOME, ...(mayRunASession(role) ? [REGISTRATION] : []), ...(isAdmin ? [ADMIN] : [])];
}

/** A switcher listing only Home has nothing to switch to. */
export function switcherIsWorthShowing(sections: readonly AppSection[]): boolean {
  return sections.length > 1;
}

export function sectionOfPath(pathname: string): SectionKey | undefined {
  if (pathname === '/members' || pathname.startsWith('/members/')) return 'home';
  if (pathname === '/registrar' || pathname.startsWith('/registrar/')) return 'registration';
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'admin';
  return undefined;
}

export function sectionByKey(key: string | null | undefined): AppSection | undefined {
  return SECTIONS.find((section) => section.key === key);
}
