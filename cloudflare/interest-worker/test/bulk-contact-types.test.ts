import {afterEach, expect, it} from 'vitest';
import {ministryFixture} from './ministry-fixture';
import {handleAdminRequest} from '../src/admin';
const fixtures: Awaited<ReturnType<typeof ministryFixture>>[] = [];
afterEach(() => fixtures.splice(0).forEach(f => f.sqlite.close()));
const path = '/admin/contacts/bulk-types';
async function setup(count = 3) {
  const f = await ministryFixture(); fixtures.push(f);
  Object.assign(f.env, {ADMIN_SESSION_SECRET: 'test-secret', ALLOWED_ORIGINS: 'http://localhost:4188'});
  const ids = Array.from({length: count}, () => crypto.randomUUID());
  for (const id of ids) f.sqlite.prepare("INSERT INTO people(id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,created_at,updated_at) VALUES(?,'Sample','Contact','sample','contact','sample@example.test',?,'before','before')").run(id,id+'@example.test');
  const call = (body: unknown) => handleAdminRequest(f.request(path, body), f.env, path);
  const types = (id: string) => f.sqlite.prepare('SELECT contact_type FROM contact_types WHERE person_id=? ORDER BY contact_type').all(id).map(r => r.contact_type);
  return {...f, ids, call, types};
}
it('adds and removes a type across selected contacts, preserving other types and unselected contacts', async () => {
  const f = await setup(), [a,b,c] = f.ids;
  f.sqlite.prepare("INSERT INTO contact_types VALUES(?,'donor','before'),(?,'newsletter','before'),(?,'newsletter','before')").run(a,b,c);
  const response = await f.call({personIds:[a,b,a],contactType:'newsletter',action:'add'});
  expect(response!.status).toBe(200);
  expect(await response!.json()).toMatchObject({requested:2,updated:1,unchanged:1});
  expect(f.types(a)).toEqual(['donor','newsletter']); expect(f.types(b)).toEqual(['newsletter']);
  expect(f.sqlite.prepare('SELECT updated_at FROM people WHERE id=?').get(b)?.updated_at).toBe('before');
  expect(f.sqlite.prepare('SELECT email FROM people WHERE id=?').get(a)?.email).toBe('sample@example.test');
  const removed = await f.call({personIds:[a,b],contactType:'newsletter',action:'remove'});
  expect(await removed!.json()).toMatchObject({updated:2,unchanged:0});
  expect(f.types(a)).toEqual(['donor']); expect(f.types(b)).toEqual([]); expect(f.types(c)).toEqual(['newsletter']);
  const noop = await f.call({personIds:[a,b],contactType:'newsletter',action:'remove'});
  expect(await noop!.json()).toMatchObject({updated:0,unchanged:2});
  expect(f.sqlite.prepare("SELECT count(*) n FROM audit_events WHERE event_type='bulk_contact_type_updated'").get()?.n).toBe(3);
});
it('supports a 500-contact group', async () => {
  const f = await setup(500);
  const r = await f.call({personIds:f.ids,contactType:'newsletter',action:'add'});
  expect(r!.status, await r!.clone().text()).toBe(200);
  expect(await r!.json()).toMatchObject({updated:500});
});
it('rejects missing contacts and invalid inputs without partial changes', async () => {
  const f = await setup();
  for (const body of [
    {personIds:[f.ids[0],crypto.randomUUID()],contactType:'newsletter',action:'add'},
    {personIds:[],contactType:'newsletter',action:'add'},
    {personIds:Array(501).fill(f.ids[0]),contactType:'newsletter',action:'add'},
    {personIds:['bad-id'],contactType:'newsletter',action:'add'},
    {personIds:f.ids,contactType:'portal_access',action:'add'},
    {personIds:f.ids,contactType:'bogus',action:'add'},
    {personIds:f.ids,contactType:'newsletter',action:'replace'},
  ]) expect((await f.call(body))!.status).toBeGreaterThanOrEqual(400);
  expect(f.types(f.ids[0])).toEqual([]);
});
it('requires authentication, CSRF and contact edit permission', async () => {
  const f = await setup(), body = {personIds:f.ids,contactType:'newsletter',action:'add'};
  const request = f.request(path,body); request.headers.delete('x-csrf-token');
  expect((await handleAdminRequest(request,f.env,path))!.status).toBe(403);
  request.headers.delete('cookie');
  expect((await handleAdminRequest(request,f.env,path))!.status).toBe(401);
  f.sqlite.exec("INSERT INTO mmt_users(id,username,first_name,last_name,email,must_change_password,permissions_json,registered_at,updated_at) VALUES('limited','limited','Limited','User','limited@example.test',0,'{}','now','now'); UPDATE admin_sessions SET user_id='limited'");
  f.sqlite.prepare("UPDATE mmt_users SET permissions_json=? WHERE id='limited'").run(JSON.stringify({contacts:'read'}));
  expect((await f.call(body))!.status).toBe(403);
  f.sqlite.prepare("UPDATE mmt_users SET permissions_json=? WHERE id='limited'").run(JSON.stringify({contacts:'edit'}));
  expect((await f.call(body))!.status).toBe(200);
});
it('keeps Volunteer access in sync while preserving managed Portal Access', async () => {
  const f = await setup(), id = f.ids[0];
  f.sqlite.prepare("UPDATE mmt_users SET hs_person_id=? WHERE id='primary'").run(id);
  await f.call({personIds:[id],contactType:'volunteer',action:'add'});
  expect(f.sqlite.prepare("SELECT volunteer_access FROM mmt_users WHERE id='primary'").get()?.volunteer_access).toBe(1);
  expect(f.types(id)).toContain('portal_access');
  await f.call({personIds:[id],contactType:'volunteer',action:'remove'});
  expect(f.sqlite.prepare("SELECT volunteer_access FROM mmt_users WHERE id='primary'").get()?.volunteer_access).toBe(0);
  expect(f.types(id)).toContain('portal_access');
});
it('rolls back every selected change if a database operation fails', async () => {
  const f = await setup();
  f.sqlite.exec(`CREATE TRIGGER reject_test_type BEFORE INSERT ON contact_types WHEN NEW.person_id='${f.ids[1]}' AND NEW.contact_type='newsletter' BEGIN SELECT RAISE(ABORT,'test failure'); END;`);
  expect((await f.call({personIds:f.ids,contactType:'newsletter',action:'add'}))!.status).toBe(500);
  f.ids.forEach(id => {expect(f.types(id)).toEqual([]);expect(f.sqlite.prepare('SELECT updated_at FROM people WHERE id=?').get(id)?.updated_at).toBe('before');});
  expect(f.sqlite.prepare("SELECT count(*) n FROM audit_events WHERE event_type='bulk_contact_type_updated'").get()?.n).toBe(0);
});
