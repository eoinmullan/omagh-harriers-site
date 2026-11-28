import { describe, expect, it } from 'vitest';
import type { MemberRow } from '../supabase/types';
import type { KlubfunderRow } from './klubfunder';
import { describeAppliedEmergencyContacts, describeEmergencyContactPlan, planEmergencyContacts } from './emergency-contacts';

function row(overrides: Partial<KlubfunderRow> = {}): KlubfunderRow {
  return {
    klubfunderMemberId: '90001',
    firstName: 'Hannah',
    surname: 'McCullagh',
    dateOfBirth: '2013-12-07',
    gender: 'Female',
    athleticAssociationNumber: null,
    parentOrGuardianFullName: 'Roisin McCullagh',
    parentOrGuardianPhone: '07700 900123',
    email: 'rmccullagh@hotmail.com',
    status: 'paid',
    rowNumber: 2,
    ...overrides,
  };
}

function member(overrides: Partial<MemberRow> = {}): MemberRow {
  return {
    id: 'm-1',
    principal_id: 'p-1',
    klubfunder_member_id: '90001',
    first_name: 'Hannah',
    surname: 'McCullagh',
    date_of_birth: '2013-12-07',
    gender: 'Female',
    athletic_association_number: null,
    status: 'paid',
    is_active: true,
    source: 'klubfunder',
    last_seen_in_klubfunder_at: null,
    trains_free: false,
    trains_free_reason: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('planEmergencyContacts', () => {
  it('sets a contact for a member who has none yet', () => {
    const plan = planEmergencyContacts([row()], [member()], []);

    expect(plan).toEqual({
      set: [{ member_id: 'm-1', contact_name: 'Roisin McCullagh', contact_phone: '07700 900123' }],
      clear: [],
    });
  });

  it('leaves a contact that already matches the export alone', () => {
    const stored = [{ member_id: 'm-1', contact_name: 'Roisin McCullagh', contact_phone: '07700 900123' }];

    const plan = planEmergencyContacts([row()], [member()], stored);

    expect(plan).toEqual({ set: [], clear: [] });
  });

  it('updates a contact whose number has changed', () => {
    const stored = [{ member_id: 'm-1', contact_name: 'Roisin McCullagh', contact_phone: '07700 900000' }];

    const plan = planEmergencyContacts([row()], [member()], stored);

    expect(plan.set).toEqual([{ member_id: 'm-1', contact_name: 'Roisin McCullagh', contact_phone: '07700 900123' }]);
  });

  it('keeps a number given without a name', () => {
    const plan = planEmergencyContacts([row({ parentOrGuardianFullName: null })], [member()], []);

    expect(plan.set).toEqual([{ member_id: 'm-1', contact_name: null, contact_phone: '07700 900123' }]);
  });

  it('removes a contact the export no longer gives a number for', () => {
    const stored = [{ member_id: 'm-1', contact_name: 'Roisin McCullagh', contact_phone: '07700 900123' }];

    const plan = planEmergencyContacts([row({ parentOrGuardianPhone: null })], [member()], stored);

    expect(plan).toEqual({ set: [], clear: ['m-1'] });
  });

  it('keeps the contact of a member missing from the export', () => {
    const stored = [{ member_id: 'm-1', contact_name: 'Roisin McCullagh', contact_phone: '07700 900123' }];

    const plan = planEmergencyContacts([], [member()], stored);

    expect(plan).toEqual({ set: [], clear: [] });
  });

  it('matches a member by name and date of birth when they have no Klubfunder id yet', () => {
    const plan = planEmergencyContacts([row()], [member({ klubfunder_member_id: null })], []);

    expect(plan.set.map((contact) => contact.member_id)).toEqual(['m-1']);
  });

  it('skips a row that matches no member', () => {
    const plan = planEmergencyContacts([row({ klubfunderMemberId: '99999', firstName: 'Someone' })], [member()], []);

    expect(plan).toEqual({ set: [], clear: [] });
  });
});

describe('describeEmergencyContactPlan', () => {
  it('says when there is nothing to do', () => {
    expect(describeEmergencyContactPlan({ set: [], clear: [] })).toBe('Emergency contacts: no changes.');
  });

  it('counts what changes', () => {
    const plan = { set: [{ member_id: 'm-1', contact_phone: '1' }], clear: ['m-2', 'm-3'] };

    expect(describeEmergencyContactPlan(plan)).toBe('Emergency contacts: 1 to add or update, 2 to remove.');
  });
});

describe('describeAppliedEmergencyContacts', () => {
  it('says what was done', () => {
    const plan = { set: [{ member_id: 'm-1', contact_phone: '1' }], clear: ['m-2'] };

    expect(describeAppliedEmergencyContacts(plan)).toBe('Emergency contacts: 1 added or updated, 1 removed.');
  });
});
