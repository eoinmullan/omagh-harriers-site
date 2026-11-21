import { describe, expect, it } from 'vitest';
import { rollUpDay } from './day';

describe('rollUpDay', () => {
  it('adds every session on the day together', () => {
    const totals = rollUpDay([
      { heads: { members: 10, guests: 1, total: 11 }, cash: { totalPence: 1200, byRecorder: [{ recordedBy: 'Eoin', totalPence: 1200 }] } },
      { heads: { members: 5, guests: 0, total: 5 }, cash: { totalPence: 500, byRecorder: [{ recordedBy: 'Ciara', totalPence: 300 }, { recordedBy: 'Eoin', totalPence: 200 }] } },
    ]);

    expect(totals).toEqual({
      heads: { members: 15, guests: 1, total: 16 },
      cash: {
        totalPence: 1700,
        byRecorder: [
          { recordedBy: 'Eoin', totalPence: 1400 },
          { recordedBy: 'Ciara', totalPence: 300 },
        ],
      },
    });
  });

  it('is nothing on a day with no sessions', () => {
    expect(rollUpDay([])).toEqual({ heads: { members: 0, guests: 0, total: 0 }, cash: { totalPence: 0, byRecorder: [] } });
  });
});
