import { describe, expect, it } from 'vitest';
import {
  describeRegular,
  regularsToPromote,
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

describe('regularsToPromote', () => {
  const regular = (memberId: string, sessionsAttended: number, lastAttendedAt = '2026-11-17T18:00:00Z') => ({
    memberId,
    sessionsAttended,
    lastAttendedAt,
  });

  it('offers only the regulars who are not already members of the squad', () => {
    const offered = regularsToPromote([regular('jack', 3), regular('noah', 2)], new Set(['jack']));

    expect(offered.map((r) => r.memberId)).toEqual(['noah']);
  });

  it('puts the most frequent first, then the most recent', () => {
    const offered = regularsToPromote(
      [regular('a', 1), regular('b', 4), regular('c', 1, '2026-11-19T18:00:00Z')],
      new Set(),
    );

    expect(offered.map((r) => r.memberId)).toEqual(['b', 'c', 'a']);
  });
});

describe('describeRegular', () => {
  it('says how often and how recently', () => {
    expect(describeRegular({ memberId: 'jack', sessionsAttended: 3, lastAttendedAt: '2026-11-17T18:00:00Z' })).toBe(
      '3 sessions in the last 8 weeks, most recently Tue 17 Nov',
    );
  });

  it('counts one session as one', () => {
    expect(describeRegular({ memberId: 'jack', sessionsAttended: 1, lastAttendedAt: '2026-11-17T18:00:00Z' })).toMatch(
      /^1 session in/,
    );
  });
});
