// Names are keyed in by hand at both ends. Klubfunder's spelling came from a
// membership form; the search term comes from somebody standing at a track in
// the dark. Neither should have to guess how the other was written, so both
// sides are flattened the same way before they are compared.
//
// Used by the admin screens now and by the registrar app later, which is why
// it lives here rather than inside a page.

export interface SearchableName {
  firstName: string;
  surname: string;
}

/**
 * "O'Kane", "O Kane" and "okane" all come out as `okane`, and "Siobhán" as
 * `siobhan`. The accents go the same way as the apostrophes and for the same
 * reason: a Klubfunder form may carry them and a phone keyboard at a track
 * will not.
 */
export function normaliseForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[\s'’-]/g, '');
}

/**
 * Forgiving on purpose: a club of a few hundred can afford it. A term matches
 * when it is found in the name written either way round ("John Okane" or
 * "Okane John"), or when every word of it is found somewhere in one name or
 * the other, in any order ("kane jo"). Matching is anywhere in a name, not only
 * at the start: somebody who knows a runner as Kane should not have to
 * remember the O. An empty term matches everyone, so a cleared search box
 * shows the list again.
 */
export function matchesName(name: SearchableName, term: string): boolean {
  const needle = normaliseForSearch(term);
  if (!needle) return true;

  const first = normaliseForSearch(name.firstName);
  const surname = normaliseForSearch(name.surname);
  if (`${first}${surname}`.includes(needle) || `${surname}${first}`.includes(needle)) return true;

  const words = term.split(/\s+/).map(normaliseForSearch).filter(Boolean);
  return words.every((word) => first.includes(word) || surname.includes(word));
}
