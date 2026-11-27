import { describe, expect, it } from 'vitest';
import { checkSignInCode, codeRefusedSentence, ENTER_THE_CODE, NO_SIGNAL, sendRefusedSentence } from './sign-in-code';

describe('checkSignInCode', () => {
  it('accepts a code of the right length', () => {
    const check = checkSignInCode('123456');

    expect(check).toEqual({ code: '123456' });
  });

  it('ignores the spaces and dashes a phone pastes', () => {
    const check = checkSignInCode(' 123 456 ');
    const dashed = checkSignInCode('123-456');

    expect(check).toEqual({ code: '123456' });
    expect(dashed).toEqual({ code: '123456' });
  });

  it('asks for the code when nothing was typed', () => {
    const check = checkSignInCode('   ');

    expect(check).toEqual({ problem: ENTER_THE_CODE });
  });

  it('says the code is numbers only when a letter is typed', () => {
    const check = checkSignInCode('12345a');

    expect(check).toEqual({ problem: expect.stringContaining('numbers only') });
  });

  it('says how long the code is when it is too short', () => {
    const check = checkSignInCode('12345');

    expect(check).toEqual({ problem: expect.stringContaining('6 digits') });
  });

  it('says how long the code is when it is too long', () => {
    const check = checkSignInCode('1234567');

    expect(check).toEqual({ problem: expect.stringContaining('6 digits') });
  });
});

describe('codeRefusedSentence', () => {
  it('asks for a check and names the link for a code Supabase calls expired or invalid', () => {
    const sentence = codeRefusedSentence({ status: 403, code: 'otp_expired' });

    expect(sentence).toMatch(/^That code didn't work, please check it again\. If you tapped the link in the email/);
  });

  it('treats a bare 403 as the same refusal', () => {
    const sentence = codeRefusedSentence({ status: 403 });

    expect(sentence).toBe(codeRefusedSentence({ code: 'otp_expired' }));
  });

  it('asks the person to wait after too many tries', () => {
    const sentence = codeRefusedSentence({ status: 429, code: 'over_request_rate_limit' });

    expect(sentence).toContain('Too many tries');
  });

  it('blames the signal when the request never reached Supabase', () => {
    const sentence = codeRefusedSentence({ status: 0 });

    expect(sentence).toBe(NO_SIGNAL);
  });

  it('points a lapsed member at the committee', () => {
    const sentence = codeRefusedSentence({ status: 400, code: 'user_banned' });

    expect(sentence).toContain('no longer active');
  });

  it('falls back to trying again for anything else', () => {
    const sentence = codeRefusedSentence({ status: 500 });

    expect(sentence).toContain('Please try again');
  });
});

describe('sendRefusedSentence', () => {
  it('asks for a minute when a code was sent moments ago', () => {
    const sentence = sendRefusedSentence({ status: 429, code: 'over_email_send_rate_limit' });

    expect(sentence).toContain('less than a minute ago');
  });

  it('asks for a few minutes under a general rate limit', () => {
    const sentence = sendRefusedSentence({ status: 429 });

    expect(sentence).toContain('wait a few minutes');
  });

  it('falls back to trying again for anything else', () => {
    const sentence = sendRefusedSentence({ status: 500 });

    expect(sentence).toContain('Please try again');
  });
});
