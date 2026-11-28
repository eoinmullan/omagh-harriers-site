import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { phoneStore, rememberSection } from '../../lib/app/launch';
import { sectionsFor } from '../../lib/app/sections';
import { forgetCopy } from '../../lib/emergency/copy-store';
import { createSupabaseBrowserClient } from '../../lib/supabase/browser';
import { opensEmergencyContacts, roleClaimIsMissing, roleFromAccessToken } from '../../lib/training/registrar';
import { HeldSections } from '../app/SectionSwitcher';
import { SignedOut } from '../registrar/SignedOut';
import { BigButton, Screen } from '../registrar/ui';
import { useServiceWorker } from '../registrar/useServiceWorker';
import { useWriteQueue } from '../registrar/useWriteQueue';
import { ContactsView } from './ContactsView';

// The Emergency contacts section, as one island, built as the registrar app
// is: the site's own session, its own worker, and the phone's one outbox,
// which here carries the record of every opening.

type AuthState = Session | null | undefined;

const LOGO = '/emergency/logo.jpg';

export function EmergencyApp() {
  const [session, setSession] = useState<AuthState>(undefined);

  useServiceWorker('/emergency/sw.js', '/emergency/');
  const outbox = useWriteQueue();

  useEffect(() => {
    const {
      data: { subscription },
    } = createSupabaseBrowserClient().auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.unsubscribe();
  }, []);

  const token = session?.access_token;
  const holdsFlag = opensEmergencyContacts(token);
  const role = roleFromAccessToken(token);
  const held = useMemo(() => sectionsFor(role, holdsFlag), [role, holdsFlag]);

  useEffect(() => {
    if (holdsFlag) rememberSection(phoneStore, 'emergency', held.map((section) => section.key));
  }, [holdsFlag, held]);

  // A token that says this login doesn't hold the flag means the copy on the
  // phone is no longer theirs to keep. A token with no club claims at all is a
  // broken access-token hook, not a decision, so the copy stays for that.
  // Signing out leaves it.
  const lostTheFlag = Boolean(token) && !holdsFlag && !roleClaimIsMissing(token);
  useEffect(() => {
    if (lostTheFlag) void forgetCopy();
  }, [lostTheFlag]);

  if (session === undefined) {
    return (
      <Screen logo={LOGO}>
        <p className="text-lg text-neutral-400">Opening…</p>
      </Screen>
    );
  }

  if (session === null) return <SignedOut />;

  if (!holdsFlag) {
    return (
      <Screen title="Not set up for Emergency contacts" logo={LOGO}>
        <p className="text-lg text-neutral-300">
          {session.user.email ? <strong className="text-neutral-100">{session.user.email}</strong> : 'This account'}{' '}
          can't open Emergency contacts. Only people the committee has chosen can. If that should be you, ask a club admin.
        </p>
        <BigButton href="/members">Back to the members' area</BigButton>
      </Screen>
    );
  }

  return (
    <HeldSections.Provider value={held}>
      <ContactsView authUserId={session.user.id} outbox={outbox} logo={LOGO} />
    </HeldSections.Provider>
  );
}
