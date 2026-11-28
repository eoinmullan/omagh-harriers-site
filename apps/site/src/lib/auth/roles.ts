import type { PrincipalRole } from '../supabase/types';

// Who may be given which role, decided here rather than in the page. The
// screen renders whatever `assignableRoles` offers and writes whatever
// `planRoleChange` returns.

export const ROLES: readonly PrincipalRole[] = ['member', 'registrar', 'admin', 'superuser'];

// Said in terms of what the person can do, because that is the question being
// answered when somebody is looking at this dropdown.
export const ROLE_DESCRIPTIONS: Record<PrincipalRole, string> = {
  member: 'Sees their own household and nothing else.',
  registrar:
    'Signs runners in at training and takes cash on the night. Reads the whole club, changes nothing else.',
  admin: "Runs the club's records — households, members, credit, sessions and groups.",
  superuser: 'Everything an admin can do, and hands out these roles.',
};

export type RoleChange = { role: PrincipalRole } | { problem: string };

/** Handing out roles is a superuser's job and nobody else's. */
export function assignableRoles(actingRole: PrincipalRole): readonly PrincipalRole[] {
  return actingRole === 'superuser' ? ROLES : [];
}

export function planRoleChange(request: {
  actingRole: PrincipalRole;
  actingPrincipalId: string;
  targetPrincipalId: string;
  currentRole: PrincipalRole;
  requestedRole: string;
}): RoleChange {
  const assignable = assignableRoles(request.actingRole);
  if (assignable.length === 0) return { problem: 'Only a superuser can change roles.' };

  const role = assignable.find((candidate) => candidate === request.requestedRole);
  if (!role) return { problem: 'Choose one of the four roles.' };

  if (role === request.currentRole) return { problem: `They are already ${role}.` };

  // A superuser demoting themselves would be locked out of the screen that
  // could put it back, and possibly leave the club with no superuser at all.
  if (request.targetPrincipalId === request.actingPrincipalId) {
    return {
      problem: 'Giving away your own superuser role would lock you out of this screen. Ask another superuser to do it.',
    };
  }

  return { role };
}

/**
 * A role as the person looking at it should see it. Superuser is a developer's
 * convenience, not a committee role: to anybody but another superuser it is
 * shown as admin, which is everything a committee member needs. Otherwise the
 * committee sees it and wonders whether the chair should have it too.
 */
export function shownRole(role: PrincipalRole, viewerRole: PrincipalRole): PrincipalRole {
  return role === 'superuser' && viewerRole !== 'superuser' ? 'admin' : role;
}

/** What a login can do beyond seeing their own household, as shown beside their name. */
export type Access = Exclude<PrincipalRole, 'member'> | 'emergency';

// Only the volunteers have anything to show, so they stand out rather than
// every household saying "member". A role is one rung of a ladder, so a login
// has at most one of those; Emergency contacts is a flag held beside it
// (migration 0026), the first privilege that isn't a rung.
export function accessOf(role: PrincipalRole, opensEmergencyContacts = false): Access[] {
  return [...(role === 'member' ? [] : [role]), ...(opensEmergencyContacts ? (['emergency'] as const) : [])];
}

export const EMERGENCY_ACCESS_DESCRIPTION =
  "Can open Emergency contacts: every member's emergency contact, kept on their phone for up to a year, with every opening recorded.";

export const EMERGENCY_REASON_MAX = 60;

export type EmergencyAccessChange =
  | { update: { opens_emergency_contacts: boolean; emergency_contacts_reason: string | null } }
  | { problem: string };

// Any admin, as with the ledger forms: who may see these details is a
// committee decision an admin carries out, not an identity edit. Giving it
// needs a short reason, so the list of who holds it explains itself (0027);
// taking it away clears the reason, which the database also insists on.
export function planEmergencyAccess(request: { choice: string; reason: string }): EmergencyAccessChange {
  if (request.choice === 'no') return { update: { opens_emergency_contacts: false, emergency_contacts_reason: null } };
  if (request.choice !== 'yes') return { problem: 'Choose whether they can open Emergency contacts.' };

  const reason = request.reason.trim().replace(/\s+/g, ' ');
  if (!reason) return { problem: 'Say why they can open Emergency contacts, such as Coach, Juniors or Welfare officer.' };
  if (reason.length > EMERGENCY_REASON_MAX) {
    return { problem: `Keep the reason to ${EMERGENCY_REASON_MAX} characters. It's a label, not a note.` };
  }
  return { update: { opens_emergency_contacts: true, emergency_contacts_reason: reason } };
}
