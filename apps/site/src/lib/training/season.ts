import { dayBefore } from './schedule';

const SEASON_START_MONTHS = [3, 6, 9, 12];

export interface SeasonSegment {
  start: string;
  end: string;
  label: string;
}

/**
 * Splits a date range wherever its season label changes, so a period running August to
 * December yields one segment per season rather than pretending it is summer throughout.
 * A range sitting inside a single season comes back as one segment.
 */
export function seasonSegments(start: string, end: string): SeasonSegment[] {
  const segments: SeasonSegment[] = [];
  let segmentStart = start;

  for (
    let boundary = nextSeasonStartAfter(segmentStart);
    boundary <= end;
    boundary = nextSeasonStartAfter(segmentStart)
  ) {
    segments.push({
      start: segmentStart,
      end: dayBefore(boundary),
      label: seasonLabel(segmentStart),
    });
    segmentStart = boundary;
  }

  segments.push({ start: segmentStart, end, label: seasonLabel(segmentStart) });
  return segments;
}

/** Season boundaries always fall on the first of the month, so the day never matters here. */
function nextSeasonStartAfter(isoDate: string): string {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const nextMonth = SEASON_START_MONTHS.find((startMonth) => startMonth > month);

  return nextMonth ? `${year}-${String(nextMonth).padStart(2, '0')}-01` : `${year + 1}-03-01`;
}

/**
 * The calendar season shown in the home page heading. This is a freshness cue for
 * visitors — it is deliberately unrelated to the athletics calendar (cross country,
 * indoor, outdoor) and to which set of training times is being displayed.
 *
 * Seasons are meteorological: Spring 1 Mar, Summer 1 Jun, Autumn 1 Sep, Winter 1 Dec.
 */
export function seasonLabel(today: string): string {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));

  if (month >= 3 && month <= 5) return `Spring ${year}`;
  if (month >= 6 && month <= 8) return `Summer ${year}`;
  if (month >= 9 && month <= 11) return `Autumn ${year}`;

  const winterStartYear = month === 12 ? year : year - 1;
  return `Winter ${winterStartYear}/${winterStartYear + 1}`;
}
