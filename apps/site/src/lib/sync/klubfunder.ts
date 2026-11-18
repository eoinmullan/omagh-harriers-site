import Papa from 'papaparse';
import type {
  MemberRow,
  MemberStatus,
  MemberUpdate,
  PrincipalRow,
} from '@omagh/supabase';
import type { SupabaseAdminClient } from '../supabase/admin';

// =============================================================================
// Types
// =============================================================================

export interface KlubfunderRow {
  klubfunderMemberId: string | null;
  firstName: string;
  surname: string;
  dateOfBirth: string; // ISO date YYYY-MM-DD
  gender: string | null;
  athleticAssociationNumber: string | null;
  parentOrGuardianFullName: string | null;
  email: string; // lowercased + trimmed
  status: MemberStatus;
  rowNumber: number; // 1-based, including header
}

export interface ExistingState {
  principals: PrincipalRow[];
  members: MemberRow[];
}

export interface PrincipalAddAction {
  email: string;
  displayName: string;
}

export interface PrincipalReactivateAction {
  id: string;
  authUserId: string | null;
  email: string;
  displayName: string;
}

export interface PrincipalUpdateAction {
  id: string;
  email: string;
  displayName: string;
}

export interface PrincipalLapseAction {
  id: string;
  authUserId: string | null;
  email: string;
}

export interface MemberChanges {
  firstName?: string;
  surname?: string;
  dateOfBirth?: string;
  gender?: string | null;
  athleticAssociationNumber?: string | null;
  status?: MemberStatus;
  klubfunderMemberId?: string;
}

export interface MemberAddAction {
  label: string;
  klubfunderMemberId: string | null;
  principalEmail: string;
  firstName: string;
  surname: string;
  dateOfBirth: string;
  gender: string | null;
  athleticAssociationNumber: string | null;
  status: MemberStatus;
}

export interface MemberMoveAction {
  id: string;
  label: string;
  newPrincipalEmail: string;
  oldPrincipalEmail: string;
}

export interface MemberReactivateAction {
  id: string;
  label: string;
  changes: MemberChanges;
}

export interface MemberUpdateAction {
  id: string;
  label: string;
  changes: MemberChanges;
}

export interface MemberLapseAction {
  id: string;
  label: string;
}

export interface SyncPlan {
  principals: {
    add: PrincipalAddAction[];
    reactivate: PrincipalReactivateAction[];
    update: PrincipalUpdateAction[];
    lapse: PrincipalLapseAction[];
  };
  members: {
    add: MemberAddAction[];
    move: MemberMoveAction[];
    reactivate: MemberReactivateAction[];
    update: MemberUpdateAction[];
    lapse: MemberLapseAction[];
  };
  warnings: string[];
}

export interface ApplyError {
  action: string;
  detail: string;
  error: string;
}

export interface ApplyResult {
  principals: {
    added: number;
    reactivated: number;
    updated: number;
    lapsed: number;
  };
  members: {
    added: number;
    moved: number;
    reactivated: number;
    updated: number;
    lapsed: number;
  };
  errors: ApplyError[];
}

export class KlubfunderParseError extends Error {}

// =============================================================================
// Parsing
// =============================================================================

interface RawCsvRow {
  MemberId?: string;
  'First Name'?: string;
  Surname?: string;
  'Date of Birth'?: string;
  'Select gender'?: string;
  'Athletic Association Number'?: string;
  'Parent or Guardian Full Name'?: string;
  'Parent or Guardian Email'?: string;
  Status?: string;
}

const KLUBFUNDER_ID_COLUMN = 'MemberId';

const REQUIRED_COLUMNS = [
  'First Name',
  'Surname',
  'Date of Birth',
  'Parent or Guardian Email',
  'Status',
];

export interface ParseResult {
  rows: KlubfunderRow[];
  warnings: string[];
}

