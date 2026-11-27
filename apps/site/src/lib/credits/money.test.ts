import { describe, expect, it } from 'vitest';
import { cashLabel } from './cash-label';
import { formatBalance, formatMovement, formatPounds, parsePounds } from './money';

describe('formatPounds', () => {
  it('writes whole pounds with pence', () => {
    expect(formatPounds(1000)).toBe('£10.00');
  });

  it('writes an awkward amount without rounding it away', () => {
    expect(formatPounds(250)).toBe('£2.50');
  });

  it('drops the sign of a debit', () => {
    expect(formatPounds(-200)).toBe('£2.00');
  });
});

describe('formatBalance', () => {
  it('shows a positive balance plainly', () => {
    expect(formatBalance(1750)).toBe('£17.50');
  });

  it('shows an overdrawn balance as negative', () => {
    expect(formatBalance(-400)).toBe('−£4.00');
  });

  it('shows an empty account as zero', () => {
    expect(formatBalance(0)).toBe('£0.00');
  });
});

describe('parsePounds', () => {
  it('reads whole pounds', () => {
    expect(parsePounds('10')).toBe(1000);
  });

  it('reads pounds and pence', () => {
    expect(parsePounds('10.50')).toBe(1050);
  });

  it('reads a single decimal place as tens of pence', () => {
    expect(parsePounds('10.5')).toBe(1050);
  });

  it('reads an amount typed with a pound sign', () => {
    expect(parsePounds('£10.50')).toBe(1050);
  });

  it('ignores surrounding whitespace', () => {
    expect(parsePounds('  7.25 ')).toBe(725);
  });

  it('reads an amount typed with a thousands separator', () => {
    expect(parsePounds('1,000')).toBe(100000);
  });

  it('keeps an awkward amount exact', () => {
    expect(parsePounds('10.57')).toBe(1057);
  });

  it('refuses zero', () => {
    expect(parsePounds('0')).toBeUndefined();
  });

  it('refuses zero written with pence', () => {
    expect(parsePounds('0.00')).toBeUndefined();
  });

  it('refuses a negative amount, because direction is a control not a minus sign', () => {
    expect(parsePounds('-5')).toBeUndefined();
  });

  it('refuses more precision than money has', () => {
    expect(parsePounds('10.555')).toBeUndefined();
  });

  it('refuses text', () => {
    expect(parsePounds('ten pounds')).toBeUndefined();
  });

  it('refuses an empty entry', () => {
    expect(parsePounds('')).toBeUndefined();
  });
});

describe('cashLabel', () => {
  it('drops the pence when there are none, the way money is spoken at a gate', () => {
    expect(cashLabel(1000)).toBe('£10');
    expect(cashLabel(200)).toBe('£2');
  });

  it('keeps the pence when there are some', () => {
    expect(cashLabel(1050)).toBe('£10.50');
    expect(cashLabel(199)).toBe('£1.99');
  });

  it('reads a take-back as a plain amount, direction being the control', () => {
    expect(cashLabel(-500)).toBe('£5');
  });

  it('is nothing at all, not an empty string', () => {
    expect(cashLabel(0)).toBe('£0');
  });
});

describe('formatMovement', () => {
  it('marks money in with a plus', () => {
    expect(formatMovement(1000)).toBe('+£10.00');
  });

  it('marks money out with a minus', () => {
    expect(formatMovement(-200)).toBe('−£2.00');
  });

  it('says a session that cost nothing was no charge', () => {
    expect(formatMovement(0)).toBe('No charge');
  });
});
