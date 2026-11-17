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
