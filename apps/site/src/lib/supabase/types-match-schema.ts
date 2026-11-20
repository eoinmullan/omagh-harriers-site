import type { Database as Generated } from './generated-types';
import type { Database as HandWritten } from './types';

// The hand-written database types, checked against the live schema at compile
// time. If they drift, `astro check` fails, and that runs in CI.
//
// The types are hand-written on purpose. They narrow text columns to the values
// their CHECKs allow (`PrincipalRole`, `CreditTransactionType`), and they know a
// view column is never null, which Postgres can't tell the generator. So they
// aren't replaced by generated ones. They're compared, on the two things that
// break queries:
//
//   - which tables, views and columns exist
//   - which columns can be null
//
// After a migration: run `pnpm supabase:types`, which writes
// generated-types.ts and never touches types.ts. If this file then fails to
// compile, update types.ts to match. Views are compared on columns only,
// because the generator marks every view column nullable.
//
// A mismatch shows as "Type 'true' is not assignable to type 'false'" on the
// table that drifted.

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type NullableColumns<Row> = { [K in keyof Row]-?: null extends Row[K] ? K : never }[keyof Row];

type GeneratedTables = Generated['public']['Tables'];
type HandTables = HandWritten['public']['Tables'];
type GeneratedViews = Generated['public']['Views'];
type HandViews = HandWritten['public']['Views'];

type Shared<A, B> = keyof A & keyof B;

type TableMatches = {
  [T in Shared<GeneratedTables, HandTables>]: Same<
    keyof GeneratedTables[T]['Row'],
    keyof HandTables[T]['Row']
  > extends true
    ? Same<NullableColumns<GeneratedTables[T]['Row']>, NullableColumns<HandTables[T]['Row']>>
    : false;
};

type ViewMatches = {
  [V in Shared<GeneratedViews, HandViews>]: Same<keyof GeneratedViews[V]['Row'], keyof HandViews[V]['Row']>;
};

export const sameTables: Same<keyof GeneratedTables, keyof HandTables> = true;
export const sameViews: Same<keyof GeneratedViews, keyof HandViews> = true;

export const tables: TableMatches = {
  attendance: true,
  attendance_aliases: true,
  credit_transactions: true,
  groups: true,
  guests: true,
  member_groups: true,
  members: true,
  principals: true,
  training_sessions: true,
};

export const views: ViewMatches = {
  principal_balances: true,
  squad_regulars: true,
};
