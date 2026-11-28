import type { EmergencyContactInsert, MemberRow } from '../supabase/types';
import type { SupabaseAdminClient } from '../supabase/admin';
import { memberFinder, type KlubfunderRow } from './klubfunder';

// Each member's emergency contact, from the export's parent or guardian name
// and number, until the safeguarding form decides what else belongs there
// (Phase 8). Run after the main plan has been applied, so a member added by it
// has an id to hang a contact on.
//
// A member missing from the export keeps the contact they had: how long a
// lapsed member's details are kept is Phase 8's retention question, not the
// sync's to answer by deleting them.

export interface StoredContact {
  member_id: string;
  contact_name: string | null;
  contact_phone: string;
}

export interface EmergencyContactPlan {
  set: EmergencyContactInsert[];
  /** Members whose export row no longer gives a number. */
  clear: string[];
}

export function planEmergencyContacts(
  rows: KlubfunderRow[],
  members: MemberRow[],
  stored: StoredContact[],
): EmergencyContactPlan {
  const find = memberFinder(members);
  const storedByMember = new Map(stored.map((contact) => [contact.member_id, contact]));
  const plan: EmergencyContactPlan = { set: [], clear: [] };

  for (const row of rows) {
    const member = find(row);
    if (!member) continue;
    const current = storedByMember.get(member.id);

    if (!row.parentOrGuardianPhone) {
      if (current) plan.clear.push(member.id);
      continue;
    }

    const wanted = { contact_name: row.parentOrGuardianFullName, contact_phone: row.parentOrGuardianPhone };
    if (current?.contact_name === wanted.contact_name && current.contact_phone === wanted.contact_phone) continue;
    plan.set.push({ member_id: member.id, ...wanted });
  }

  return plan;
}

export function describeEmergencyContactPlan(plan: EmergencyContactPlan): string {
  if (plan.set.length === 0 && plan.clear.length === 0) return 'Emergency contacts: no changes.';
  return `Emergency contacts: ${plan.set.length} to add or update, ${plan.clear.length} to remove.`;
}

export function describeAppliedEmergencyContacts(plan: EmergencyContactPlan): string {
  if (plan.set.length === 0 && plan.clear.length === 0) return 'Emergency contacts: no changes.';
  return `Emergency contacts: ${plan.set.length} added or updated, ${plan.clear.length} removed.`;
}

export async function loadStoredContacts(supabase: SupabaseAdminClient): Promise<StoredContact[]> {
  const { data, error } = await supabase.from('emergency_contacts').select('member_id, contact_name, contact_phone');
  if (error) throw new Error(`Failed to load emergency contacts: ${error.message}`);
  return data ?? [];
}

export async function applyEmergencyContactPlan(
  plan: EmergencyContactPlan,
  supabase: SupabaseAdminClient,
): Promise<string[]> {
  const errors: string[] = [];
  if (plan.set.length > 0) {
    const { error } = await supabase.from('emergency_contacts').upsert(plan.set, { onConflict: 'member_id' });
    if (error) errors.push(`Setting emergency contacts failed: ${error.message}`);
  }
  if (plan.clear.length > 0) {
    const { error } = await supabase.from('emergency_contacts').delete().in('member_id', plan.clear);
    if (error) errors.push(`Removing emergency contacts failed: ${error.message}`);
  }
  return errors;
}
