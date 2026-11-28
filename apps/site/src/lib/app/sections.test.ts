import { describe, expect, it } from 'vitest';
import { sectionOfPath, sectionsFor, switcherIsWorthShowing } from './sections';

const keys = (role: Parameters<typeof sectionsFor>[0]) => sectionsFor(role).map((section) => section.key);

describe('sectionsFor', () => {
  it('gives a member Home and nothing else', () => {
    const held = keys('member');

    expect(held).toEqual(['home']);
  });

  it('gives a registrar Home and Registration', () => {
    const held = keys('registrar');

    expect(held).toEqual(['home', 'registration']);
  });

  it('gives an admin all three, Registration before Admin', () => {
    const held = keys('admin');

    expect(held).toEqual(['home', 'registration', 'admin']);
  });

  it('treats a superuser as an admin', () => {
    const held = keys('superuser');

    expect(held).toEqual(['home', 'registration', 'admin']);
  });

  it('adds Emergency contacts for whoever holds the flag, whatever their role', () => {
    expect(sectionsFor('member', true).map((section) => section.key)).toEqual(['home', 'emergency']);
    expect(sectionsFor('admin', true).map((section) => section.key)).toEqual(['home', 'registration', 'emergency', 'admin']);
  });

  it('gives an unreadable role Home only', () => {
    const held = keys(undefined);

    expect(held).toEqual(['home']);
  });
});

describe('switcherIsWorthShowing', () => {
  it('hides the switcher from somebody who holds only Home', () => {
    const shown = switcherIsWorthShowing(sectionsFor('member'));

    expect(shown).toBe(false);
  });

  it('shows it to somebody with a tool', () => {
    const shown = switcherIsWorthShowing(sectionsFor('registrar'));

    expect(shown).toBe(true);
  });
});

describe('sectionOfPath', () => {
  it('places the members area in Home', () => {
    expect(sectionOfPath('/members')).toBe('home');
    expect(sectionOfPath('/members/credits')).toBe('home');
  });

  it('places the registrar app in Registration, with or without the slash', () => {
    expect(sectionOfPath('/registrar/')).toBe('registration');
    expect(sectionOfPath('/registrar')).toBe('registration');
  });

  it('places the emergency contacts section in Emergency', () => {
    expect(sectionOfPath('/emergency/')).toBe('emergency');
  });

  it('places admin pages in Admin', () => {
    expect(sectionOfPath('/admin/households/abc')).toBe('admin');
  });

  it('leaves public pages and look-alike paths out of the app', () => {
    expect(sectionOfPath('/')).toBeUndefined();
    expect(sectionOfPath('/juniors')).toBeUndefined();
    expect(sectionOfPath('/members-news')).toBeUndefined();
    expect(sectionOfPath('/administration')).toBeUndefined();
  });
});
