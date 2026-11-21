import { describe, expect, it } from 'vitest';
import { channelsForAdminChange, channelsToNudge, dayChannel, sessionChannel } from './nudge';
import type { Write } from './queue';

const tick: Write = { kind: 'sign_in', memberId: 'jack', sessionId: 's1', attendanceId: 'a1' };

describe('channelsToNudge', () => {
  it('nudges the session a tick belongs to', () => {
    expect(channelsToNudge([tick])).toEqual([sessionChannel('s1')]);
  });

  it('nudges each session once, however many writes landed for it', () => {
    const cash: Write = {
      kind: 'cash',
      row: { principal_id: 'p', amount_pence: 1000, type: 'top_up_cash', idempotency_key: 'k', session_id: 's1' },
    };

    expect(channelsToNudge([tick, tick, cash])).toEqual([sessionChannel('s1')]);
  });

  it("tells the day's list about a new session, as well as the session itself", () => {
    const started: Write = {
      kind: 'create_session',
      row: { id: 's2', group_id: 'g', starts_at: '2026-11-21T18:00:00Z', price_pence: 200, created_by: 'p' },
    };

    expect(channelsToNudge([started])).toEqual([dayChannel('2026-11-21'), sessionChannel('s2')]);
  });

  it('nudges for guests and for unticks that know their session', () => {
    const writes: Write[] = [
      { kind: 'guest_undo', guestId: 'g1', sessionId: 's3' },
      { kind: 'undo_sign_in', attendanceId: 'a1', sessionId: 's4' },
    ];

    expect(channelsToNudge(writes)).toEqual([sessionChannel('s3'), sessionChannel('s4')]);
  });

  it('nudges nobody for an untick queued before it carried its session', () => {
    expect(channelsToNudge([{ kind: 'undo_sign_in', attendanceId: 'a1' }])).toEqual([]);
  });
});

describe('channelsForAdminChange', () => {
  it("nudges today's list and every session running today", () => {
    const channels = channelsForAdminChange({ today: '2026-11-21', todaysSessionIds: ['s1', 's2'] });

    expect(channels).toEqual([dayChannel('2026-11-21'), sessionChannel('s1'), sessionChannel('s2')]);
  });

  it('also nudges a session on another day, and that day\'s list', () => {
    const channels = channelsForAdminChange({
      today: '2026-11-21',
      todaysSessionIds: [],
      session: { id: 'next-week', startsAt: '2026-11-28T18:00:00Z' },
    });

    expect(channels).toEqual([dayChannel('2026-11-21'), sessionChannel('next-week'), dayChannel('2026-11-28')]);
  });

  it("tells a new session's day even before its id is known", () => {
    const channels = channelsForAdminChange({
      today: '2026-11-21',
      todaysSessionIds: [],
      session: { startsAt: '2026-11-28T18:00:00Z' },
    });

    expect(channels).toEqual([dayChannel('2026-11-21'), dayChannel('2026-11-28')]);
  });

  it("doesn't repeat a session that is today's anyway", () => {
    const channels = channelsForAdminChange({
      today: '2026-11-21',
      todaysSessionIds: ['s1'],
      session: { id: 's1', startsAt: '2026-11-21T18:00:00Z' },
    });

    expect(channels).toEqual([dayChannel('2026-11-21'), sessionChannel('s1')]);
  });
});