export function parseKlubfunderCSV(csv: string): ParseResult {
  const result = Papa.parse<RawCsvRow>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (result.errors.length > 0) {
    throw new KlubfunderParseError(
      `CSV parse failed: ${result.errors.map((e) => e.message).join('; ')}`,
    );
  }

  const headers = result.meta.fields ?? [];
  const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  if (missing.length > 0) {
    throw new KlubfunderParseError(
      `CSV is missing required columns: ${missing.join(', ')}`,
    );
  }

  const rows: KlubfunderRow[] = [];
  const warnings: string[] = [];

  if (!headers.includes(KLUBFUNDER_ID_COLUMN)) {
    warnings.push(
      `No ${KLUBFUNDER_ID_COLUMN} column: members will be matched on name and date of birth, ` +
        'so an edited name or a corrected date of birth will read as a departure and a new arrival.',
    );
  }

  result.data.forEach((raw, index) => {
    const rowNumber = index + 2; // +1 for 0-based, +1 for header

    const firstName = (raw['First Name'] ?? '').trim();
    const surname = (raw.Surname ?? '').trim();
    const dateOfBirth = normaliseDate((raw['Date of Birth'] ?? '').trim());
    const email = (raw['Parent or Guardian Email'] ?? '').trim().toLowerCase();
    const statusRaw = (raw.Status ?? '').trim().toLowerCase();
    const label = firstName && surname ? `${firstName} ${surname}` : '<unnamed>';

    if (!firstName || !surname) {
      warnings.push(`Row ${rowNumber}: missing name; skipping`);
      return;
    }
    if (!dateOfBirth) {
      warnings.push(
        `Row ${rowNumber} (${label}): missing or unparseable date of birth; skipping`,
      );
      return;
    }
    if (!email) {
      warnings.push(`Row ${rowNumber} (${label}): missing email; skipping`);
      return;
    }

    let status: MemberStatus;
    if (statusRaw === 'paid') {
      status = 'paid';
    } else if (statusRaw === 'lapsed') {
      status = 'lapsed';
    } else {
      warnings.push(
        `Row ${rowNumber} (${label}): unknown status "${raw.Status}", treating as 'paid'`,
      );
      status = 'paid';
    }

    rows.push({
      klubfunderMemberId: nullIfEmpty((raw[KLUBFUNDER_ID_COLUMN] ?? '').trim()),
      firstName,
      surname,
      dateOfBirth,
      gender: nullIfEmpty((raw['Select gender'] ?? '').trim()),
      athleticAssociationNumber: nullIfEmpty(
        (raw['Athletic Association Number'] ?? '').trim(),
      ),
      parentOrGuardianFullName: nullIfEmpty(
        (raw['Parent or Guardian Full Name'] ?? '').trim(),
      ),
      email,
      status,
      rowNumber,
    });
  });

  return { rows, warnings };
}

function nullIfEmpty(s: string): string | null {
  return s === '' ? null : s;
}

