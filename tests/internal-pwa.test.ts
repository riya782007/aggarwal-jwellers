import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function worker() {
  const listeners: Record<string, (event: any) => void> = {};
  const requests: string[] = [];
  const self = { location: { origin: 'https://shop.test' }, addEventListener: (type: string, fn: any) => { listeners[type] = fn; } };
  const fetch = async (request: any) => { requests.push(request.url); throw new Error('offline'); };
  const notice = { staticNotice: true };
  vm.runInNewContext(readFileSync('public/internal-sw.js', 'utf8'), { self, URL, fetch, caches: { match: async () => notice }, Response });
  return { listeners, requests, notice };
}
function request(path: string, overrides = {}) {
  return { url: `https://shop.test${path}`, method: 'GET', mode: 'navigate', ...overrides };
}
describe('internal worker preserves live operations', () => {
  it.each([
    request('/admin/billing', { method: 'POST' }),
    request('/admin/billing', { mode: 'cors' }),
    request('/api/logout'), request('/shop'), request('/administrator'),
    request('/admin', { url: 'https://other.test/admin' }),
  ])('does not intercept %j', req => {
    const { listeners } = worker();
    let intercepted = false;
    listeners.fetch({ request: req, respondWith: () => { intercepted = true; } });
    expect(intercepted).toBe(false);
  });
  it.each(['/admin', '/admin/billing', '/login'])('serves only the static notice when %s is unreachable', async path => {
    const { listeners, requests, notice } = worker();
    let response: Promise<any> | undefined;
    listeners.fetch({ request: request(path), respondWith: (value: Promise<any>) => { response = value; } });
    expect(await response).toBe(notice);
    expect(requests).toEqual([`https://shop.test${path}`]);
  });
});
