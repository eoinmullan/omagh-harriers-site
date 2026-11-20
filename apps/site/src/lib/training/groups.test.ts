import { describe, expect, it } from 'vitest';
import {
  isEmpty,
  planGroupMembership,
  planGroupRename,
  planGroupRetirement,
  planGroupReturn,
  planNewGroup,
  type ExistingGroup,
  type GroupChange,
  type GroupCreation,
} from './groups';

function group(overrides: Partial<ExistingGroup> = {}): ExistingGroup {
  return { id: 'group-a', name: 'Endurance', isActive: true, ...overrides };
}

function insertOf(creation: GroupCreation) {
  if ('problem' in creation) throw new Error(`expected an insert, got: ${creation.problem}`);
  return creation.insert;
}

function updateOf(change: GroupChange) {
  if ('problem' in change) throw new Error(`expected an update, got: ${change.problem}`);
  return change.update;
}

function problemOf(result: GroupCreation | GroupChange): string {
  if (!('problem' in result)) throw new Error('expected a problem');
  return result.problem;
}

describe('planNewGroup', () => {
  it('writes the trimmed name', () => {
    expect(insertOf(planNewGroup({ name: '  Sprints  ', existing: [] }))).toEqual({
      name: 'Sprints',
    });
  });

  it('refuses an empty name', () => {
    expect(problemOf(planNewGroup({ name: '   ', existing: [] }))).toBe('Give the squad a name.');
  });

  it('names the group already using that name', () => {
    const problem = problemOf(planNewGroup({ name: 'endurance', existing: [group()] }));
    expect(problem).toBe('There is already a group called Endurance.');
  });

  it('catches a near-duplicate the database would have allowed', () => {
    const existing = [group({ name: 'Middle Distance' })];
    expect(problemOf(planNewGroup({ name: 'Middle-Distance', existing }))).toContain(
      'already a group called Middle Distance',
    );
  });

  it('points at a retired group rather than letting a second one in beside it', () => {
    const existing = [group({ name: 'Juniors', isActive: false })];
    expect(problemOf(planNewGroup({ name: 'Juniors', existing }))).toBe(
      'Juniors already exists but is retired. Bring that one back rather than adding it again.',
    );
  });
});

describe('planGroupRename', () => {
  it('writes the new name', () => {
    const change = planGroupRename({ group: group(), name: 'Endurance Squad', existing: [group()] });
    expect(updateOf(change)).toEqual({ name: 'Endurance Squad' });
  });

  it('allows a re-spelling of the group\'s own name', () => {
    const existing = [group({ name: 'middle distance' })];
    const change = planGroupRename({
      group: existing[0],
      name: 'Middle Distance',
      existing,
    });
    expect(updateOf(change)).toEqual({ name: 'Middle Distance' });
  });

  it('refuses a name another group already holds', () => {
    const existing = [group(), group({ id: 'group-b', name: 'Sprints' })];
    const change = planGroupRename({ group: existing[0], name: 'sprints', existing });
    expect(problemOf(change)).toBe('There is already a group called Sprints.');
  });

  it('says so when nothing would change', () => {
    const change = planGroupRename({ group: group(), name: 'Endurance', existing: [group()] });
    expect(problemOf(change)).toBe('Endurance is already called that.');
  });

  it('refuses an empty name', () => {
    expect(problemOf(planGroupRename({ group: group(), name: '', existing: [] }))).toBe(
      'Give the squad a name.',
    );
  });
});

describe('planGroupRetirement', () => {
  it('soft-disables rather than dropping the row', () => {
    expect(updateOf(planGroupRetirement(group()))).toEqual({ is_active: false });
  });

  it('refuses a group that is already retired', () => {
    expect(problemOf(planGroupRetirement(group({ isActive: false })))).toBe(
      'Endurance is already retired.',
    );
  });
});

describe('planGroupReturn', () => {
  it('brings a retired group back', () => {
    expect(updateOf(planGroupReturn(group({ isActive: false })))).toEqual({ is_active: true });
  });

  it('refuses a group that is already running', () => {
    expect(problemOf(planGroupReturn(group()))).toBe('Endurance is already running.');
  });
});

describe('planGroupMembership', () => {
  const eligible = ['member-a', 'member-b', 'member-c'];

  it('adds the newly ticked and removes the newly unticked', () => {
    const change = planGroupMembership({
      groupId: 'group-a',
      current: ['member-a', 'member-b'],
      selected: ['member-b', 'member-c'],
      eligible,
    });

    expect(change).toEqual({
      add: [{ member_id: 'member-c', group_id: 'group-a' }],
      remove: ['member-a'],
    });
  });

  it('writes nothing when the ticks are unchanged', () => {
    const change = planGroupMembership({
      groupId: 'group-a',
      current: ['member-a'],
      selected: ['member-a'],
      eligible,
    });

    expect(isEmpty(change)).toBe(true);
  });

  it('empties the group when everything is unticked', () => {
    const change = planGroupMembership({
      groupId: 'group-a',
      current: ['member-a', 'member-b'],
      selected: [],
      eligible,
    });

    expect(change.add).toEqual([]);
    expect(change.remove).toEqual(['member-a', 'member-b']);
  });

  it('ignores a member the screen never offered', () => {
    const change = planGroupMembership({
      groupId: 'group-a',
      current: [],
      selected: ['member-a', 'someone-elses-member'],
      eligible,
    });

    expect(change.add).toEqual([{ member_id: 'member-a', group_id: 'group-a' }]);
  });

  it('leaves a lapsed member the screen never showed where they are', () => {
    const change = planGroupMembership({
      groupId: 'group-a',
      current: ['lapsed-member', 'member-a'],
      selected: [],
      eligible,
    });

    expect(change.remove).toEqual(['member-a']);
  });
});
