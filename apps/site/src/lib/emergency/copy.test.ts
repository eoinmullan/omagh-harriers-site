import { describe, expect, it } from 'vitest';
import { assembleCopy, decideAboutCopy, describeCopyAge, findPeople, sessionsToday, telHref, type ContactPerson, type EmergencyCopy } from './copy';

const now = new Date('2026-11-28T19:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function person(overrides: Partial<ContactPerson> = {}): ContactPerson {
  return {
    memberId: 'm-1',
    firstName: 'Hannah',
    surname: 'McCullagh',
    contactName: 'Roisin McCullagh',
    contactPhone: '07700 900123',
    ...overrides,
  };
}

describe('decideAboutCopy', () => {
  it('keeps a copy refreshed recently', () => {
    expect(decideAboutCopy({ holdsFlag: true, savedAt: now.getTime() - 3 * DAY, now })).toBe('keep');
  });

  it('keeps a copy a day short of a year old', () => {
    expect(decideAboutCopy({ holdsFlag: true, savedAt: now.getTime() - 364 * DAY, now })).toBe('keep');
  });

  it('deletes a copy not refreshed for over a year', () => {
    expect(decideAboutCopy({ holdsFlag: true, savedAt: now.getTime() - 366 * DAY, now })).toBe('delete');
  });

  it('deletes any copy once the login no longer holds the flag', () => {
    expect(decideAboutCopy({ holdsFlag: false, savedAt: now.getTime(), now })).toBe('delete');
  });
});

describe('sessionsToday', () => {
  const copy = (sessions: EmergencyCopy['sessions']): EmergencyCopy => ({ principalId: 'p-1', people: [], sessions });

  it("keeps today's sessions, soonest first, and drops cancelled ones and other days", () => {
    const sessions = sessionsToday(
      copy([
        { id: 's-2', startsAt: '2026-11-28T19:30:00Z', groupName: 'Endurance', isCancelled: false, signedIn: [] },
        { id: 's-1', startsAt: '2026-11-28T18:45:00Z', groupName: 'Juniors', isCancelled: false, signedIn: [] },
        { id: 's-3', startsAt: '2026-11-28T18:00:00Z', groupName: 'Sprints', isCancelled: true, signedIn: [] },
        { id: 's-4', startsAt: '2026-11-21T18:00:00Z', groupName: 'Juniors', isCancelled: false, signedIn: [] },
      ]),
      now,
    );

    expect(sessions.map((session) => session.id)).toEqual(['s-1', 's-2']);
  });
});

describe('findPeople', () => {
  const people = [
    person({ memberId: 'm-1', firstName: 'Hannah', surname: 'McCullagh' }),
    person({ memberId: 'm-2', firstName: 'Jack', surname: "O'Kane" }),
    person({ memberId: 'm-3', firstName: 'Aoife', surname: 'Kelly' }),
  ];

  it('finds by part of a name, ignoring apostrophes', () => {
    expect(findPeople(people, 'okane').map((found) => found.memberId)).toEqual(['m-2']);
  });

  it('lists everybody in surname order when nothing is typed', () => {
    expect(findPeople(people, '').map((found) => found.memberId)).toEqual(['m-3', 'm-1', 'm-2']);
  });
});

describe('telHref', () => {
  it('keeps only the digits of a local number', () => {
    expect(telHref('07700 900-123')).toBe('tel:07700900123');
  });

  it('keeps the plus of an international number', () => {
    expect(telHref('+44 7700 900123')).toBe('tel:+447700900123');
  });

  it('gives no link for something too short to be a number', () => {
    expect(telHref('n/a')).toBeUndefined();
  });
});

describe('assembleCopy', () => {
  const rows = {
    principalId: 'p-1',
    members: [
      { id: 'm-1', first_name: 'Hannah', surname: 'McCullagh', is_active: true },
      { id: 'm-2', first_name: 'Jack', surname: 'Kelly', is_active: true },
      { id: 'm-3', first_name: 'Old', surname: 'Timer', is_active: false },
    ],
    contacts: [{ member_id: 'm-1', contact_name: 'Roisin McCullagh', contact_phone: '07700 900123' }],
    sessions: [{ id: 's-1', starts_at: '2026-11-28T18:45:00Z', is_cancelled: false, group: { name: 'Juniors' } }],
    attendance: [
      { session_id: 's-1', member_id: 'm-1', guest: null },
      { session_id: 's-1', member_id: 'm-3', guest: null },
      { session_id: 's-1', member_id: null, guest: { first_name: 'Sam', surname: 'Doyle' } },
    ],
  };

  it('lists active members with their contact, or none on file', () => {
    const copy = assembleCopy(rows);

    expect(copy.people).toEqual([
      { memberId: 'm-1', firstName: 'Hannah', surname: 'McCullagh', contactName: 'Roisin McCullagh', contactPhone: '07700 900123' },
      { memberId: 'm-2', firstName: 'Jack', surname: 'Kelly', contactName: null, contactPhone: null },
    ]);
  });

  it("lists everyone signed in to a session, guests and lapsed members included, by surname", () => {
    const copy = assembleCopy(rows);

    expect(copy.sessions[0]!.signedIn).toEqual([
      { memberId: null, firstName: 'Sam', surname: 'Doyle' },
      { memberId: 'm-1', firstName: 'Hannah', surname: 'McCullagh' },
      { memberId: 'm-3', firstName: 'Old', surname: 'Timer' },
    ]);
  });
});

describe('describeCopyAge', () => {
  it('names the time for a copy saved today', () => {
    expect(describeCopyAge(Date.parse('2026-11-28T18:42:00Z'), now)).toBe('Saved on this phone at 18:42.');
  });

  it('names the day as well for an older copy', () => {
    expect(describeCopyAge(Date.parse('2026-11-24T18:42:00Z'), now)).toBe('Saved on this phone on Tue 24 Nov at 18:42.');
  });
});
