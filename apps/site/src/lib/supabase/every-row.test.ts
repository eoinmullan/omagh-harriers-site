import { describe, expect, it } from 'vitest';
import { everyRow } from './every-row';

function serverHolding(rows: number[], options: { cap?: number; failAt?: number } = {}) {
  const requests: [number, number][] = [];
  const fetchPage = async (from: number, to: number) => {
    requests.push([from, to]);
    if (options.failAt === from) return { data: null, error: { message: 'connection reset' } };
    const asked = to - from + 1;
    const served = Math.min(asked, options.cap ?? asked);
    return { data: rows.slice(from, from + served), error: null };
  };
  return { fetchPage, requests };
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('everyRow', () => {
  it('gathers every row across several pages', async () => {
    const server = serverHolding(range(2500));

    const rows = await everyRow(server.fetchPage, 1000);

    expect(rows).toEqual(range(2500));
  });

  it('keeps going when the server returns fewer rows than were asked for', async () => {
    const server = serverHolding(range(1200), { cap: 500 });

    const rows = await everyRow(server.fetchPage, 1000);

    expect(rows).toEqual(range(1200));
  });

  it('asks for the next page from where the last one actually ended', async () => {
    const server = serverHolding(range(1200), { cap: 500 });

    await everyRow(server.fetchPage, 1000);

    expect(server.requests.map(([from]) => from)).toEqual([0, 500, 1000, 1200]);
  });

  it('returns nothing for an empty table', async () => {
    const server = serverHolding([]);

    const rows = await everyRow(server.fetchPage, 1000);

    expect(rows).toEqual([]);
  });

  it('fails outright rather than returning part of the answer', async () => {
    const server = serverHolding(range(2500), { failAt: 1000 });

    await expect(everyRow(server.fetchPage, 1000)).rejects.toThrow('connection reset');
  });
});
