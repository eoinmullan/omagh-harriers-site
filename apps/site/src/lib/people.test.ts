import { describe, expect, it } from 'vitest';
import {
  ageOn,
  FREE_TRAINING_REASON_MAX,
  isJunior,
  planDisplayName,
  planFreeTraining,
  planHousehold,
  planMember,
  planMemberEdit,
} from './people';

const TODAY = '2026-11-20';

const child = {
  principalId: 'household-id',
  firstName: ' Jack ',
  surname: ' Kelly ',
  dateOfBirth: '2014-03-09',
  gender: 'Male',
  associationNumber: ' ANI123 ',
};

const problemOf = (plan: object) => ('problem' in plan ? plan.problem : undefined);

describe('planMember', () => {
  it('turns the form into a manual, paid member with the names tidied', () => {
    const plan = planMember(child, TODAY);

    expect(plan).toEqual({
      row: {
        principal_id: 'household-id',
        first_name: 'Jack',
        surname: 'Kelly',
        date_of_birth: '2014-03-09',
        gender: 'Male',
        athletic_association_number: 'ANI123',
        source: 'manual',
        status: 'paid',
      },
    });
  });

  it('stores a blank gender or association number as nothing, not an empty string', () => {
    const plan = planMember({ ...child, gender: '', associationNumber: '  ' }, TODAY);

    expect('row' in plan && plan.row.gender).toBeNull();
    expect('row' in plan && plan.row.athletic_association_number).toBeNull();
  });

  it('needs a household', () => {
    expect(problemOf(planMember({ ...child, principalId: '' }, TODAY))).toBe(
      'Choose the household this member belongs to.',
    );
  });

  it('needs a first name, a surname and a date of birth', () => {
    const expected = 'First name, surname and date of birth are required.';

    expect(problemOf(planMember({ ...child, firstName: '  ' }, TODAY))).toBe(expected);
    expect(problemOf(planMember({ ...child, surname: '' }, TODAY))).toBe(expected);
    expect(problemOf(planMember({ ...child, dateOfBirth: '' }, TODAY))).toBe(expected);
  });

  it('refuses a date of birth in the future, which is a mistyped year', () => {
    expect(problemOf(planMember({ ...child, dateOfBirth: '2109-03-09' }, TODAY))).toBe(
      'That date of birth is in the future. Check the year.',
    );
  });

  it('accepts a child born today', () => {
    expect(problemOf(planMember({ ...child, dateOfBirth: TODAY }, TODAY))).toBeUndefined();
  });

  it('refuses a date of birth before 1900', () => {
    expect(problemOf(planMember({ ...child, dateOfBirth: '1814-03-09' }, TODAY))).toBe(
      'That date of birth is before 1900. Check the year.',
    );
  });

  it('refuses a date that does not exist', () => {
    expect(problemOf(planMember({ ...child, dateOfBirth: '2014-02-30' }, TODAY))).toBe(
      'Enter the date of birth as a real date.',
    );
  });
});

describe('planMemberEdit', () => {
  const edit = { ...child, status: 'lapsed' };

  it('turns the form into an update, status included', () => {
    const plan = planMemberEdit(edit, TODAY);

    expect(plan).toEqual({
      update: {
        first_name: 'Jack',
        surname: 'Kelly',
        date_of_birth: '2014-03-09',
        gender: 'Male',
        athletic_association_number: 'ANI123',
        status: 'lapsed',
      },
    });
  });

  it('refuses a status that is not paid or lapsed', () => {
    expect(problemOf(planMemberEdit({ ...edit, status: 'gold' }, TODAY))).toBe(
      'Choose whether the membership is paid or lapsed.',
    );
  });

  it('checks the date of birth the same way as adding does', () => {
    expect(problemOf(planMemberEdit({ ...edit, dateOfBirth: '2109-03-09' }, TODAY))).toBe(
      'That date of birth is in the future. Check the year.',
    );
  });
});

describe('planHousehold', () => {
  it('turns the form into a manual member household, email lower-cased', () => {
    const plan = planHousehold({ email: ' Mary.Kelly@Example.com ', displayName: ' Mary Kelly ' });

    expect(plan).toEqual({
      row: { email: 'mary.kelly@example.com', display_name: 'Mary Kelly', source: 'manual', role: 'member' },
    });
  });

  it('needs an email address that looks like one', () => {
    expect(problemOf(planHousehold({ email: '', displayName: 'Mary Kelly' }))).toBe(
      "Enter the household's email address.",
    );
    expect(problemOf(planHousehold({ email: 'mary at example', displayName: 'Mary Kelly' }))).toBe(
      "That doesn't look like an email address.",
    );
  });

  it('needs a display name', () => {
    expect(problemOf(planHousehold({ email: 'mary@example.com', displayName: '  ' }))).toBe(
      'Display name is required.',
    );
  });
});

describe('planDisplayName', () => {
  it('tidies a new name', () => {
    expect(planDisplayName('  Mary Kelly ')).toEqual({ displayName: 'Mary Kelly' });
  });

  it('refuses a blank one', () => {
    expect(planDisplayName('   ')).toEqual({ problem: 'Display name is required.' });
  });
});

describe('planFreeTraining', () => {
  it('turns it on with the reason tidied', () => {
    const plan = planFreeTraining({ trainsFree: 'yes', reason: '  Life   member ' });

    expect(plan).toEqual({ update: { trains_free: true, trains_free_reason: 'Life member' } });
  });

  it('asks for a reason when it is turned on without one', () => {
    const plan = planFreeTraining({ trainsFree: 'yes', reason: '  ' });

    expect(plan).toEqual({ problem: 'Say why they train free, such as Coach or Life member.' });
  });

  it('refuses a reason too long to be a label', () => {
    const plan = planFreeTraining({ trainsFree: 'yes', reason: 'x'.repeat(FREE_TRAINING_REASON_MAX + 1) });

    expect(plan).toEqual({ problem: expect.stringContaining(`${FREE_TRAINING_REASON_MAX} characters`) });
  });

  it('turns it off and clears the reason, whatever was typed', () => {
    const plan = planFreeTraining({ trainsFree: 'no', reason: 'Coach' });

    expect(plan).toEqual({ update: { trains_free: false, trains_free_reason: null } });
  });
});

describe('ageOn', () => {
  it('counts whole years, the day of the birthday included', () => {
    expect(ageOn('2008-11-20', TODAY)).toBe(18);
  });

  it('is a year younger the day before the birthday', () => {
    expect(ageOn('2008-11-21', TODAY)).toBe(17);
  });

  it('handles a birthday on the 29th of February', () => {
    expect(ageOn('2008-02-29', '2026-02-28')).toBe(17);
    expect(ageOn('2008-02-29', '2026-03-01')).toBe(18);
  });
});

describe('isJunior', () => {
  it('counts a member under eighteen as a junior', () => {
    expect(isJunior('2014-03-09', TODAY)).toBe(true);
  });

  it('counts a member as an adult from their eighteenth birthday', () => {
    expect(isJunior('2008-11-20', TODAY)).toBe(false);
  });
});
