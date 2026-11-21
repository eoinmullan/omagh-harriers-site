// A report as a CSV file for a spreadsheet.
//
// A cell is quoted when it holds a comma, a quote or a line break. A text cell
// that starts with =, +, - or @ is prefixed with an apostrophe, because a
// spreadsheet would otherwise run it as a formula, and a name or a note typed
// into the app is not something to execute. Numbers are written as numbers, so
// a negative amount stays a number.

export type CsvCell = string | number | null | { pence: number };

export function toCsv(header: string[], rows: CsvCell[][]): string {
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** An amount in pounds with its pence, e.g. 2.50 or -10.00. */
export function poundsCell(pence: number): CsvCell {
  return { pence };
}

export function csvResponse(fileName: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}

function cell(value: CsvCell): string {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') return (value.pence / 100).toFixed(2);
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
