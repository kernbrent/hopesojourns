import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {handleAdminRequest} from '../src/admin';
import {routeSection} from '../src/mmt-permissions';
import {ministryFixture} from './ministry-fixture';

const PATH='/admin/user-guide';

describe('session-protected MMT user guide',()=>{
 it('does not reveal the guide to an unauthenticated or expired session',async()=>{
  const f=await ministryFixture();
  const anonymous=await handleAdminRequest(new Request('https://hopesojourns.com/api/interest'+PATH),f.env,PATH);
  expect(anonymous.status).toBe(401);
  expect(await anonymous.text()).not.toContain('Table of contents');
  f.sqlite.exec("UPDATE admin_sessions SET expires_at='2020-01-01T00:00:00.000Z'");
  const expired=await handleAdminRequest(f.request(PATH),f.env,PATH);
  expect(expired.status).toBe(401);
  expect(await expired.text()).not.toContain('Table of contents');
 });

 it('allows an ordinary signed-in member to read, but not edit, the guide',async()=>{
  const f=await ministryFixture();
  expect(routeSection(PATH)).toBe('self');
  const response=await handleAdminRequest(f.request(PATH),f.env,PATH);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/html');
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('content-security-policy')).toContain("form-action 'none'");
  expect(response.headers.get('x-robots-tag')).toContain('noindex');
  const html=await response.text();
  expect(html).toContain('Table of contents');
  expect(html).toContain('id="index"');
  expect(html).not.toContain('<form');
  expect((await handleAdminRequest(f.request(PATH,{},'POST'),f.env,PATH)).status).toBe(404);
 });

 it('fails closed when the private guide object is unavailable',async()=>{
  const f=await ministryFixture();
  f.guides.clear();
  const response=await handleAdminRequest(f.request(PATH),f.env,PATH);
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('Table of contents');
 });

 it('places the only portal guide link in shared authenticated footer code',()=>{
  const nav=readFileSync(new URL('../../../admin/mmt-navigation.js',import.meta.url),'utf8');
  expect(nav).toContain("link.href='/api/interest/admin/user-guide'");
  expect(nav).toContain('mountGuideFooter();selection();');
  expect(nav).toContain("guideFooter.querySelector('[data-mmt-guide-link]')?.remove()");
 });
});