function normaliseDate(s: string): string {
  // Klubfunder uses YYYY-MM-DD but sometimes has single-digit month/day,
  // e.g. '2010-3-04' or '1979-7-19'. Normalise to zero-padded ISO.
  const match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return '';
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// =============================================================================
// Display name + natural key helpers
// =============================================================================

function memberNaturalKey(
  firstName: string,
  surname: string,
  dob: string,
): string {
  return `${firstName.toLowerCase().trim()}|${surname.toLowerCase().trim()}|${dob}`;
}

function memberNaturalKeyFromRow(m: {
  first_name: string;
  surname: string;
  date_of_birth: string;
}): string {
  return memberNaturalKey(m.first_name, m.surname, m.date_of_birth);
}

// An id match is definitive. Falling back to the natural key is only safe for a
// member who has no id yet — one that already carries a different id is someone
// else who happens to share a name and date of birth.
function matchExistingMember(
  row: KlubfunderRow,
  naturalKey: string,
  byKlubfunderId: Map<string, MemberRow>,
  byNaturalKey: Map<string, MemberRow>,
): MemberRow | undefined {
  const matchedById = row.klubfunderMemberId
    ? byKlubfunderId.get(row.klubfunderMemberId)
    : undefined;
  if (matchedById) return matchedById;

  const matchedByKey = byNaturalKey.get(naturalKey);
  return matchedByKey && !matchedByKey.klubfunder_member_id
    ? matchedByKey
    : undefined;
}

function memberChanges(existing: MemberRow, row: KlubfunderRow): MemberChanges {
  const changes: MemberChanges = {};
  if (existing.first_name !== row.firstName) changes.firstName = row.firstName;
  if (existing.surname !== row.surname) changes.surname = row.surname;
  if (existing.date_of_birth !== row.dateOfBirth) {
    changes.dateOfBirth = row.dateOfBirth;
  }
  if (existing.gender !== row.gender) changes.gender = row.gender;
  if (existing.athletic_association_number !== row.athleticAssociationNumber) {
    changes.athleticAssociationNumber = row.athleticAssociationNumber;
  }
  if (existing.status !== row.status) changes.status = row.status;
  if (
    row.klubfunderMemberId &&
    existing.klubfunder_member_id !== row.klubfunderMemberId
  ) {
    changes.klubfunderMemberId = row.klubfunderMemberId;
  }
  return changes;
}

function memberUpdateFromChanges(changes: MemberChanges): MemberUpdate {
  const updates: MemberUpdate = {};
  if ('firstName' in changes) updates.first_name = changes.firstName;
  if ('surname' in changes) updates.surname = changes.surname;
  if ('dateOfBirth' in changes) updates.date_of_birth = changes.dateOfBirth;
  if ('gender' in changes) updates.gender = changes.gender;
  if ('athleticAssociationNumber' in changes) {
    updates.athletic_association_number = changes.athleticAssociationNumber;
  }
  if ('status' in changes) updates.status = changes.status;
  if ('klubfunderMemberId' in changes) {
    updates.klubfunder_member_id = changes.klubfunderMemberId;
  }
  return updates;
}

export function deriveDisplayName(rowsForEmail: KlubfunderRow[]): string {
  const counts = new Map<string, number>();
  for (const r of rowsForEmail) {
    if (r.parentOrGuardianFullName) {
      counts.set(
        r.parentOrGuardianFullName,
        (counts.get(r.parentOrGuardianFullName) ?? 0) + 1,
      );
    }
  }
  if (counts.size > 0) {
    const [first] = [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    return first[0];
  }
  const oldest = [...rowsForEmail].sort(
    (a, b) => a.dateOfBirth.localeCompare(b.dateOfBirth),
  )[0];
  return `${oldest.firstName} ${oldest.surname}`;
}

// =============================================================================
// Plan computation
// =============================================================================

export function computePlan(
  rows: KlubfunderRow[],
  existing: ExistingState,
): SyncPlan {
  const warnings: string[] = [];
  const plan: SyncPlan = {
    principals: { add: [], reactivate: [], update: [], lapse: [] },
    members: { add: [], move: [], reactivate: [], update: [], lapse: [] },
    warnings,
  };

  // Group rows by email (one principal per unique email).
  const rowsByEmail = new Map<string, KlubfunderRow[]>();
  for (const r of rows) {
    const arr = rowsByEmail.get(r.email);
    if (arr) arr.push(r);
    else rowsByEmail.set(r.email, [r]);
  }

  // Index existing principals.
  const principalsByEmail = new Map<string, PrincipalRow>();
  const principalsById = new Map<string, PrincipalRow>();
  for (const p of existing.principals) {
    principalsByEmail.set(p.email.toLowerCase(), p);
    principalsById.set(p.id, p);
  }

  // === Principal actions ===
  for (const [email, rowsForEmail] of rowsByEmail) {
    const displayName = deriveDisplayName(rowsForEmail);
    const existingP = principalsByEmail.get(email);

    if (!existingP) {
      plan.principals.add.push({ email, displayName });
      continue;
    }

    if (existingP.source === 'manual') {
      // Don't touch manually-added principals.
      continue;
    }

    if (!existingP.is_active) {
      plan.principals.reactivate.push({
        id: existingP.id,
        authUserId: existingP.auth_user_id,
        email,
        displayName,
      });
      continue;
    }

    if (existingP.display_name !== displayName) {
      plan.principals.update.push({
        id: existingP.id,
        email,
        displayName,
      });
    }
  }

  // The Klubfunder id is the identity. The natural key only has to carry
  // members who were registered before the export included an id.
  const membersByKlubfunderId = new Map<string, MemberRow>();
  const membersByKey = new Map<string, MemberRow>();
  for (const m of existing.members) {
    if (m.klubfunder_member_id) {
      membersByKlubfunderId.set(m.klubfunder_member_id, m);
    }
    membersByKey.set(memberNaturalKeyFromRow(m), m);
  }

  // === Member actions ===
  const matchedMemberIds = new Set<string>();
  const seenKlubfunderIds = new Set<string>();
  const seenKeys = new Set<string>();

  for (const row of rows) {
    const label = `${row.firstName} ${row.surname}`;
    const key = memberNaturalKey(row.firstName, row.surname, row.dateOfBirth);

    const isDuplicate = row.klubfunderMemberId
      ? seenKlubfunderIds.has(row.klubfunderMemberId)
      : seenKeys.has(key);
    if (isDuplicate) {
      warnings.push(
        `Row ${row.rowNumber} (${label}): duplicate of an earlier row; skipping`,
      );
      continue;
    }
    if (row.klubfunderMemberId) seenKlubfunderIds.add(row.klubfunderMemberId);
    seenKeys.add(key);

    const existingM = matchExistingMember(row, key, membersByKlubfunderId, membersByKey);

    if (!existingM) {
      plan.members.add.push({
        label,
        klubfunderMemberId: row.klubfunderMemberId,
        principalEmail: row.email,
        firstName: row.firstName,
        surname: row.surname,
        dateOfBirth: row.dateOfBirth,
        gender: row.gender,
        athleticAssociationNumber: row.athleticAssociationNumber,
        status: row.status,
      });
      continue;
    }

    if (existingM.source === 'manual') {
      // Don't touch manually-added members.
      continue;
    }

    matchedMemberIds.add(existingM.id);

    const existingPrincipal = principalsById.get(existingM.principal_id);
    const oldPrincipalEmail =
      existingPrincipal?.email.toLowerCase() ?? '<unknown>';

    if (oldPrincipalEmail !== row.email) {
      plan.members.move.push({
        id: existingM.id,
        label,
        newPrincipalEmail: row.email,
        oldPrincipalEmail,
      });
    }

    const changes = memberChanges(existingM, row);

    if (!existingM.is_active) {
      plan.members.reactivate.push({ id: existingM.id, label, changes });
      continue;
    }

    if (Object.keys(changes).length > 0) {
      plan.members.update.push({ id: existingM.id, label, changes });
    }
  }

  // Members to lapse: klubfunder-sourced, currently active, unmatched by the CSV.
  for (const m of existing.members) {
    if (m.source !== 'klubfunder') continue;
    if (!m.is_active) continue;
    if (matchedMemberIds.has(m.id)) continue;
    plan.members.lapse.push({
      id: m.id,
      label: `${m.first_name} ${m.surname}`,
    });
  }

  // Principals to lapse: klubfunder-sourced, currently active, email not in CSV.
  // ("No remaining active members" is implied — if email isn't in the CSV,
  // none of its members are referenced under that email anymore.)
  for (const p of existing.principals) {
    if (p.source !== 'klubfunder') continue;
    if (!p.is_active) continue;
    if (rowsByEmail.has(p.email.toLowerCase())) continue;
    plan.principals.lapse.push({
      id: p.id,
      authUserId: p.auth_user_id,
      email: p.email,
    });
  }

  return plan;
}

// =============================================================================
// Plan description (for CLI output and future UI)
// =============================================================================

function describeChanges(changes: MemberChanges): string {
  const bits = Object.entries(changes).map(
    ([field, value]) => `${field}=${JSON.stringify(value)}`,
  );
  return bits.length > 0 ? ` (${bits.join(', ')})` : '';
}

export function describePlan(plan: SyncPlan): string {
  const lines: string[] = [];
  lines.push('=== Klubfunder Sync Plan ===');
  lines.push('');

  const { principals, members, warnings } = plan;

  lines.push(`Principals:`);
  lines.push(`  Add        (${principals.add.length})`);
  for (const a of principals.add) {
    lines.push(`    + ${a.email} — ${a.displayName}`);
  }
  lines.push(`  Reactivate (${principals.reactivate.length})`);
  for (const a of principals.reactivate) {
    lines.push(`    ↻ ${a.email} — ${a.displayName}`);
  }
  lines.push(`  Update     (${principals.update.length})`);
  for (const a of principals.update) {
    lines.push(`    ✎ ${a.email} — ${a.displayName}`);
  }
  lines.push(`  Lapse      (${principals.lapse.length})`);
  for (const a of principals.lapse) {
    lines.push(`    - ${a.email}`);
  }

  lines.push('');
  lines.push(`Members:`);
  lines.push(`  Add        (${members.add.length})`);
  for (const a of members.add) {
    lines.push(
      `    + ${a.firstName} ${a.surname} (DOB ${a.dateOfBirth}) → ${a.principalEmail}`,
    );
  }
  lines.push(`  Move       (${members.move.length})`);
  for (const a of members.move) {
    lines.push(`    → ${a.label} (${a.oldPrincipalEmail} → ${a.newPrincipalEmail})`);
  }
  lines.push(`  Reactivate (${members.reactivate.length})`);
  for (const a of members.reactivate) {
    lines.push(`    ↻ ${a.label}${describeChanges(a.changes)}`);
  }
  lines.push(`  Update     (${members.update.length})`);
  for (const a of members.update) {
    lines.push(`    ✎ ${a.label}${describeChanges(a.changes)}`);
  }
  lines.push(`  Lapse      (${members.lapse.length})`);
  for (const a of members.lapse) {
    lines.push(`    - ${a.label}`);
  }

  if (warnings.length > 0) {
    lines.push('');
    lines.push(`Warnings (${warnings.length}):`);
    for (const w of warnings) {
      lines.push(`  ! ${w}`);
    }
  }

  return lines.join('\n');
}

export function planIsEmpty(plan: SyncPlan): boolean {
  return (
    plan.principals.add.length === 0 &&
    plan.principals.reactivate.length === 0 &&
    plan.principals.update.length === 0 &&
    plan.principals.lapse.length === 0 &&
    plan.members.add.length === 0 &&
    plan.members.move.length === 0 &&
    plan.members.reactivate.length === 0 &&
    plan.members.update.length === 0 &&
    plan.members.lapse.length === 0
  );
}

// =============================================================================
// Apply
// =============================================================================

const BAN_DURATION_LAPSED = '876000h'; // ~100 years

export async function loadExistingState(
  supabase: SupabaseAdminClient,
): Promise<ExistingState> {
  const [{ data: principals, error: pErr }, { data: members, error: mErr }] =
    await Promise.all([
      supabase.from('principals').select('*'),
      supabase.from('members').select('*'),
    ]);
  if (pErr) throw new Error(`Failed to load principals: ${pErr.message}`);
  if (mErr) throw new Error(`Failed to load members: ${mErr.message}`);
  return {
    principals: principals ?? [],
    members: members ?? [],
  };
}

export async function applyPlan(
  plan: SyncPlan,
  supabase: SupabaseAdminClient,
): Promise<ApplyResult> {
  const result: ApplyResult = {
    principals: { added: 0, reactivated: 0, updated: 0, lapsed: 0 },
    members: { added: 0, moved: 0, reactivated: 0, updated: 0, lapsed: 0 },
    errors: [],
  };

  const now = new Date().toISOString();

  // Track principal email → id for resolving member FKs.
  const principalIdByEmail = new Map<string, string>();

  // Seed with all existing principals (in case we need to look them up later).
  // Cheaper to load only the ones we need; but the count is tiny so we just
  // refetch the email→id map after we've applied principal actions.

  // === Principal: add ===
  for (const action of plan.principals.add) {
    try {
      const { data: created, error: authErr } =
        await supabase.auth.admin.createUser({
          email: action.email,
          email_confirm: true,
        });
      if (authErr || !created.user) {
        throw new Error(authErr?.message ?? 'auth.admin.createUser returned no user');
      }
      const { data: inserted, error: insertErr } = await supabase
        .from('principals')
        .insert({
          email: action.email,
          auth_user_id: created.user.id,
          display_name: action.displayName,
          source: 'klubfunder',
          last_seen_in_klubfunder_at: now,
        })
        .select('id')
        .single();
      if (insertErr || !inserted) {
        throw new Error(
          insertErr?.message ?? 'principals insert returned no row',
        );
      }
      principalIdByEmail.set(action.email, inserted.id);
      result.principals.added++;
    } catch (e) {
      result.errors.push({
        action: 'principal.add',
        detail: action.email,
        error: errorMessage(e),
      });
    }
  }

  // === Principal: reactivate ===
  for (const action of plan.principals.reactivate) {
    try {
      if (action.authUserId) {
        const { error: authErr } = await supabase.auth.admin.updateUserById(
          action.authUserId,
          { ban_duration: 'none' },
        );
        if (authErr) throw new Error(authErr.message);
      }
      const { error: updateErr } = await supabase
        .from('principals')
        .update({
          is_active: true,
          display_name: action.displayName,
          last_seen_in_klubfunder_at: now,
        })
        .eq('id', action.id);
      if (updateErr) throw new Error(updateErr.message);
      principalIdByEmail.set(action.email, action.id);
      result.principals.reactivated++;
    } catch (e) {
      result.errors.push({
        action: 'principal.reactivate',
        detail: action.email,
        error: errorMessage(e),
      });
    }
  }

  // === Principal: update ===
  for (const action of plan.principals.update) {
    try {
      const { error: updateErr } = await supabase
        .from('principals')
        .update({
          display_name: action.displayName,
          last_seen_in_klubfunder_at: now,
        })
        .eq('id', action.id);
      if (updateErr) throw new Error(updateErr.message);
      principalIdByEmail.set(action.email, action.id);
      result.principals.updated++;
    } catch (e) {
      result.errors.push({
        action: 'principal.update',
        detail: action.email,
        error: errorMessage(e),
      });
    }
  }

  // Refresh principal email → id map for any remaining principals that
  // weren't touched but are referenced by member actions (existing-active,
  // unchanged principal that still has new/moved/reactivated members).
  {
    const { data: allPrincipals, error } = await supabase
      .from('principals')
      .select('id, email');
    if (error) {
      throw new Error(`Failed to refresh principal map: ${error.message}`);
    }
    for (const p of allPrincipals ?? []) {
      principalIdByEmail.set(p.email.toLowerCase(), p.id);
    }
  }

  const resolvePrincipalId = (email: string, action: string, detail: string): string | null => {
    const id = principalIdByEmail.get(email.toLowerCase());
    if (!id) {
      result.errors.push({
        action,
        detail,
        error: `Could not resolve principal_id for email ${email}`,
      });
      return null;
    }
    return id;
  };

  // === Refresh last_seen_in_klubfunder_at for principals that were already
  // present and unchanged. Their email is in the CSV but no add/reactivate/
  // update action ran for them. Bulk update by email in one query.
  {
    const touchedEmails = new Set<string>([
      ...plan.principals.add.map((a) => a.email),
      ...plan.principals.reactivate.map((a) => a.email),
      ...plan.principals.update.map((a) => a.email),
    ]);
    const csvEmails = [...principalIdByEmail.keys()];
    const untouched = csvEmails.filter((e) => !touchedEmails.has(e));
    if (untouched.length > 0) {
      const { error } = await supabase
        .from('principals')
        .update({ last_seen_in_klubfunder_at: now })
        .in('email', untouched);
      if (error) {
        result.errors.push({
          action: 'principal.touch',
          detail: `${untouched.length} rows`,
          error: error.message,
        });
      }
    }
  }

  // === Member: add ===
  for (const action of plan.members.add) {
    const principalId = resolvePrincipalId(
      action.principalEmail,
      'member.add',
      `${action.firstName} ${action.surname}`,
    );
    if (!principalId) continue;
    try {
      const { error: insertErr } = await supabase.from('members').insert({
        principal_id: principalId,
        klubfunder_member_id: action.klubfunderMemberId,
        first_name: action.firstName,
        surname: action.surname,
        date_of_birth: action.dateOfBirth,
        gender: action.gender,
        athletic_association_number: action.athleticAssociationNumber,
        status: action.status,
        source: 'klubfunder',
        last_seen_in_klubfunder_at: now,
      });
      if (insertErr) throw new Error(insertErr.message);
      result.members.added++;
    } catch (e) {
      result.errors.push({
        action: 'member.add',
        detail: `${action.firstName} ${action.surname}`,
        error: errorMessage(e),
      });
    }
  }

  // === Member: move ===
  for (const action of plan.members.move) {
    const principalId = resolvePrincipalId(
      action.newPrincipalEmail,
      'member.move',
      action.label,
    );
    if (!principalId) continue;
    try {
      const { error } = await supabase
        .from('members')
        .update({
          principal_id: principalId,
          last_seen_in_klubfunder_at: now,
        })
        .eq('id', action.id);
      if (error) throw new Error(error.message);
      result.members.moved++;
    } catch (e) {
      result.errors.push({
        action: 'member.move',
        detail: action.label,
        error: errorMessage(e),
      });
    }
  }

  // === Member: reactivate ===
  for (const action of plan.members.reactivate) {
    try {
      const { error } = await supabase
        .from('members')
        .update({
          ...memberUpdateFromChanges(action.changes),
          is_active: true,
          last_seen_in_klubfunder_at: now,
        })
        .eq('id', action.id);
      if (error) throw new Error(error.message);
      result.members.reactivated++;
    } catch (e) {
      result.errors.push({
        action: 'member.reactivate',
        detail: action.label,
        error: errorMessage(e),
      });
    }
  }

  // === Member: update ===
  for (const action of plan.members.update) {
    try {
      const { error } = await supabase
        .from('members')
        .update({
          ...memberUpdateFromChanges(action.changes),
          last_seen_in_klubfunder_at: now,
        })
        .eq('id', action.id);
      if (error) throw new Error(error.message);
      result.members.updated++;
    } catch (e) {
      result.errors.push({
        action: 'member.update',
        detail: action.label,
        error: errorMessage(e),
      });
    }
  }

  // === Member: lapse ===
  for (const action of plan.members.lapse) {
    try {
      const { error } = await supabase
        .from('members')
        .update({
          is_active: false,
          status: 'lapsed',
        })
        .eq('id', action.id);
      if (error) throw new Error(error.message);
      result.members.lapsed++;
    } catch (e) {
      result.errors.push({
        action: 'member.lapse',
        detail: action.label,
        error: errorMessage(e),
      });
    }
  }

  // === Principal: lapse (last, after their members are dealt with) ===
  for (const action of plan.principals.lapse) {
    try {
      if (action.authUserId) {
        const { error: authErr } = await supabase.auth.admin.updateUserById(
          action.authUserId,
          { ban_duration: BAN_DURATION_LAPSED },
        );
        if (authErr) throw new Error(authErr.message);
      }
      const { error } = await supabase
        .from('principals')
        .update({ is_active: false })
        .eq('id', action.id);
      if (error) throw new Error(error.message);
      result.principals.lapsed++;
    } catch (e) {
      result.errors.push({
        action: 'principal.lapse',
        detail: action.email,
        error: errorMessage(e),
      });
    }
  }

  return result;
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export function describeApplyResult(result: ApplyResult): string {
  const lines: string[] = [];
  lines.push('=== Apply Result ===');
  lines.push('');
  lines.push(
    `Principals: +${result.principals.added} ↻${result.principals.reactivated} ✎${result.principals.updated} -${result.principals.lapsed}`,
  );
  lines.push(
    `Members:    +${result.members.added} →${result.members.moved} ↻${result.members.reactivated} ✎${result.members.updated} -${result.members.lapsed}`,
  );
  if (result.errors.length > 0) {
    lines.push('');
    lines.push(`Errors (${result.errors.length}):`);
    for (const err of result.errors) {
      lines.push(`  ! ${err.action} (${err.detail}): ${err.error}`);
    }
  }
  return lines.join('\n');
}
