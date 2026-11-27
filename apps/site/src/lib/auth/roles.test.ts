import { describe, expect, it } from 'vitest';
import { accessOf, assignableRoles, planRoleChange, shownRole, type RoleChange } from './roles';

const SUPERUSER = 'superuser-principal-id';
const TARGET = 'target-principal-id';

function request(overrides: Partial<Parameters<typeof planRoleChange>[0]> = {}) {
  return {
    actingRole: 'superuser' as const,
    actingPrincipalId: SUPERUSER,
    targetPrincipalId: TARGET,
    currentRole: 'member' as const,
    requestedRole: 'registrar',
    ...overrides,
  };
}

function roleOf(change: RoleChange) {
  if ('problem' in change) throw new Error(`expected a role, got: ${change.problem}`);
  return change.role;
}

function problemOf(change: RoleChange): string {
  if (!('problem' in change)) throw new Error('expected a problem');
  return change.problem;
}

describe('assignableRoles', () => {
  it('offers a superuser all four roles, registrar among them', () => {
    expect(assignableRoles('superuser')).toEqual(['member', 'registrar', 'admin', 'superuser']);
  });

  it('offers an admin nothing — roles are not theirs to hand out', () => {
    expect(assignableRoles('admin')).toEqual([]);
    expect(assignableRoles('registrar')).toEqual([]);
    expect(assignableRoles('member')).toEqual([]);
  });
});

describe('planRoleChange', () => {
  it('makes a volunteer a registrar', () => {
    expect(roleOf(planRoleChange(request()))).toBe('registrar');
  });

  it('refuses anybody who is not a superuser', () => {
    expect(problemOf(planRoleChange(request({ actingRole: 'admin' })))).toBe(
      'Only a superuser can change roles.',
    );
  });

  it('refuses a role that does not exist', () => {
    expect(problemOf(planRoleChange(request({ requestedRole: 'treasurer' })))).toBe(
      'Choose one of the four roles.',
    );
  });

  it('says so when the role is already theirs', () => {
    expect(
      problemOf(planRoleChange(request({ currentRole: 'registrar', requestedRole: 'registrar' }))),
    ).toBe('They are already registrar.');
  });

  it('refuses to let a superuser change their own role', () => {
    const change = planRoleChange(
      request({ targetPrincipalId: SUPERUSER, currentRole: 'superuser', requestedRole: 'admin' }),
    );
    expect(problemOf(change)).toContain('lock you out of this screen');
  });
});

describe('accessOf', () => {
  it('shows nothing for a member, who can only see their own household', () => {
    expect(accessOf('member')).toEqual([]);
  });

  it('shows what a volunteer can do', () => {
    expect(accessOf('registrar')).toEqual(['registrar']);
    expect(accessOf('admin')).toEqual(['admin']);
    expect(accessOf('superuser')).toEqual(['superuser']);
  });
});

describe('shownRole', () => {
  it('shows a superuser as an admin to anybody who is not one', () => {
    expect(shownRole('superuser', 'admin')).toBe('admin');
    expect(shownRole('superuser', 'registrar')).toBe('admin');
    expect(shownRole('superuser', 'member')).toBe('admin');
  });

  it('shows a superuser as one to another superuser', () => {
    expect(shownRole('superuser', 'superuser')).toBe('superuser');
  });

  it('shows every other role as it is', () => {
    expect(shownRole('admin', 'admin')).toBe('admin');
    expect(shownRole('registrar', 'admin')).toBe('registrar');
    expect(shownRole('member', 'admin')).toBe('member');
  });
});
