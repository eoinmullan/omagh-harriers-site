// Club vocabulary both apps have to agree on.
//
// `@omagh/training` is the domain language shared by the website and the
// sign-in app: how Omagh's clock reads, how money is written, and how a name
// typed in the dark is matched against one typed on a membership form.
//
// It exists because the alternative is two implementations, and these three are
// exactly the ones that cannot afford to disagree. A session an hour out, a
// price rounded differently, or a search that finds Siobhán on one screen and
// not the other are all bugs that only appear in front of a queue.
//
// What lives here is pure: no database, no framework, no environment. That is
// also the test for whether something belongs — the admin form rules in
// `apps/site/src/lib/` stay there because they answer questions only the admin
// screens ask.

export {
  clubDayKey,
  formatClubDate,
  formatClubDateTime,
  parseClubDateTime,
  toClubDateTimeInput,
} from './club-time';

export { formatBalance, formatPounds, parsePounds } from './money';

export { matchesName, normaliseForSearch, type SearchableName } from './names';
