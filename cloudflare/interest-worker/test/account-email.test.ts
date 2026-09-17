import {afterEach, expect, it, vi} from 'vitest';
import {accountEmailReady, sendAccountEmail} from '../src/account-email';

const message = {to: 'recipient@example.test', subject: 'Set up your account', text: 'Private one-use link'};
const config = {MMT_EMAIL_PROVIDER: 'resend', MMT_EMAIL_DELIVERY_MODE: 'live' as const, RESEND_API_KEY: 'test-key'} as const;
afterEach(() => vi.unstubAllGlobals());

it('sends from Hope Sojourns with reply routing and an idempotency key', async () => {
  const send = vi.fn().mockResolvedValue(Response.json({id: 'message-id'}));
  vi.stubGlobal('fetch', send);
  expect(await sendAccountEmail(config, message, 'mmt-unique')).toBe(true);
  const [url, options] = send.mock.calls[0];
  expect(url).toBe('https://api.resend.com/emails');
  expect(options.headers).toMatchObject({'Idempotency-Key': 'mmt-unique', Authorization: 'Bearer test-key'});
  expect(JSON.parse(options.body)).toEqual({...message, to: [message.to], from: 'Hope Sojourns <admin@hopesojourns.com>', reply_to: 'admin@hopesojourns.com'});
  expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(options.redirect).toBe('error');
});

it('does not send without both explicit activation and credentials', async () => {
  const send = vi.fn(); vi.stubGlobal('fetch', send);
  for (const env of [{...config, MMT_EMAIL_DELIVERY_MODE: 'capture' as const}, {...config, RESEND_API_KEY: ''}, {...config, MMT_EMAIL_DELIVERY_MODE: undefined}]) {
    expect(accountEmailReady(env)).toBe(false);
    expect(await sendAccountEmail(env, message, 'mmt-unique')).toBe(false);
  }
  expect(send).not.toHaveBeenCalled();
});

it('handles provider rejection and network failures without retrying or falling back', async () => {
  const fallback = vi.fn().mockResolvedValue({messageId: 'unused'});
  const env = {...config, EMAIL_DELIVERY_MODE: 'live' as const, EMAIL: {send: fallback}};
  const send = vi.fn().mockResolvedValueOnce(new Response('rejected', {status: 429})).mockRejectedValueOnce(new Error('timeout'));
  vi.stubGlobal('fetch', send);
  expect(await sendAccountEmail(env, message, 'first')).toBe(false);
  expect(await sendAccountEmail(env, message, 'second')).toBe(false);
  expect(send).toHaveBeenCalledTimes(2);
  expect(fallback).not.toHaveBeenCalled();
});
