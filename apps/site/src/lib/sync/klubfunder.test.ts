import { describe, expect, it } from 'vitest';
import type { MemberRow, PrincipalRow } from '../supabase/types';
import {
  computePlan,
  deriveDisplayName,
  KlubfunderParseError,
  parseKlubfunderCSV,
  planIsEmpty,
  type ExistingState,
  type KlubfunderRow,
} from './klubfunder';

const HEADER =
  'First Name,Surname,Date of Birth,Select gender,First line of address,Town,Postcode,Athletic Association Number,Personal Best,Select Team,Parent or Guardian Full Name,Parent or Guardian Contact number,Parent or Guardian Email,List any Medical Conditions/Allergies that the club should be aware of.,"Photos consent","By ticking this box you are agreeing that you have read and agree to adhere to your clubs policies",Status';

const LEGACY_HEADER = HEADER;
const HEADER_WITH_ID = `MemberId,${HEADER}`;

// Rows are written without an id so each test reads as its own case; the real
// export carries one on every row, so csv() supplies a distinct one.
function csv(...lines: string[]): string {
  return [
    HEADER_WITH_ID,
    ...lines.map((line, index) => `${90000 + index},${line}`),
  ].join('\n');
}

function legacyCsv(...lines: string[]): string {
  return [LEGACY_HEADER, ...lines].join('\n');
}

function row(overrides: Partial<KlubfunderRow> = {}): KlubfunderRow {
  return {
    klubfunderMemberId: null,
    firstName: 'Hannah',
    surname: 'McCullagh',
    dateOfBirth: '2013-12-07',
    gender: 'Female',
    athleticAssociationNumber: null,
    parentOrGuardianFullName: 'Roisin McCullagh',
    email: 'rmccullagh@hotmail.com',
    status: 'paid',
    rowNumber: 2,
    ...overrides,
  };
}

function principal(overrides: Partial<PrincipalRow> = {}): PrincipalRow {
  return {
    id: 'p-1',
    email: 'rmccullagh@hotmail.com',
    auth_user_id: 'auth-1',
    display_name: 'Roisin McCullagh',
    role: 'member',
    is_active: true,
    source: 'klubfunder',
    terms_accepted_at: null,
    last_seen_in_klubfunder_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function member(overrides: Partial<MemberRow> = {}): MemberRow {
  return {
    id: 'm-1',
    principal_id: 'p-1',
    klubfunder_member_id: null,
    first_name: 'Hannah',
    surname: 'McCullagh',
    date_of_birth: '2013-12-07',
    gender: 'Female',
    athletic_association_number: null,
    status: 'paid',
    is_active: true,
    source: 'klubfunder',
    last_seen_in_klubfunder_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('parseKlubfunderCSV', () => {
  it('parses a minimal valid row', () => {
    const result = parseKlubfunderCSV(
      csv(
        'Hannah,McCullagh,2013-12-07,Female,,,,ANI123,,,Roisin McCullagh,,rmccullagh@hotmail.com,,,,Paid',
      ),
    );
    expect(result.warnings).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      firstName: 'Hannah',
      surname: 'McCullagh',
      dateOfBirth: '2013-12-07',
      gender: 'Female',
      athleticAssociationNumber: 'ANI123',
      parentOrGuardianFullName: 'Roisin McCullagh',
      email: 'rmccullagh@hotmail.com',
      status: 'paid',
    });
  });

  it('lowercases emails and normalises single-digit dates', () => {
    const result = parseKlubfunderCSV(
      csv('Martin,McCullagh,1972-4-3,Male,,,,,,,,,RMcCullagh@HOTMAIL.com,,,,Paid'),
    );
    expect(result.rows[0]).toMatchObject({
      dateOfBirth: '1972-04-03',
      email: 'rmccullagh@hotmail.com',
    });
  });

  it('treats empty optional fields as null', () => {
    const result = parseKlubfunderCSV(
      csv('Lee,Price,1982-10-29,Male,,,,,,,,,lp2382@gmail.com,,,,Paid'),
    );
    expect(result.rows[0]).toMatchObject({
      gender: 'Male',
      athleticAssociationNumber: null,
      parentOrGuardianFullName: null,
    });
  });

  it('warns on rows with missing email and skips them', () => {
    const result = parseKlubfunderCSV(
      csv('Anon,Mouse,2010-01-01,Male,,,,,,,,,,,,,Paid'),
    );
    expect(result.rows).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/missing email/);
  });

  it('warns on rows with missing DOB and skips them', () => {
    const result = parseKlubfunderCSV(
      csv('Anon,Mouse,,Male,,,,,,,,,a@b.com,,,,Paid'),
    );
    expect(result.rows).toHaveLength(0);
    expect(result.warnings[0]).toMatch(/date of birth/);
  });

  it('handles unknown status values by warning and defaulting to paid', () => {
    const result = parseKlubfunderCSV(
      csv('A,B,2010-01-01,Male,,,,,,,,,a@b.com,,,,Pending'),
    );
    expect(result.rows[0].status).toBe('paid');
    expect(result.warnings[0]).toMatch(/unknown status/);
  });

  it('parses Lapsed status', () => {
    const result = parseKlubfunderCSV(
      csv('A,B,2010-01-01,Male,,,,,,,,,a@b.com,,,,Lapsed'),
    );
    expect(result.rows[0].status).toBe('lapsed');
  });

  it('warns that matching will fall back when the CSV has no MemberId column', () => {
    const result = parseKlubfunderCSV(
      legacyCsv('Hannah,McCullagh,2013-12-07,Female,,,,,,,,,rmccullagh@hotmail.com,,,,Paid'),
    );

    expect(result.rows[0].klubfunderMemberId).toBeNull();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/matched on name and date of birth/);
  });

  it('reads the Klubfunder id from the MemberId column', () => {
    const result = parseKlubfunderCSV(
      csv('Hannah,McCullagh,2013-12-07,Female,,,,,,,,,rmccullagh@hotmail.com,,,,Paid'),
    );

    expect(result.warnings).toEqual([]);
    expect(result.rows[0].klubfunderMemberId).toBe('90000');
  });

  it('throws on missing required columns', () => {
    expect(() =>
      parseKlubfunderCSV('First Name,Surname\nA,B'),
    ).toThrow(KlubfunderParseError);
  });
});

