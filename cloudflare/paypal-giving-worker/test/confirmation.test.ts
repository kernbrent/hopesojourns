/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../../giving/thank-you/confirmation.js', import.meta.url), 'utf8');
function render(gift: unknown, blocked = false) {
  const elements: Record<string, { textContent: string; hidden: boolean }> = {};
  for (const id of ['gift-amount','gift-reference','confirmation-title','gift-confirmed','gift-unavailable']) elements[id] = { textContent: '', hidden: id === 'gift-confirmed' };
  runInNewContext(source, { Date, Intl, sessionStorage: { getItem: () => { if (blocked) throw Error('Blocked'); return JSON.stringify(gift); } }, document: { getElementById: (id: string) => elements[id] } });
  return elements;
}
const valid = () => ({ amount: '123.45', currency: 'USD', captureId: 'CAPTURE-123', confirmedAt: Date.now() });
async function checkout(capture: Record<string, unknown>, blocked = false) {
  const elements: Record<string, any> = {};
  for (const id of ['giving-amount','giving-cadence-note','giving-paypal-buttons','giving-status','giving-fallback']) elements[id] = { value: '999.00', dataset: {}, setAttribute() {}, removeAttribute() {}, replaceChildren() {}, addEventListener() {}, scrollIntoView() {} };
  const frequency = { checked: true, value: 'once', addEventListener() {} };
  let options: any, stored: any, destination = '';
  const widget = { dataset: { paypalApi: 'https://test.example' }, querySelectorAll: (selector: string) => selector.includes('frequency') ? [frequency] : [], querySelector: () => null };
  const sandbox = {
    Date, Intl, URLSearchParams, console,
    document: { querySelector: () => widget, getElementById: (id: string) => elements[id] },
    window: { HopeSojournsPayPalOnce: { Buttons: (input: any) => { options = input; return { isEligible: () => true, render: async () => {} }; } }, location: { assign: (url: string) => { destination = url; } } },
    sessionStorage: { removeItem() {}, setItem: (_key: string, value: string) => { if (blocked) throw Error('Blocked'); stored = JSON.parse(value); } },
    fetch: async (url: string) => ({ ok: true, json: async () => url.endsWith('/config') ? { ready: true, clientId: 'test', currency: 'USD', plans: { monthly: 'm', yearly: 'y' } } : capture }),
  };
  runInNewContext(readFileSync(new URL('../../../giving/giving.js', import.meta.url), 'utf8'), sandbox);
  for (let i=0; i<20 && !options; i++) await Promise.resolve();
  return { approve: () => options.onApprove({ orderID: 'ORDER' }), result: () => ({ stored, destination, message: elements['giving-status'].textContent }), cancel: () => options.onCancel() };
}
describe('checkout handoff', () => {
  const capture = { id: 'ORDER', captureId: 'CAPTURE', captureStatus: 'COMPLETED', amount: '123.45', currency: 'USD' };
  it('navigates only after capture and uses the paid amount instead of the editable input', async () => {
    const flow = await checkout(capture);
    await flow.approve();
    expect(flow.result().destination).toBe('/giving/thank-you/');
    expect(flow.result().stored.amount).toBe('123.45');
  });
  it('does not redirect pending payments or cancellations', async () => {
    const flow = await checkout({ ...capture, status: 'COMPLETED', captureStatus: 'PENDING' });
    await expect(flow.approve()).rejects.toThrow('not confirmed');
    flow.cancel();
    expect(flow.result().destination).toBe('');
  });
  it('keeps a completed gift successful when session storage is blocked', async () => {
    const flow = await checkout(capture, true);
    await flow.approve();
    expect(flow.result().destination).toBe('');
    expect(flow.result().message).toContain('$123.45');
  });
});
describe('giving confirmation page', () => {
  it('shows the confirmed amount and reference, including on refresh', () => {
    for (let visit = 0; visit < 2; visit++) {
      const page = render(valid());
      expect(page['gift-amount'].textContent).toBe('$123.45');
      expect(page['gift-reference'].textContent).toBe('CAPTURE-123');
      expect(page['gift-confirmed'].hidden).toBe(false);
      expect(page['gift-unavailable'].hidden).toBe(true);
    }
  });
  it('does not claim success for direct, expired, invalid, or storage-blocked visits', () => {
    for (const gift of [null, {}, { ...valid(), confirmedAt: Date.now()-31*60*1000 }, { ...valid(), amount: 'NaN' }, { ...valid(), currency: 'XXX' }, { ...valid(), captureId: '' }]) {
      expect(render(gift)['gift-confirmed'].hidden).toBe(true);
    }
    expect(render(valid(), true)['gift-confirmed'].hidden).toBe(true);
  });
  it('personalizes with the supplied donor name as text and falls back when absent', () => {
    expect(render({ ...valid(), donorName: 'Brent Kern' })['confirmation-title'].textContent).toBe('Thank you, Brent Kern.');
    expect(render(valid())['confirmation-title'].textContent).toBe('Thank you for giving.');
    expect(render({ ...valid(), donorName: '<b>Brent</b>' })['confirmation-title'].textContent).toBe('Thank you, <b>Brent</b>.');
  });
});
