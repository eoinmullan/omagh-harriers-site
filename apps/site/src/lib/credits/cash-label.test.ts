import { describe, expect, it } from 'vitest';
import { cashLabel } from './cash-label';

describe('cashLabel', () => {
  it('says a round amount the way it is handed over', () => {
    expect(cashLabel(1000)).toBe('£10');
    expect(cashLabel(200)).toBe('£2');
  });

  it('keeps the pence when there are some', () => {
    expect(cashLabel(250)).toBe('£2.50');
    expect(cashLabel(1005)).toBe('£10.05');
  });

  it('drops the sign, because the cell says which way the money went', () => {
    expect(cashLabel(-500)).toBe('£5');
    expect(cashLabel(-250)).toBe('£2.50');
  });

  it('reads nothing as £0', () => {
    expect(cashLabel(0)).toBe('£0');
  });

  it('handles the most anybody hands over', () => {
    expect(cashLabel(100_000)).toBe('£1000');
  });
});
