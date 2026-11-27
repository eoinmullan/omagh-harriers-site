// Which rows of an admin list stay visible: the search box and the filters
// narrow the list together. Kept out of the page script so the rule is tested.

export interface ListRow {
  /** Everything a search may match, already lower case. */
  search: string;
  /** What the row is, for the filters: `overdrawn`, `junior`, `role:registrar`. */
  tags: string[];
}

export interface ListFilters {
  term: string;
  /** Every filter that is on. A row has to carry all of them. */
  tags: string[];
}

export function isShown(row: ListRow, filters: ListFilters): boolean {
  const term = filters.term.trim().toLowerCase();
  const matchesTerm = term === '' || term.split(/\s+/).every((word) => row.search.includes(word));
  return matchesTerm && filters.tags.every((tag) => row.tags.includes(tag));
}

export function describeShown(shown: number, total: number): string {
  return shown === total ? '' : `${shown} of ${total} shown`;
}
