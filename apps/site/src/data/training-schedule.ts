import type { TrainingSchedule } from '../lib/training/schedule';

/**
 * Club training times, oldest period first.
 *
 * Every period needs an explicit end date. Once the last one lapses the site keeps
 * showing it, but adds a note telling visitors the times may have been updated since —
 * so extend or replace the final period before its end date to keep that note away.
 *
 * A group with no sessions must say why, via `notice`.
 */
export const trainingSchedule: TrainingSchedule = [
  {
    start: '2026-07-01',
    end: '2026-07-31',
    senior: {
      sessions: [
        { when: 'Tuesday, 6:30pm', where: 'Omagh Leisure Complex' },
        { when: 'Thursday, 6:30pm', where: 'Youth Sport Omagh' },
        { when: 'Sunday mornings', where: 'Group long runs, various locations, check WhatsApp' },
      ],
    },
    junior: {
      notice: 'Taking a break for July — back in August.',
      sessions: [],
    },
  },
  {
    start: '2026-08-01',
    end: '2026-12-31',
    senior: {
      sessions: [
        { when: 'Tuesday, 6:30pm', where: 'Omagh Leisure Complex' },
        { when: 'Thursday, 6:30pm', where: 'Youth Sport Omagh' },
        { when: 'Sunday mornings', where: 'Group long runs, various locations, check WhatsApp' },
      ],
    },
    junior: {
      sessions: [
        { group: 'All Juniors', when: 'Monday, 6:00pm', where: 'OLC, Donnelly\'s Holm or Arelston Park' },
        { group: 'All Juniors', when: 'Wednesday, 6:00pm', where: 'OLC, Donnelly\'s Holm or Arelston Park' },
      ],
    },
  },
];
