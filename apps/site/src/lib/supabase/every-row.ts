// Every row a query matches, not just the first page of them.
//
// PostgREST stops at its max-rows setting (1000 on hosted Supabase) and says
// nothing: a figure added up from a cut-off read is simply wrong. Any read
// whose size grows with the club's history goes through this.
//
// The next page starts where the last one actually ended rather than where it
// was asked to, so a server limit smaller than `pageSize` still gets every row.
// The cost is one extra, empty request at the end, which is how it knows it has
// everything.
//
// The caller must order by a unique column, `id` normally. Without a stable
// order, a row can move between pages while they are being read and be
// counted twice or not at all.
//
// A failed page throws instead of returning what came before it. Part of the
// rows looks exactly like all of them.

interface Page<Row> {
  data: Row[] | null;
  error: { message: string } | null;
}

export async function everyRow<Row>(
  fetchPage: (from: number, to: number) => PromiseLike<Page<Row>>,
  pageSize = 1000,
): Promise<Row[]> {
  const rows: Row[] = [];

  for (;;) {
    const { data, error } = await fetchPage(rows.length, rows.length + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return rows;
    rows.push(...data);
  }
}
