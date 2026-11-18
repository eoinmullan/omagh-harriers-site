import type { GroupInsert, GroupUpdate, MemberGroupInsert } from '@omagh/supabase';
import { normaliseForSearch } from '@omagh/training';

// Every rule about what may be written to `groups` and `member_groups` lives
// here, in the style of `credits/ledger.ts`: the page hands over a form and
// gets back either a row to write or one sentence to show the admin.

export interface ExistingGroup {
  id: string;
  name: string;
  isActive: boolean;
}

export type GroupCreation = { insert: GroupInsert } | { problem: string };
export type GroupChange = { update: GroupUpdate } | { problem: string };

export function planNewGroup(request: {
  name: string;
  existing: ExistingGroup[];
}): GroupCreation {
  const name = request.name.trim();
  if (!name) return { problem: 'Give the group a name.' };

  const clash = findClash(request.existing, name);
  if (clash) return { problem: clashMessage(clash) };

  return { insert: { name } };
}

export function planGroupRename(request: {
  group: ExistingGroup;
  name: string;
  existing: ExistingGroup[];
}): GroupChange {
  const name = request.name.trim();
  if (!name) return { problem: 'Give the group a name.' };
  if (name === request.group.name) return { problem: `${name} is already called that.` };

  const others = request.existing.filter((group) => group.id !== request.group.id);
  const clash = findClash(others, name);
  if (clash) return { problem: clashMessage(clash) };

  return { update: { name } };
}

// Retiring is never a delete: the group's sessions and their attendance have
// to keep meaning something years after the squad stopped running.
export function planGroupRetirement(group: ExistingGroup): GroupChange {
  if (!group.isActive) return { problem: `${group.name} is already retired.` };
  return { update: { is_active: false } };
}

export function planGroupReturn(group: ExistingGroup): GroupChange {
  if (group.isActive) return { problem: `${group.name} is already running.` };
  return { update: { is_active: true } };
}

export interface MembershipChange {
  add: MemberGroupInsert[];
  remove: string[];
}

/**
 * The tick boxes are the whole truth about who is in the group, so the write
 * is the difference between what was ticked and what was there.
 *
 * `eligible` bounds it on both sides. A member the screen never offered
 * cannot be added, which stops a crafted post putting a stranger in a squad;
 * and a member the screen never offered cannot be dropped either, so a lapsed
 * member who is still in the group stays in it rather than vanishing the
 * first time somebody saves the page they are missing from.
 */
export function planGroupMembership(request: {
  groupId: string;
  current: string[];
  selected: string[];
  eligible: string[];
}): MembershipChange {
  const eligible = new Set(request.eligible);
  const selected = new Set(request.selected.filter((id) => eligible.has(id)));
  const current = new Set(request.current);

  return {
    add: [...selected]
      .filter((memberId) => !current.has(memberId))
      .map((memberId) => ({ member_id: memberId, group_id: request.groupId })),
    remove: [...current].filter(
      (memberId) => eligible.has(memberId) && !selected.has(memberId),
    ),
  };
}

export function isEmpty(change: MembershipChange): boolean {
  return change.add.length === 0 && change.remove.length === 0;
}

/**
 * The unique index is on `lower(name)`, so Postgres would let "Middle
 * Distance" and "Middle-Distance" both exist. The check here is deliberately
 * stricter, because two groups a registrar cannot tell apart in a picker is a
 * keying slip rather than a feature — and the admin gets a sentence instead
 * of a constraint error either way.
 */
function findClash(existing: ExistingGroup[], name: string): ExistingGroup | undefined {
  const key = normaliseForSearch(name);
  return existing.find((group) => normaliseForSearch(group.name) === key);
}

function clashMessage(clash: ExistingGroup): string {
  return clash.isActive
    ? `There is already a group called ${clash.name}.`
    : `${clash.name} already exists but is retired. Bring that one back rather than adding it again.`;
}
