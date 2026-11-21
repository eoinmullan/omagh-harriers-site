import { describe, expect, it } from 'vitest';
import { poundsCell, toCsv } from './csv';

describe('toCsv', () => {
  it('writes a header and rows with Windows line endings, as spreadsheets expect', () => {
    expect(toCsv(['Squad', 'Sessions'], [['Endurance', 3]])).toBe('Squad,Sessions\r\nEndurance,3\r\n');
  });

  it('quotes a cell holding a comma, a quote or a line break', () => {
    expect(toCsv(['Note'], [['top car park, by the gate'], ['the "usual" spot']])).toBe(
      'Note\r\n"top car park, by the gate"\r\n"the ""usual"" spot"\r\n',
    );
  });

  it('stops a typed name from running as a spreadsheet formula', () => {
    expect(toCsv(['Name'], [['=HYPERLINK("x")']])).toBe('Name\r\n"\'=HYPERLINK(""x"")"\r\n');
  });

  it('also guards a formula hidden behind a leading tab or carriage return', () => {
    expect(toCsv(['Name'], [['\t=1+1'], ['\r=1+1']])).toBe('Name\r\n\'\t=1+1\r\n"\'\r=1+1"\r\n');
  });

  it('writes pounds with their pence and keeps a negative amount a number', () => {
    expect(toCsv(['Amount'], [[poundsCell(250)], [poundsCell(-1000)]])).toBe('Amount\r\n2.50\r\n-10.00\r\n');
  });

  it('leaves an empty cell empty', () => {
    expect(toCsv(['Recorded by'], [[null]])).toBe('Recorded by\r\n\r\n');
  });
});
