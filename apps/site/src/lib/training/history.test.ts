import { describe, expect, it } from 'vitest';
import { chargesBySignIn, recentAttendance, type AttendedSession } from './history';

function night(startsAt: string): AttendedSession {
  return { sessionId: startsAt, startsAt, squad: 'Endurance', chargedPence: 200 };
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

describe('chargesBySignIn', () => {
  it('reads what each sign-in cost from its session debit', () => {
    const charges = chargesBySignIn([{ idempotency_key: 'session:att-1', amount_pence: -200 }]);

    expect(charges.get('att-1')).toBe(200);
  });

  it('leaves out a sign-in nothing was taken for', () => {
    const charges = chargesBySignIn([{ idempotency_key: 'session:att-1', amount_pence: -200 }]);

    expect(charges.has('att-2')).toBe(false);
  });

  it('ignores rows that are not session debits', () => {
    const charges = chargesBySignIn([{ idempotency_key: 'untick:att-1', amount_pence: 200 }]);

    expect(charges.size).toBe(0);
  });
});
