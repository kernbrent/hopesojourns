import {afterEach,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {ministryFixture} from './ministry-fixture';
import {handleAdminRequest} from '../src/admin';
import {handleAccountPublic} from '../src/mmt-users';
const fixtures:Awaited<ReturnType<typeof ministryFixture>>[]=[];
afterEach(()=>fixtures.splice(0).forEach(f=>f.sqlite.close()));
const person={username:'portalperson',first_name:'Alice',last_name:'Example',email:'alice@example.test',phone:'9725550123',country:'US'};
const access=(enabled=true)=>({hs:{enabled,permissions:{contacts:'read'}}});
async function setup(through?:string){const f=await ministryFixture(through);fixtures.push(f);Object.assign(f.env,{ADMIN_SESSION_SECRET:'test-secret',ALLOWED_ORIGINS:'http://localhost:4188'});const call=(path:string,b?:unknown,m?:string)=>handleAdminRequest(f.request(path,b,m),f.env,path);return {...f,call};}
function contact(f:Awaited<ReturnType<typeof setup>>,name='Alice',email=person.email,phone=person.phone){const id=crypto.randomUUID();f.sqlite.prepare("INSERT INTO people(id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,phone,phone_normalized,created_at,updated_at) VALUES(?,?,'Example',?,'example',?,?,?,?, 'now','now')").run(id,name,name.toLowerCase(),email,email,phone,phone);return id;}
async function create(f:Awaited<ReturnType<typeof setup>>,extra:Record<string,unknown>={}){const r=(await f.call('/admin/account/users',{...person,memberships:access(),...extra}))!;expect(r.status,await r.clone().text()).toBe(201);return (await r.json() as any).user;}
function types(f:Awaited<ReturnType<typeof setup>>,id:string){return f.sqlite.prepare('SELECT contact_type FROM contact_types WHERE person_id=? ORDER BY contact_type').all(id).map(r=>r.contact_type);}
it('creates a contact for a new HS account and manages the category through suspend, restore, revoke, and delete',async()=>{
 const f=await setup(),u=await create(f),id=u.hs_person_id;expect(id).toBeTruthy();expect(types(f,id)).toEqual(['portal_access']);
 f.sqlite.prepare("INSERT INTO contact_types VALUES(?,'board_member','now'),(?,'donor','now')").run(id,id);
 let revision=u.revision;
 for(const [body,active] of [[{status:'disabled'},false],[{status:'active'},true],[{memberships:access(false)},false],[{memberships:access()},true]] as const){expect((await f.call('/admin/account/users/'+u.id,{revision:revision++,...body},'PUT'))!.status).toBe(200);expect(types(f,id)).toEqual(active?['board_member','donor','portal_access']:['board_member','donor']);}
 expect((await f.call('/admin/account/users/'+u.id,{revision,confirmUsername:person.username},'DELETE'))!.status).toBe(200);expect(types(f,id)).toEqual(['board_member','donor']);expect(f.sqlite.prepare('SELECT id FROM people WHERE id=?').get(id)).toBeTruthy();
});
it('links an exact existing person, preserves details and categories, and keeps giving separate',async()=>{
 const f=await setup(),id=contact(f);f.sqlite.prepare("INSERT INTO contact_types VALUES(?,'volunteer','now'),(?,'potential_donor','now')").run(id,id);
 const before=f.sqlite.prepare('SELECT * FROM people WHERE id=?').get(id);const u=await create(f);expect(u.hs_person_id).toBe(id);expect(types(f,id)).toEqual(['portal_access','potential_donor','volunteer']);expect(f.sqlite.prepare('SELECT * FROM people WHERE id=?').get(id)).toEqual(before);expect(f.sqlite.prepare('SELECT count(*) n FROM people').get()?.n).toBe(1);expect(f.sqlite.prepare('SELECT count(*) n FROM ledger_entries').get()?.n).toBe(0);
});
it('requires a choice for shared email or phone and makes no partial changes',async()=>{
 const f=await setup(),alice=contact(f),bob=contact(f,'Bob');
 const r=await f.call('/admin/account/users',{...person,memberships:access()});expect(r!.status).toBe(409);expect(f.sqlite.prepare("SELECT count(*) n FROM mmt_users WHERE username='portalperson'").get()?.n).toBe(0);expect(types(f,alice)).toEqual([]);expect(types(f,bob)).toEqual([]);
 // Router path excludes query, as it does in the real Worker.
 const request=f.request('/admin/account/contact-matches?search=alice');const response=await handleAdminRequest(request,f.env,'/admin/account/contact-matches');expect((await response!.json() as any).contacts).toHaveLength(2);
 const u=await create(f,{hsContactId:alice});expect(u.hs_person_id).toBe(alice);expect(types(f,bob)).toEqual([]);
});
it('allows an explicit separate person, but refuses a contact already associated with an account',async()=>{
 const f=await setup(),bob=contact(f,'Bob');const u=await create(f,{hsContactId:'new'});expect(u.hs_person_id).not.toBe(bob);
 expect((await f.call('/admin/account/users',{...person,username:'second',email:'second@example.test',hsContactId:u.hs_person_id,memberships:access()}))!.status).toBe(409);
});
it('protects the managed category from ordinary contact edits and direct category forgery',async()=>{
 const f=await setup(),u=await create(f),id=u.hs_person_id;
 const path='/admin/people/'+id;expect((await f.call(path,{firstName:'Alice',lastName:'Example',email:person.email,phone:person.phone,contactTypes:['board_member']},'PUT'))!.status).toBe(200);expect(types(f,id)).toEqual(['board_member','portal_access']);
 const other=contact(f,'Bob','bob@example.test','9725550166');expect(()=>f.sqlite.prepare("INSERT INTO contact_types VALUES(?,'portal_access','now')").run(other)).toThrow(/managed/);
 expect(()=>f.sqlite.prepare("UPDATE contact_types SET person_id=? WHERE person_id=? AND contact_type='portal_access'").run(other,id)).toThrow(/managed/);
 expect((await f.call('/admin/people/'+other,{firstName:'Bob',lastName:'Example',email:'bob@example.test',contactTypes:['portal_access','board_member']},'PUT'))!.status).toBe(200);expect(types(f,other)).toEqual(['board_member']);
});
it('rolls back contact creation on a duplicate user or stale edit',async()=>{
 const f=await setup();const u=await create(f,{memberships:{csm:{enabled:true,permissions:{}}}});expect(u.hs_person_id).toBeNull();expect(f.sqlite.prepare('SELECT count(*) n FROM people').get()?.n).toBe(0);
 expect((await f.call('/admin/account/users',{...person,memberships:access()}))!.status).toBe(409);expect(f.sqlite.prepare('SELECT count(*) n FROM people').get()?.n).toBe(0);
 expect((await f.call('/admin/account/users/'+u.id,{revision:999,memberships:access()},'PUT'))!.status).toBe(409);expect(f.sqlite.prepare('SELECT count(*) n FROM people').get()?.n).toBe(0);
 expect((await f.call('/admin/account/users/'+u.id,{revision:u.revision,memberships:access()},'PUT'))!.status).toBe(200);expect(f.sqlite.prepare('SELECT count(*) n FROM people').get()?.n).toBe(1);
});
it('associates contacts when approving a new access request',async()=>{
 const f=await setup(),id=contact(f);const path='/public/account/request';expect((await handleAccountPublic(f.request(path,person),f.env,path))!.status).toBe(202);
 const r=f.sqlite.prepare('SELECT id FROM mmt_access_requests').get()!;expect((await f.call('/admin/account/requests/'+r.id,{action:'approve',memberships:access(),hsContactId:id},'PUT'))!.status).toBe(200);expect(types(f,id)).toEqual(['portal_access']);
});
it('preserves old data and donor triggers when migrating and links only unambiguous old identities',async()=>{
 const f=await setup('0044_contact_relationships.sql'),id=contact(f),ambiguous=contact(f,'Bob','bob@example.test');f.sqlite.prepare('UPDATE people SET approved_duplicate=1 WHERE id=?').run(ambiguous);contact(f,'Bob','bob@example.test');
 f.sqlite.prepare("INSERT INTO contact_types VALUES(?,'donor','old')").run(id);
 f.sqlite.prepare("INSERT INTO mmt_users(id,username,first_name,last_name,email,phone,country,registered_at,updated_at) VALUES('alice','alice','Alice','Example',?,'9725550123','US','old','old'),('bob','bob','Bob','Example','bob@example.test','9725550123','US','old','old')").run(person.email);
 f.sqlite.exec(readFileSync(new URL('../migrations/0045_portal_contact_access.sql',import.meta.url),'utf8'));
 expect(f.sqlite.prepare("SELECT hs_person_id FROM mmt_users WHERE id='alice'").get()?.hs_person_id).toBe(id);expect(f.sqlite.prepare("SELECT hs_person_id FROM mmt_users WHERE id='bob'").get()?.hs_person_id).toBeNull();expect(types(f,id)).toEqual(['donor','portal_access']);expect(types(f,ambiguous)).toEqual([]);expect(f.sqlite.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name LIKE '%gift_contact%'").get()?.n).toBe(5);expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

it('associates the chosen contact when an existing CSM account receives HS access by approval',async()=>{
 const f=await setup(),alice=contact(f),bob=contact(f,'Bob');const u=await create(f,{memberships:{csm:{enabled:true,permissions:{}}}});
 await handleAccountPublic(f.request('/public/account/request',person),f.env,'/public/account/request');
 const r=f.sqlite.prepare('SELECT id FROM mmt_access_requests').get()!;
 expect((await f.call('/admin/account/requests/'+r.id,{action:'approve',user_id:u.id,identityVerified:true,hsContactId:alice,memberships:access()},'PUT'))!.status).toBe(200);
 expect(f.sqlite.prepare('SELECT hs_person_id,hs_access,csm_access FROM mmt_users WHERE id=?').get(u.id)).toEqual({hs_person_id:alice,hs_access:1,csm_access:1});expect(types(f,alice)).toEqual(['portal_access']);expect(types(f,bob)).toEqual([]);
});
it('denies contact lookup without administrator access and protects account-linked contacts from deletion',async()=>{
 const f=await setup(),u=await create(f);const path='/admin/account/contact-matches';
 expect((await handleAdminRequest(new Request('http://localhost:4188'+path+'?search=Alice'),f.env,path))!.status).toBe(401);
 expect((await f.call('/admin/people/'+u.hs_person_id,{},'DELETE'))!.status).toBe(409);
 f.sqlite.prepare('UPDATE admin_sessions SET user_id=?').run(u.id);f.sqlite.prepare('UPDATE mmt_users SET must_change_password=0 WHERE id=?').run(u.id);
 expect((await f.call(path))!.status).toBe(403);
});
