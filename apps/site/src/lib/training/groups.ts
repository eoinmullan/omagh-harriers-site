import type { GroupInsert, GroupUpdate } from '../supabase/types';
import { formatClubNight } from './club-time';
import { normaliseForSearch } from './names';

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
  if (!name) return { problem: 'Give the squad a name.' };

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
  if (!name) return { problem: 'Give the squad a name.' };
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

/** The registrar's window for a squad's regulars, set by `squad_regulars` (0024). */
export const REGULARS_WINDOW_WEEKS = 8;

export interface Regular {
  memberId: string;
  sessionsAttended: number;
  lastAttendedAt: string;
}

/**
 * Who has been turning up to a squad without being one of its members.
 *
 * They're on the registrar's Usuals for as long as they keep coming, and drop
 * off eight weeks after they stop. Offering them on the squad's page is how an
 * admin makes that permanent. Most frequent first, because they're the likeliest
 * to be a member in all but name.
 */
export function regularsToPromote(regulars: Regular[], assigned: Set<string>): Regular[] {
  return regulars
    .filter((regular) => !assigned.has(regular.memberId))
    .sort(
      (a, b) =>
        b.sessionsAttended - a.sessionsAttended || b.lastAttendedAt.localeCompare(a.lastAttendedAt),
    );
}

/** e.g. "3 sessions in the last 8 weeks, most recently Tue 17 Nov". */
export function describeRegular(regular: Regular): string {
  const sessions = regular.sessionsAttended === 1 ? '1 session' : `${regular.sessionsAttended} sessions`;
  return `${sessions} in the last ${REGULARS_WINDOW_WEEKS} weeks, most recently ${formatClubNight(regular.lastAttendedAt)}`;
}
