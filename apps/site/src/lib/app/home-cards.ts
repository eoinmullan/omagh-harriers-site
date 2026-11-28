import { clubDayKey, formatClubTime } from '../training/club-time';

// The line under each tool's card on Home, so the card says something worth
// reading before it's tapped.

export interface SessionToday {
  groupName: string;
  startsAt: string;
  isCancelled: boolean;
}

export function registrationLine(sessions: readonly SessionToday[], now: Date = new Date()): string {
  const today = clubDayKey(now);
  const on = sessions
    .filter((session) => !session.isCancelled && clubDayKey(session.startsAt) === today)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  if (on.length === 0) return 'Nothing on today. Start a session at the track.';
  const named = on.map((session) => `${session.groupName} at ${formatClubTime(session.startsAt)}`);
  if (named.length <= 2) return `Today: ${named.join(' and ')}.`;
  return `Today: ${on.length} sessions, from ${formatClubTime(on[0]!.startsAt)}.`;
}

export function emergencyLine(withContact: number, activeMembers: number): string {
  if (activeMembers === 0) return 'No members yet.';
  if (withContact === activeMembers) return `Every member has a contact on file.`;
  return `${withContact} of ${activeMembers} members have a contact on file.`;
}

export function adminLine(overdrawnHouseholds: number): string {
  if (overdrawnHouseholds === 0) return 'No household is overdrawn.';
  if (overdrawnHouseholds === 1) return '1 household is overdrawn.';
  return `${overdrawnHouseholds} households are overdrawn.`;
}
