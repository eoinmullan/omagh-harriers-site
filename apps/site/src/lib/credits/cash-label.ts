import { formatPounds } from './money';

/**
 * Money as it is spoken at a gate.
 *
 * Ten pounds handed over is "£10", not "£10.00" — the pence are noise when
 * there are none, and the figure has to be read at a glance off a cell the
 * width of a thumb. Anything with pence in it keeps them.
 */
export function cashLabel(pence: number): string {
  const amount = Math.abs(pence);
  return amount % 100 === 0 ? `£${amount / 100}` : formatPounds(amount);
}