describe('deriveDisplayName', () => {
  it('uses the most common parent name when present', () => {
    const result = deriveDisplayName([
      row({ firstName: 'Peter', parentOrGuardianFullName: 'Roisin McCullagh' }),
      row({ firstName: 'Hannah', parentOrGuardianFullName: 'Roisin McCullagh' }),
      row({ firstName: 'Roisin', parentOrGuardianFullName: null }),
    ]);
    expect(result).toBe('Roisin McCullagh');
  });

  it('breaks ties on parent name alphabetically', () => {
    expect(
      deriveDisplayName([
        row({ parentOrGuardianFullName: 'Bob' }),
        row({ parentOrGuardianFullName: 'Alice' }),
      ]),
    ).toBe('Alice');
  });

  it('falls back to oldest member when no parent name is set', () => {
    const result = deriveDisplayName([
      row({ firstName: 'Eoin', surname: 'Mullan', parentOrGuardianFullName: null, dateOfBirth: '1990-06-01' }),
      row({ firstName: 'Aileen', surname: 'Mullan', parentOrGuardianFullName: null, dateOfBirth: '1985-03-15' }),
    ]);
    expect(result).toBe('Aileen Mullan');
  });

  it('handles a single member with no parent name', () => {
    expect(
      deriveDisplayName([row({ firstName: 'Lee', surname: 'Price', parentOrGuardianFullName: null })]),
    ).toBe('Lee Price');
  });
});

