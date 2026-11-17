// Pence everywhere inside the app, pounds only at the edges where a person
// types or reads an amount.

const POUNDS_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/;

export function formatPounds(pence: number): string {
  return `£${(Math.abs(pence) / 100).toFixed(2)}`;
}

export function formatBalance(pence: number): string {
  return pence < 0 ? `−${formatPounds(pence)}` : formatPounds(pence);
}

// Admins type pounds — "10", "10.50", "£10.50". Anything else, including zero
// and a negative, is refused rather than guessed at: direction is chosen with a
// control, never by typing a minus sign.
export function parsePounds(input: string): number | undefined {
  const match = POUNDS_PATTERN.exec(input.replace(/[£,\s]/g, ''));
  if (!match) return undefined;

  const pence = Number(match[1]) * 100 + Number((match[2] ?? '0').padEnd(2, '0'));
  return pence > 0 ? pence : undefined;
}
