import type { PrincipalRole } from '../supabase/types';
import { mayRunASession } from '../training/registrar';

// The club app, "Harriers": one icon for everybody, with a section for each job
// a person holds. Home is everybody's. Registration and Admin follow the role;
// Emergency contacts follows a flag of its own (migration 0026).

export type SectionKey = 'home' | 'registration' | 'emergency' | 'admin';

export interface AppSection {
  key: SectionKey;
  label: string;
  /** For a header on a narrow phone; the switcher's sheet always says `label`. */
  shortLabel: string;
  href: string;
  /** Opens with no signal, from a worker of its own. */
  worksOffline: boolean;
}

const HOME: AppSection = { key: 'home', label: 'Home', shortLabel: 'Home', href: '/members', worksOffline: false };
const REGISTRATION: AppSection = {
  key: 'registration',
  label: 'Registration',
  shortLabel: 'Registration',
  href: '/registrar/',
  worksOffline: true,
};
const EMERGENCY: AppSection = {
  key: 'emergency',
  label: 'Emergency contacts',
  shortLabel: 'Emergency',
  href: '/emergency/',
  worksOffline: true,
};
const ADMIN: AppSection = { key: 'admin', label: 'Admin', shortLabel: 'Admin', href: '/admin/sessions', worksOffline: false };

export const SECTIONS: readonly AppSection[] = [HOME, REGISTRATION, EMERGENCY, ADMIN];

export function sectionsFor(role: PrincipalRole | undefined, opensEmergencyContacts = false): AppSection[] {
  const isAdmin = role === 'admin' || role === 'superuser';
  return [
    HOME,
    ...(mayRunASession(role) ? [REGISTRATION] : []),
    ...(opensEmergencyContacts ? [EMERGENCY] : []),
    ...(isAdmin ? [ADMIN] : []),
  ];
}

/** A switcher listing only Home has nothing to switch to. */
export function switcherIsWorthShowing(sections: readonly AppSection[]): boolean {
  return sections.length > 1;
}

export function sectionOfPath(pathname: string): SectionKey | undefined {
  if (pathname === '/members' || pathname.startsWith('/members/')) return 'home';
  if (pathname === '/registrar' || pathname.startsWith('/registrar/')) return 'registration';
  if (pathname === '/emergency' || pathname.startsWith('/emergency/')) return 'emergency';
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'admin';
  return undefined;
}

export function sectionByKey(key: string | null | undefined): AppSection | undefined {
  return SECTIONS.find((section) => section.key === key);
}