describe('computePlan', () => {
  it('adds new principals + members when DB is empty', () => {
    const plan = computePlan(
      [
        row({ firstName: 'Hannah', surname: 'McCullagh' }),
        row({
          firstName: 'Peter',
          surname: 'McCullagh',
          dateOfBirth: '2011-09-14',
        }),
      ],
      { principals: [], members: [] },
    );
    expect(plan.principals.add).toHaveLength(1);
    expect(plan.principals.add[0]).toMatchObject({
      email: 'rmccullagh@hotmail.com',
      displayName: 'Roisin McCullagh',
    });
    expect(plan.members.add).toHaveLength(2);
    expect(plan.principals.lapse).toEqual([]);
    expect(plan.members.lapse).toEqual([]);
  });

  it('produces an empty plan when state matches the CSV', () => {
    const existing: ExistingState = {
      principals: [principal()],
      members: [member()],
    };
    const plan = computePlan([row()], existing);
    expect(planIsEmpty(plan)).toBe(true);
  });

  it('detects display_name update on a principal', () => {
    const existing: ExistingState = {
      principals: [principal({ display_name: 'Old Name' })],
      members: [member()],
    };
    const plan = computePlan([row()], existing);
    expect(plan.principals.update).toHaveLength(1);
    expect(plan.principals.update[0].displayName).toBe('Roisin McCullagh');
  });

  it('reactivates an inactive principal that reappears', () => {
    const existing: ExistingState = {
      principals: [principal({ is_active: false })],
      members: [member({ is_active: false })],
    };
    const plan = computePlan([row()], existing);
    expect(plan.principals.reactivate).toHaveLength(1);
    expect(plan.members.reactivate).toHaveLength(1);
    expect(plan.principals.lapse).toEqual([]);
  });

  it('lapses a klubfunder principal whose email is no longer in the CSV', () => {
    const existing: ExistingState = {
      principals: [principal()],
      members: [member()],
    };
    const plan = computePlan([], existing);
    expect(plan.principals.lapse).toHaveLength(1);
    expect(plan.members.lapse).toHaveLength(1);
  });

  it('lapses a member who leaves a household that is still in the CSV', () => {
    const existing: ExistingState = {
      principals: [principal()],
      members: [
        member({ id: 'm-stays', first_name: 'Hannah' }),
        member({ id: 'm-leaves', first_name: 'Niamh' }),
      ],
    };

    const plan = computePlan([row({ firstName: 'Hannah' })], existing);

    expect(plan.members.lapse.map((a) => a.id)).toEqual(['m-leaves']);
    expect(plan.principals.lapse).toEqual([]);
  });

  it('keeps a lapsed member on the household rather than removing them', () => {
    const existing: ExistingState = {
      principals: [principal()],
      members: [member({ id: 'm-leaves' })],
    };

    const plan = computePlan([], existing);

    expect(plan.members.lapse).toEqual([{ id: 'm-leaves', label: 'Hannah McCullagh' }]);
  });

  it('does NOT lapse a manual-source member absent from the CSV', () => {
    const existing: ExistingState = {
      principals: [principal()],
      members: [member({ id: 'm-manual', source: 'manual' })],
    };

    const plan = computePlan([row({ firstName: 'Someone', surname: 'Else' })], existing);

    expect(plan.members.lapse).toEqual([]);
  });

  it('does NOT lapse a manual-source principal', () => {
    const existing: ExistingState = {
      principals: [principal({ source: 'manual' })],
      members: [member({ source: 'manual' })],
    };
    const plan = computePlan([], existing);
    expect(plan.principals.lapse).toEqual([]);
    expect(plan.members.lapse).toEqual([]);
  });

  it('moves a member when their contact email changes', () => {
    const existing: ExistingState = {
      principals: [
        principal({ id: 'p-old', email: 'old@example.com' }),
        principal({ id: 'p-new', email: 'new@example.com', auth_user_id: 'auth-2' }),
      ],
      members: [
        member({
          id: 'm-1',
          principal_id: 'p-old',
        }),
      ],
    };
    const plan = computePlan(
      [row({ email: 'new@example.com' })],
      existing,
    );
    expect(plan.members.move).toHaveLength(1);
    expect(plan.members.move[0]).toMatchObject({
      id: 'm-1',
      newPrincipalEmail: 'new@example.com',
      oldPrincipalEmail: 'old@example.com',
    });
    // Old principal should be lapsed (email gone from CSV)
    expect(plan.principals.lapse.map((a) => a.id)).toContain('p-old');
  });

  it('treats a surname change as an edit when the Klubfunder id matches', () => {
    const existing: ExistingState = {
      principals: [principal()],
      members: [member({ id: 'm-1', klubfunder_member_id: '14188', surname: 'Armstrong' })],
    };

    const plan = computePlan(
      [row({ klubfunderMemberId: '14188', surname: 'Armstrong left' })],
      existing,
    );

    expect(plan.members.add).toEqual([]);
    expect(plan.members.lapse).toEqual([]);
    expect(plan.members.update).toHaveLength(1);
    expect(plan.members.update[0].changes).toEqual({ surname: 'Armstrong left' });
  });

  it('treats a corrected date of birth as an edit when the Klubfunder id matches', () => {
    const existing: ExistingState = {
      principals: [principal()],
      members: [member({ klubfunder_member_id: '25085', date_of_birth: '2015-12-02' })],
    };

    const plan = computePlan(
      [row({ klubfunderMemberId: '25085', dateOfBirth: '2016-12-02' })],
      existing,
    );

    expect(plan.members.lapse).toEqual([]);
    expect(plan.members.update[0].changes).toEqual({ dateOfBirth: '2016-12-02' });
  });

  it('backfills the Klubfunder id onto a member matched by name and date of birth', () => {
    const existing: ExistingState = {
      principals: [principal()],
      members: [member({ klubfunder_member_id: null })],
    };

    const plan = computePlan([row({ klubfunderMemberId: '14188' })], existing);

    expect(plan.members.update[0].changes).toEqual({ klubfunderMemberId: '14188' });
  });

  it('does not match on name and date of birth when the member already has a different id', () => {
    const existing: ExistingState = {
      principals: [principal()],
      members: [member({ id: 'm-other', klubfunder_member_id: '11111' })],
    };

    const plan = computePlan([row({ klubfunderMemberId: '22222' })], existing);

    expect(plan.members.add).toHaveLength(1);
    expect(plan.members.lapse.map((a) => a.id)).toEqual(['m-other']);
  });

  it('lapses a member whose Klubfunder id is absent from the CSV', () => {
    const existing: ExistingState = {
      principals: [principal()],
      members: [
        member({ id: 'm-stays', klubfunder_member_id: '111', first_name: 'Hannah' }),
        member({ id: 'm-leaves', klubfunder_member_id: '222', first_name: 'Niamh' }),
      ],
    };

    const plan = computePlan(
      [row({ klubfunderMemberId: '111', firstName: 'Hannah' })],
      existing,
    );

    expect(plan.members.lapse.map((a) => a.id)).toEqual(['m-leaves']);
  });

  it('treats a name spelling change as a new member when no Klubfunder id is present', () => {
    const existing: ExistingState = {
      principals: [principal()],
      members: [member({ first_name: 'Hannah' })],
    };
    const plan = computePlan(
      [row({ firstName: 'Hanah' })], // different spelling
      existing,
    );
    // Original Hannah is lapsed, new Hanah is added.
    expect(plan.members.add).toHaveLength(1);
    expect(plan.members.lapse).toHaveLength(1);
  });

  it('updates a member when status, gender, or AAN changes', () => {
    const existing: ExistingState = {
      principals: [principal()],
      members: [
        member({
          status: 'paid',
          gender: 'Female',
          athletic_association_number: 'OLD123',
        }),
      ],
    };
    const plan = computePlan(
      [
        row({
          status: 'lapsed',
          gender: 'Female',
          athleticAssociationNumber: 'NEW456',
        }),
      ],
      existing,
    );
    expect(plan.members.update).toHaveLength(1);
    expect(plan.members.update[0].changes).toEqual({
      status: 'lapsed',
      athleticAssociationNumber: 'NEW456',
    });
  });

  it('warns on duplicate (firstName+surname+DOB) within a single CSV', () => {
    const plan = computePlan(
      [
        row({ rowNumber: 2 }),
        row({ rowNumber: 99 }),
      ],
      { principals: [], members: [] },
    );
    expect(plan.members.add).toHaveLength(1);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0]).toMatch(/duplicate/);
  });
});
