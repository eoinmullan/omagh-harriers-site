import { describe, expect, it } from 'vitest';
import { householdHistory, recentAttendance, type AttendedSession } from './history';

function night(startsAt: string): AttendedSession {
  return { sessionId: startsAt, startsAt, squad: 'Endurance', pricePence: 200 };
}

describe('recentAttendance', () => {
  it('lists the newest night first', () => {
    const { shown } = recentAttendance([night('2026-10-01T18:00:00Z'), night('2026-11-01T18:00:00Z')]);

    expect(shown.map((session) => session.startsAt)).toEqual(['2026-11-01T18:00:00Z', '2026-10-01T18:00:00Z']);
  });

  it('shows only the most recent, and counts them all', () => {
    const nights = ['2026-09-01', '2026-10-01', '2026-11-01'].map((day) => night(`${day}T18:00:00Z`));

    const { shown, total } = recentAttendance(nights, 2);

    expect(shown.map((session) => session.startsAt)).toEqual(['2026-11-01T18:00:00Z', '2026-10-01T18:00:00Z']);
    expect(total).toBe(3);
  });

  it('is empty for somebody who has never trained', () => {
    expect(recentAttendance([])).toEqual({ shown: [], total: 0 });
  });
});

describe('householdHistory', () => {
  function signIn(memberId: string, firstName: string, startsAt: string) {
    return { memberId, firstName, surname: 'Kelly', session: night(startsAt) };
  }

  it('gives each member of the household their own list, by first name', () => {
    const history = householdHistory([
      signIn('noah', 'Noah', '2026-11-01T18:00:00Z'),
      signIn('jack', 'Jack', '2026-11-02T18:00:00Z'),
      signIn('noah', 'Noah', '2026-11-03T18:00:00Z'),
    ]);

    expect(history.map((member) => [member.name, member.total])).toEqual([
      ['Jack Kelly', 1],
      ['Noah Kelly', 2],
    ]);
  });

  it('lists each member newest night first', () => {
    const [noah] = householdHistory([
      signIn('noah', 'Noah', '2026-10-01T18:00:00Z'),
      signIn('noah', 'Noah', '2026-11-01T18:00:00Z'),
    ]);

    expect(noah.shown.map((session) => session.startsAt)).toEqual(['2026-11-01T18:00:00Z', '2026-10-01T18:00:00Z']);
  });

  it('has nobody in it when nobody has trained', () => {
    expect(householdHistory([])).toEqual([]);
  });
});
