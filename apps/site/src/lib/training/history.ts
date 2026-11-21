// A member's training history: the nights they were signed in, newest first.
// An admin reads one member's; a household reads everyone's in it. Long-standing members have years of it, so the
// page shows the most recent and says how many there are in all.

export interface AttendedSession {
  sessionId: string;
  startsAt: string;
  squad: string;
  pricePence: number;
}

export const HISTORY_SHOWN = 20;

export function recentAttendance(
  sessions: AttendedSession[],
  limit: number = HISTORY_SHOWN,
): { shown: AttendedSession[]; total: number } {
  const newestFirst = [...sessions].sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  return { shown: newestFirst.slice(0, limit), total: sessions.length };
}

export interface SignIn {
  memberId: string;
  firstName: string;
  surname: string;
  session: AttendedSession;
}

export interface MemberHistory {
  memberId: string;
  name: string;
  shown: AttendedSession[];
  total: number;
}

export function householdHistory(signIns: SignIn[], limit: number = HISTORY_SHOWN): MemberHistory[] {
  const byMember = new Map<string, SignIn[]>();
  for (const signIn of signIns) {
    byMember.set(signIn.memberId, [...(byMember.get(signIn.memberId) ?? []), signIn]);
  }

  return [...byMember.values()]
    .map((own) => {
      const { memberId, firstName, surname } = own[0];
      const sessions = own.map((signIn) => signIn.session);
      return { memberId, name: `${firstName} ${surname}`, ...recentAttendance(sessions, limit) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
