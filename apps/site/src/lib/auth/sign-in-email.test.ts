import { describe, expect, it } from 'vitest';
import {
  CAPTCHA_FAILED,
  CAPTCHA_UNAVAILABLE,
  judgeCaptcha,
  type CaptchaVerdict,
  MEMBERSHIP_LAPSED,
  NOT_ON_THE_MEMBER_LIST,
  REFUSAL_DELAY_MS,
  sendSignInEmail,
  type MembershipLookup,
  type SignInEmailSteps,
} from './sign-in-email';

interface FakeOptions {
  captcha?: CaptchaVerdict;
  membership?: MembershipLookup;
  sendFailure?: { status?: number; code?: string };
}

function fakeSteps(options: FakeOptions = {}) {
  const { captcha = 'passed', sendFailure } = options;
  const membership = 'membership' in options ? options.membership : { isActive: true };
  const calls = { lookedUp: [] as string[], sentTo: [] as string[], paused: [] as number[] };
  const steps: SignInEmailSteps = {
    checkCaptcha: async () => captcha,
    findMembership: async (email) => {
      calls.lookedUp.push(email);
      return membership;
    },
    sendEmail: async (email) => {
      calls.sentTo.push(email);
      return sendFailure;
    },
    pause: async (milliseconds) => {
      calls.paused.push(milliseconds);
    },
  };
  return { steps, calls };
}

describe('sendSignInEmail', () => {
  it('sends to an active member, tidying the address first', async () => {
    const { steps, calls } = fakeSteps();

    const outcome = await sendSignInEmail(steps, '  Parent@Example.com ', 'token');

    expect(outcome).toEqual({ sent: true, email: 'parent@example.com' });
    expect(calls.sentTo).toEqual(['parent@example.com']);
    expect(calls.paused).toEqual([]);
  });

  it('refuses before looking anybody up when the security check fails', async () => {
    const { steps, calls } = fakeSteps({ captcha: 'failed' });

    const outcome = await sendSignInEmail(steps, 'parent@example.com', '');

    expect(outcome).toEqual({ sent: false, problem: CAPTCHA_FAILED });
    expect(calls.lookedUp).toEqual([]);
  });

  it('refuses an address not on the member list, after the delay', async () => {
    const { steps, calls } = fakeSteps({ membership: undefined });

    const outcome = await sendSignInEmail(steps, 'stranger@example.com', 'token');

    expect(outcome).toEqual({ sent: false, problem: NOT_ON_THE_MEMBER_LIST });
    expect(calls.paused).toEqual([REFUSAL_DELAY_MS]);
    expect(calls.sentTo).toEqual([]);
  });

  it('refuses a lapsed member, after the same delay', async () => {
    const { steps, calls } = fakeSteps({ membership: { isActive: false } });

    const outcome = await sendSignInEmail(steps, 'lapsed@example.com', 'token');

    expect(outcome).toEqual({ sent: false, problem: MEMBERSHIP_LAPSED });
    expect(calls.paused).toEqual([REFUSAL_DELAY_MS]);
  });

  it('checks the security token once, since Turnstile accepts each token only once', async () => {
    const { steps } = fakeSteps();
    let checks = 0;
    const counting: SignInEmailSteps = {
      ...steps,
      checkCaptcha: async () => {
        checks += 1;
        return 'passed';
      },
    };

    await sendSignInEmail(counting, 'parent@example.com', 'token');

    expect(checks).toBe(1);
  });

  it('says why when Supabase refuses to send', async () => {
    const { steps } = fakeSteps({ sendFailure: { status: 429, code: 'over_email_send_rate_limit' } });

    const outcome = await sendSignInEmail(steps, 'parent@example.com', 'token');

    expect(outcome).toEqual({ sent: false, problem: expect.stringContaining('less than a minute ago') });
  });
});

describe('whyNotThisMember through sendSignInEmail, when the security check is down', () => {
  it('refuses with a sentence that says so, before looking anybody up', async () => {
    const { steps, calls } = fakeSteps({ captcha: 'unavailable' });

    const outcome = await sendSignInEmail(steps, 'parent@example.com', 'token');

    expect(outcome).toEqual({ sent: false, problem: CAPTCHA_UNAVAILABLE });
    expect(calls.lookedUp).toEqual([]);
  });
});

describe('judgeCaptcha', () => {
  const cloudflareSays = (answer: boolean) => async () => answer;

  it('passes everything in development, where there is no widget', async () => {
    const verdict = await judgeCaptcha({ inDevelopment: true, secret: undefined, token: '', askCloudflare: cloudflareSays(false) });

    expect(verdict).toBe('passed');
  });

  it('refuses, rather than passes, when the secret is missing', async () => {
    const verdict = await judgeCaptcha({ inDevelopment: false, secret: undefined, token: 'token', askCloudflare: cloudflareSays(true) });

    expect(verdict).toBe('unavailable');
  });

  it('fails an empty token without asking Cloudflare', async () => {
    let asked = false;
    const verdict = await judgeCaptcha({
      inDevelopment: false,
      secret: 'secret',
      token: '',
      askCloudflare: async () => {
        asked = true;
        return true;
      },
    });

    expect(verdict).toBe('failed');
    expect(asked).toBe(false);
  });

  it("passes when Cloudflare accepts the token", async () => {
    const verdict = await judgeCaptcha({ inDevelopment: false, secret: 'secret', token: 'token', askCloudflare: cloudflareSays(true) });

    expect(verdict).toBe('passed');
  });

  it('fails when Cloudflare refuses the token', async () => {
    const verdict = await judgeCaptcha({ inDevelopment: false, secret: 'secret', token: 'token', askCloudflare: cloudflareSays(false) });

    expect(verdict).toBe('failed');
  });

  it("refuses when Cloudflare can't be reached", async () => {
    const verdict = await judgeCaptcha({
      inDevelopment: false,
      secret: 'secret',
      token: 'token',
      askCloudflare: async () => {
        throw new Error('network');
      },
    });

    expect(verdict).toBe('unavailable');
  });
});
