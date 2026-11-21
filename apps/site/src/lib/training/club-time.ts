// The Worker runs in UTC and the club trains in Omagh. A session typed as
// 19:00 on a July evening is 18:00 UTC, and storing it as 19:00Z would put
// every screen an hour out of step with the people standing on the track.
//
// `schedule.ts` already has to know this for the published timetable; a
// session is a timestamp rather than a date, so it needs the offset itself
// and not just the day.

const CLUB_TIME_ZONE = 'Europe/London';

const CLUB_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * Turns what a `datetime-local` input produced — `2026-07-06T19:00`, meaning
 * seven in the evening in Omagh — into the instant to store.
 */
export function parseClubDateTime(value: string): string | undefined {
  if (!CLUB_DATE_TIME_PATTERN.test(value.trim())) return undefined;

  const asIfUtc = Date.parse(`${value.trim()}:00Z`);
  if (Number.isNaN(asIfUtc)) return undefined;

  // The offset has to be read at the instant it applies to, which is the
  // answer we are working out. One correction is enough: the first guess is
  // only ever an hour out, and an hour's error can't cross a clock change
  // except inside the hour the clocks move, where no session is ever set.
  const firstGuess = asIfUtc - offsetMillisAt(asIfUtc);
  const instant = asIfUtc - offsetMillisAt(firstGuess);

  return new Date(instant).toISOString();
}

/** The reverse, for prefilling a `datetime-local` input with a stored session. */
export function toClubDateTimeInput(iso: string): string {
  const parts = clubParts(Date.parse(iso));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** e.g. 'Mon 6 Jul 2026, 19:00'. */
export function formatClubDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: CLUB_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Just the time, e.g. '19:00' — for a list that has already said which night
 * it is talking about.
 */
export function formatClubTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: CLUB_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** e.g. 'Mon 6 Jul 2026' — for grouping a list by the night it happened. */
export function formatClubDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    timeZone: CLUB_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** e.g. 'Tue 17 Nov' — the night a session was, in a line that already has a dated column. */
export function formatClubNight(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    timeZone: CLUB_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * The club's calendar day for an instant, as `YYYY-MM-DD`.
 *
 * A session at 20:30 on a June evening is 19:30Z, and one at 00:30 after a
 * late finish is the small hours of the next UTC day. Asking "is this on
 * tonight?" against UTC gets both wrong, so the comparison is made on the day
 * Omagh is living in.
 */
export function clubDayKey(iso: string | number | Date): string {
  const instant = iso instanceof Date ? iso.getTime() : typeof iso === 'number' ? iso : Date.parse(iso);
  const parts = clubParts(instant);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function offsetMillisAt(instant: number): number {
  const parts = clubParts(instant);
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asIfUtc - instant;
}

type ClubParts = Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', string>;

const CLUB_PARTS_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: CLUB_TIME_ZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function clubParts(instant: number): ClubParts {
  const parts = {} as ClubParts;
  for (const part of CLUB_PARTS_FORMAT.formatToParts(new Date(instant))) {
    if (part.type === 'literal') continue;
    parts[part.type as keyof ClubParts] = part.value;
  }
  // Some ICU builds render midnight as hour 24 of the previous day.
  if (parts.hour === '24') parts.hour = '00';
  return parts;
}
