import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import worker, { passwordHash, digest } from '../src/index.mjs';
import {sqliteDatabase} from '../src/sqlite-database.mjs';
import {storageFor} from './sqlite-fixture.mjs';
// Run the actual migration and queries, with D1's prepare/batch interface over SQLite.
function fixture() {
  const sql = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort()) sql.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  const db = process.env.PRAYER_TEST_STORAGE==='durable' ? sqliteDatabase(storageFor(sql)) : { prepare(query) {
    let args = []; const statement = { bind(...values) { args = values; return statement; },
      async first() { return sql.prepare(query).get(...args) || null; },
      async all() { return { results: sql.prepare(query).all(...args) }; },
      async run() { return { meta: { changes: Number(sql.prepare(query).run(...args).changes) } }; } }; return statement;
  }, async batch(statements) { sql.exec('BEGIN'); try { const result = []; for (const statement of statements) result.push(await statement.run()); sql.exec('COMMIT'); return result; } catch(error) { sql.exec('ROLLBACK'); throw error; } } };
  const env = { DB: db, ASSETS: { fetch: async () => new Response('public shell') } };
  async function add(id, role = 'member') {
    sql.prepare('INSERT INTO users (id,email,name,password,role,created_at) VALUES (?,?,?,?,?,?)').run(id,`${id}@example.com`,id,'unused',role,Date.now());
    sql.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(await digest(id),id,`csrf-${id}`,Date.now()+60000);
  }
  async function request(path, who, data, method) {
    const headers = { Origin:'https://prayer.example.com' };
    if (who) { headers.Cookie = `__Host-hs_prayer=${who}`; headers['X-CSRF-Token'] = `csrf-${who}`; }
    if (data) headers['Content-Type'] = 'application/json';
    return worker.fetch(new Request(`https://prayer.example.com/api/${path}`, { method: method || (data ? 'POST' : 'GET'),headers,body:data ? JSON.stringify(data) : undefined }),env);
  }
  return {sql,add,request,env};
}
const post = (audience, recipients = [], kind = 'request') => ({ title:'Please pray', body:'Private details', audience, recipients, kind });
test('all visibility modes: owner/admin access, selected membership and outsiders; following grants no access', async () => {
  const f = fixture(); for (const id of ['author','friend','outsider']) await f.add(id); await f.add('admin','admin');
  for (const who of ['friend','outsider','admin']) assert.equal((await f.request('follow',who,{userId:'author',following:true,requests:true,updates:false,answered:true})).status,200);
  for (const audience of ['members','selected','admins']) assert.equal((await f.request('posts','author',post(audience,['friend']))).status,201);
  for (const [who,count] of [['author',3],['admin',3],['friend',2],['outsider',1]]) {
    const rows = await (await f.request('posts',who)).json(); assert.equal(rows.posts.length,count,who);
  }
  for (const [who,count] of [['admin',3],['friend',2],['outsider',1]]) assert.equal((await (await f.request('notifications',who)).json()).length,count);
  assert.equal((await f.request('posts')).status,401);
  assert.equal((await f.request('notifications')).status,401);
  assert.equal((await f.request('people')).status,401);
  const directory = await (await f.request('people','friend')).json(); assert.ok(directory.every(x => !('email' in x) && !('password' in x)));
});
test('preferences apply by type, mark-read is scoped and delete cascades notifications', async () => {
  const f = fixture(); for (const id of ['author','friend','outsider']) await f.add(id);
  await f.request('follow','friend',{userId:'author',following:true,requests:false,updates:true,answered:false});
  for (const kind of ['request','update','answered']) await f.request('posts','author',post('members',[],kind));
  let notes = await (await f.request('notifications','friend')).json(); assert.equal(notes.length,1); assert.equal(notes[0].kind,'update');
  await f.request('notifications/read','outsider',{}); notes = await (await f.request('notifications','friend')).json(); assert.equal(notes[0].read_at,null);
  await f.request('notifications/read','friend',{}); notes = await (await f.request('notifications','friend')).json(); assert.ok(notes[0].read_at);
  const id = notes[0].post_id;
  assert.equal((await f.request(`posts/${id}`,'outsider',null,'DELETE')).status,404);
  assert.equal((await f.request(`posts/${id}`,'author',null,'DELETE')).status,200);
  assert.equal((await (await f.request('notifications','friend')).json()).length,0);
  await f.request('follow','friend',{userId:'author',following:false}); await f.request('posts','author',post('members',[],'update'));
  assert.equal((await (await f.request('notifications','friend')).json()).length,0);
});
test('CSRF, origin, admin boundaries and invalid recipients fail closed', async () => {
  const f = fixture(); await f.add('member'); await f.add('admin','admin');
  assert.equal((await f.request('invites','member',{email:'person@example.com',role:'admin'})).status,403);
  for (const [origin,csrf] of [['https://evil.example','csrf-member'],['https://prayer.example.com','wrong']]) {
    const res = await worker.fetch(new Request('https://prayer.example.com/api/posts',{method:'POST',headers:{Origin:origin,Cookie:'__Host-hs_prayer=member','X-CSRF-Token':csrf,'Content-Type':'application/json'},body:JSON.stringify(post('members'))}),f.env); assert.equal(res.status,403);
  }
  for (const data of [post('public'),post('selected'),post('selected',['missing']),{...post('members'),kind:'unknown'}]) assert.equal((await f.request('posts','member',data)).status,400);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM posts').get().n,0);
});
test('invitations are admin-only, hashed, single-use, expiring, revocable and cannot escalate role', async () => {
  const f = fixture(); await f.add('admin','admin');
  const invite = await (await f.request('invites','admin',{email:'join@example.com',role:'member'})).json();
  const raw = new URL(invite.link).hash.slice(8); assert.equal(raw.length,64);
  assert.notEqual(f.sql.prepare('SELECT token_hash FROM invites').get().token_hash,raw);
  const data = {token:raw,name:'New person',password:'long and private password',role:'admin'};
  const result = await f.request('accept',null,data); assert.equal(result.status,200); assert.equal((await result.json()).user.role,'member');
  assert.match(result.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
  assert.equal((await f.request('accept',null,data)).status,400);
  for (const operation of ['expire','revoke']) {
    const created = await (await f.request('invites','admin',{email:`${operation}@example.com`,role:'member'})).json();
    if (operation === 'expire') f.sql.prepare('UPDATE invites SET expires_at=0 WHERE id=?').run(created.id);
    else await f.request(`invites/${created.id}`,'admin',null,'DELETE');
    assert.equal((await f.request('accept',null,{...data,token:new URL(created.link).hash.slice(8)})).status,400);
  }
});
test('password verification, throttling, session expiry and logout', async () => {
  const f = fixture(); await f.add('member'); f.sql.prepare('UPDATE users SET password=?').run(await passwordHash('a sufficiently long password'));
  assert.equal((await f.request('login',null,{email:'member@example.com',password:'incorrect'})).status,401);
  const login = await f.request('login',null,{email:'member@example.com',password:'a sufficiently long password'}); assert.equal(login.status,200);
  assert.equal((await f.request('logout','member',{})).status,200); assert.equal((await f.request('me','member')).status,401);
  await f.add('expired'); f.sql.prepare('UPDATE sessions SET expires_at=0 WHERE user_id=?').run('expired'); assert.equal((await f.request('me','expired')).status,401);
  for(let i=0;i<10;i++) await f.request('login',null,{email:'missing@example.com',password:'incorrect'});
  assert.equal((await f.request('login',null,{email:'missing@example.com',password:'incorrect'})).status,429);
});
test('feed filters and notification reads re-check visibility; response hardening and static allowlist', async () => {
  const f = fixture(); await f.add('a'); await f.add('b');
  await f.request('follow','b',{userId:'a',following:true,requests:true,updates:true,answered:true});
  const created = await (await f.request('posts','a',post('members',[],'answered'))).json();
  const filtered = await (await f.request('posts?kind=answered&following=1','b')).json(); assert.equal(filtered.posts.length,1);
  f.sql.prepare("UPDATE posts SET audience='admins' WHERE id=?").run(created.id);
  assert.equal((await (await f.request('notifications','b')).json()).length,0);
  assert.equal((await (await f.request('posts','b')).json()).posts.length,0);
  const res = await f.request('me','a'); assert.equal(res.headers.get('cache-control'),'no-store'); assert.match(res.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  const secret = await worker.fetch(new Request('https://prayer.example.com/.dev.vars'),f.env); assert.equal(secret.status,404);
});
test('pagination handles identical timestamps without losing or repeating posts', async () => {
  const f = fixture(); await f.add('a'); await f.add('b');
  const insert = f.sql.prepare('INSERT INTO posts (id,author_id,title,body,kind,audience,created_at) VALUES (?,?,?,?,?,?,?)');
  for (let i=0;i<55;i++) insert.run(`post-${String(i).padStart(3,'0')}`,'a','Prayer','Text','request','members',1000);
  insert.run('hidden','a','Restricted','Private','request','admins',2000);
  const page1 = await (await f.request('posts','b')).json(); assert.equal(page1.posts.length,50); assert.equal(page1.more,true);
  const page2 = await (await f.request(`posts?before=${encodeURIComponent(page1.cursor)}`,'b')).json(); assert.equal(page2.posts.length,5); assert.equal(page2.more,false);
  assert.equal(new Set([...page1.posts,...page2.posts].map(p=>p.id)).size,55);
});
async function makeGroup(f,owner='owner',discoverable=true) {
  const response = await f.request('groups',owner,{name:'Men’s Accountability',description:'Weekly encouragement and prayer.',category:'accountability',discoverable});
  assert.equal(response.status,201); return (await response.json()).id;
}
async function joinGroup(f,id,person,owner='owner') {
  assert.equal((await f.request(`groups/${id}/join`,person,{})).status,200);
  assert.equal((await f.request(`groups/${id}/members/${person}`,owner,{decision:'approve'})).status,200);
}
test('members create groups, request approval, and see only appropriate roster information',async()=>{
  const f=fixture(); for(const id of ['owner','member','outsider']) await f.add(id); await f.add('admin','admin');
  const id=await makeGroup(f);
  assert.equal((await f.request('groups')).status,401);
  let detail=await (await f.request(`groups/${id}`,'outsider')).json(); assert.deepEqual(detail.members,[]);
  await f.request(`groups/${id}/join`,'member',{});
  detail=await (await f.request(`groups/${id}`,'member')).json(); assert.equal(detail.membership,'pending'); assert.deepEqual(detail.members,[]);
  const listing=await (await f.request('groups','owner')).json(); assert.equal(listing[0].pending_count,1);
  assert.equal((await f.request(`groups/${id}/members/member`,'outsider',{decision:'approve'})).status,403);
  assert.equal((await f.request(`groups/${id}/members/member`,'member',{decision:'approve'})).status,403);
  assert.equal((await f.request(`groups/${id}/members/member`,'owner',{decision:'approve'})).status,200);
  detail=await (await f.request(`groups/${id}`,'member')).json(); assert.equal(detail.membership,'approved'); assert.equal(detail.members.length,2);
  assert.ok(detail.members.every(x=>!('email' in x)));
  assert.equal((await f.request(`groups/${id}/leave`,'owner',{})).status,409);
  assert.equal((await f.request(`groups/${id}/members/owner`,'admin',{decision:'remove'})).status,409);
});
test('group membership gates posting, reading and notifications; leaders do not bypass selected audiences',async()=>{
  const f=fixture(); for(const id of ['owner','author','friend','outsider','pending']) await f.add(id); await f.add('admin','admin');
  const id=await makeGroup(f); await joinGroup(f,id,'author'); await joinGroup(f,id,'friend');
  await f.request(`groups/${id}/join`,'pending',{});
  for(const who of ['outsider','pending']) {
    await f.request('follow',who,{userId:'author',following:true,requests:true,updates:true,answered:true});
    assert.equal((await f.request('posts',who,{...post('members'),groupId:id})).status,403);
  }
  assert.equal((await f.request('posts','author',{...post('selected',['outsider']),groupId:id})).status,400);
  for(const audience of ['members','selected','admins']) assert.equal((await f.request('posts','author',{...post(audience,['friend']),groupId:id})).status,201);
  for(const [who,count] of [['author',3],['admin',3],['owner',1],['friend',2],['outsider',0],['pending',0]]) {
    assert.equal((await (await f.request(`posts?group=${id}`,who)).json()).posts.length,count,who);
  }
  for(const [who,count] of [['owner',1],['friend',2],['outsider',0],['pending',0]]) assert.equal((await (await f.request('notifications',who)).json()).length,count,who);
  assert.equal((await f.request(`groups/${id}/members/friend`,'owner',{decision:'remove'})).status,200);
  assert.equal((await (await f.request(`posts?group=${id}`,'friend')).json()).posts.length,0);
  assert.equal((await (await f.request('notifications','friend')).json()).length,0);
  assert.equal((await f.request(`groups/${id}/join`,'friend',{})).status,403);
});
test('unlisted groups are hidden; leaving revokes access and rejoining needs fresh approval',async()=>{
  const f=fixture(); for(const id of ['owner','member','outsider']) await f.add(id); await f.add('admin','admin');
  const hidden=await makeGroup(f,'owner',false);
  assert.equal((await (await f.request('groups','outsider')).json()).length,0);
  for(const route of [`groups/${hidden}`,`groups/${hidden}/join`]) assert.equal((await f.request(route,'outsider',route.endsWith('join')?{}:undefined)).status,404);
  assert.equal((await (await f.request('groups','admin')).json()).length,1);
  const id=await makeGroup(f); await joinGroup(f,id,'member');
  await f.request('posts','owner',{...post('members'),groupId:id});
  assert.equal((await f.request(`groups/${id}/leave`,'member',{})).status,200);
  assert.equal((await (await f.request('notifications','member')).json()).length,0);
  await f.request(`groups/${id}/join`,'member',{});
  assert.equal((await (await f.request(`posts?group=${id}`,'member')).json()).posts.length,0);
  await f.request(`groups/${id}/members/member`,'admin',{decision:'approve'});
  assert.equal((await (await f.request(`posts?group=${id}`,'member')).json()).posts.length,1);
});
test('group alerts respect type preferences and deduplicate followers; customer settings stay independent',async()=>{
  const f=fixture(); await f.add('owner'); await f.add('member');
  const id=await makeGroup(f); await joinGroup(f,id,'member');
  await f.request('follow','member',{userId:'owner',following:true,requests:false,updates:true,answered:false});
  await f.request(`groups/${id}/preferences`,'member',{requests:false,updates:true,answered:false});
  for(const kind of ['request','update','answered']) await f.request('posts','owner',{...post('members',[],kind),groupId:id});
  const rows=await (await f.request('notifications','member')).json(); assert.equal(rows.length,1); assert.equal(rows[0].kind,'update');
  f.env.PORTAL_ORGANIZATION_NAME='Example Church'; f.env.PORTAL_ALLOW_MEMBER_GROUPS='false';
  const config=await (await f.request('site')).json(); assert.equal(config.organizationName,'Example Church'); assert.equal(config.allowMemberGroups,false);
  assert.equal((await f.request('groups','member',{name:'New',description:'Test',category:'prayer',discoverable:true})).status,403);
  assert.equal((await (await f.request('groups','member')).json()).length,1);
});
test('unlisted group invitations require acceptance and can be revoked without granting prayer access',async()=>{
  const f=fixture(); for(const id of ['owner','member','outsider']) await f.add(id);
  const id=await makeGroup(f,'owner',false);
  await f.request('posts','owner',{...post('members'),groupId:id});
  assert.equal((await f.request(`groups/${id}/members`,'outsider',{userId:'member'})).status,404);
  assert.equal((await f.request(`groups/${id}/members`,'owner',{userId:'member'})).status,200);
  const listed=await (await f.request('groups','member')).json(); assert.equal(listed[0].membership,'invited');
  assert.equal((await (await f.request(`groups/${id}`,'member')).json()).members.length,0);
  assert.equal((await (await f.request(`posts?group=${id}`,'member')).json()).posts.length,0);
  assert.equal((await f.request(`groups/${id}/members/member`,'owner',{decision:'approve'})).status,409);
  assert.equal((await f.request(`groups/${id}/members/member`,'owner',{decision:'remove'})).status,200);
  assert.equal((await f.request(`groups/${id}/join`,'member',{})).status,404);
  assert.equal((await f.request(`groups/${id}/members`,'owner',{userId:'member'})).status,200);
  assert.equal((await f.request(`groups/${id}/join`,'member',{})).status,200);
  assert.equal((await (await f.request(`posts?group=${id}`,'member')).json()).posts.length,1);
});
test('first-admin setup is single-use, expires, and cannot initialize an existing organization',async()=>{
  const f=fixture(),raw='a'.repeat(64);
  f.sql.prepare('INSERT INTO initial_admin_setup VALUES (1,?,?,?,NULL)').run('brent@example.com',await digest(raw),Date.now()+60000);
  assert.equal((await f.request('accept',null,{token:'b'.repeat(64),name:'Wrong',password:'a sufficiently long password'})).status,400);
  const accepted=await f.request('accept',null,{token:raw,name:'Brent',password:'a sufficiently long password',role:'member'});
  assert.equal(accepted.status,200); assert.equal((await accepted.json()).user.role,'admin');
  assert.ok(f.sql.prepare('SELECT used_at FROM initial_admin_setup').get().used_at);
  assert.equal((await f.request('accept',null,{token:raw,name:'Replay',password:'a sufficiently long password'})).status,400);
  const existing=fixture(); await existing.add('member');
  existing.sql.prepare('INSERT INTO initial_admin_setup VALUES (1,?,?,?,NULL)').run('initial@example.com',await digest(raw),Date.now()+60000);
  assert.equal((await existing.request('accept',null,{token:raw,name:'Blocked',password:'a sufficiently long password'})).status,400);
  assert.equal(existing.sql.prepare('SELECT count(*) n FROM users').get().n,1);
  const expired=fixture(); expired.sql.prepare('INSERT INTO initial_admin_setup VALUES (1,?,?,0,NULL)').run('expired@example.com',await digest(raw));
  assert.equal((await expired.request('accept',null,{token:raw,name:'Expired',password:'a sufficiently long password'})).status,400);
});
test('health verifies required schema and reports the deployed version without exposing account data',async()=>{
  const f=fixture(); f.env.RELEASE_VERSION='release-123'; f.env.ENVIRONMENT='test';
  const health=await (await f.request('health')).json();
  assert.deepEqual(health,{service:'hope-sojourns-prayer',version:'release-123',environment:'test',ready:true});
  f.sql.exec('DROP TABLE initial_admin_setup'); assert.equal((await f.request('health')).status,503);
});
test('admin routes reject ordinary users; all restricted content is available only to admins',async()=>{
 const f=fixture();await f.add('admin','admin');await f.add('member');
 await f.request('posts','member',post('admins'));
 for(const endpoint of ['users','posts','groups','audit']) {
  assert.equal((await f.request(`admin/${endpoint}`)).status,401);
  assert.equal((await f.request(`admin/${endpoint}`,'member')).status,403);
  assert.equal((await f.request(`admin/${endpoint}`,'admin')).status,200);
 }
 assert.equal((await (await f.request('admin/posts','admin')).json()).items.length,1);
 assert.equal((await f.request('admin/users/admin/delete','admin',{reason:'Self',confirmation:'DELETE'})).status,409);
 assert.equal((await f.request('admin/users/member/suspend','member',{reason:'Attack'})).status,403);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM admin_audit').get().n,0);
});
test('suspension revokes sessions, prevents login, and reactivation requires a fresh login',async()=>{
 const f=fixture();await f.add('admin','admin');await f.add('member');
 f.sql.prepare('UPDATE users SET password=? WHERE id=?').run(await passwordHash('member valid password'),'member');
 assert.equal((await f.request('admin/users/member/suspend','admin',{reason:'Review required'})).status,200);
 assert.equal((await f.request('me','member')).status,401);
 assert.equal((await f.request('login',null,{identifier:'member@example.com',password:'member valid password'})).status,401);
 assert.equal((await f.request('admin/users/member/reactivate','admin',{reason:'Review completed'})).status,200);
 assert.equal((await f.request('me','member')).status,401);
 assert.equal((await f.request('login',null,{identifier:'member@example.com',password:'member valid password'})).status,200);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM admin_audit').get().n,2);
});
test('unlock clears the canonical email lock shared by username/email sign-in',async()=>{
 const f=fixture();await f.add('admin','admin');await f.add('member');f.sql.prepare("UPDATE users SET username='membername' WHERE id='member'").run();
 for(let i=0;i<10;i++) await f.request('login',null,{identifier:i%2?'membername':'member@example.com',password:'wrong'});
 assert.equal((await f.request('login',null,{identifier:'membername',password:'wrong'})).status,429);
 assert.equal((await f.request('admin/users/member/unlock','admin',{reason:'Confirmed account owner'})).status,200);
 assert.equal((await f.request('login',null,{identifier:'membername',password:'wrong'})).status,401);
});
test('invitations always create regular members and admins promote explicitly after enrollment',async()=>{
 const f=fixture();await f.add('owner','admin');f.sql.prepare("UPDATE users SET is_owner=1 WHERE id='owner'").run();
 assert.equal((await f.request('invites','owner',{email:'person@example.com',role:'admin'})).status,400);
 const created=await (await f.request('invites','owner',{email:'person@example.com'})).json();
 // Even legacy or externally altered invitation metadata cannot grant admin.
 f.sql.prepare("UPDATE invites SET role='admin'").run();
 const response=await f.request('accept',null,{token:new URL(created.link).hash.slice(8),name:'Person',username:'personname',password:'a secure person password',role:'admin'});
 assert.equal(response.status,200);const joined=await response.json();assert.equal(joined.user.role,'member');assert.equal(joined.user.owner,false);
 assert.equal((await f.request(`admin/users/${joined.user.id}/role`,'owner',{role:'admin',reason:'Delegated portal administration'})).status,200);
 const login=await (await f.request('login',null,{identifier:'PERSONNAME',password:'a secure person password'})).json();assert.equal(login.user.role,'admin');
 assert.equal((await f.request('admin/users/owner/role',null,{role:'member',reason:'Attempt'})).status,401);
 await f.add('otheradmin','admin');
 for(const action of ['delete','suspend','role','password-reset','username']) assert.equal((await f.request(`admin/users/owner/${action}`,'otheradmin',{reason:'Attempt',role:'member',confirmation:'DELETE',username:'replacement'})).status,409);
});
test('password-reset links are hashed, single-use, and revoke sessions without changing username',async()=>{
 const f=fixture();await f.add('admin','admin');await f.add('member');f.sql.prepare("UPDATE users SET username='partner' WHERE id='member'").run();
 const result=await (await f.request('admin/users/member/password-reset','admin',{reason:'Account owner requested recovery'})).json();
 const raw=new URL(result.link).hash.slice(7);assert.equal(raw.length,64);assert.notEqual(f.sql.prepare('SELECT token_hash FROM password_resets').get().token_hash,raw);
 assert.equal((await f.request('me','member')).status,401);
 assert.equal((await f.request('reset-password',null,{token:raw,password:'new private member password'})).status,200);
 assert.equal((await f.request('reset-password',null,{token:raw,password:'another member password'})).status,400);
 assert.equal((await f.request('login',null,{identifier:'partner',password:'new private member password'})).status,200);
 const second=await (await f.request('admin/users/member/password-reset','admin',{reason:'Second request'})).json();f.sql.prepare('UPDATE password_resets SET expires_at=0').run();
 assert.equal((await f.request('reset-password',null,{token:new URL(second.link).hash.slice(7),password:'another member password'})).status,400);
});
test('account deletion removes their prayers, transfers groups, anonymizes credentials and retains audit',async()=>{
 const f=fixture();await f.add('admin','admin');await f.add('member');await f.add('friend');
 const group=await makeGroup(f,'member');await joinGroup(f,group,'friend','member');
 await f.request('posts','member',{...post('members'),groupId:group});await f.request('posts','friend',{...post('members'),groupId:group});
 assert.equal((await f.request('admin/users/member/delete','admin',{reason:'Account removal'})).status,400);
 assert.equal((await f.request('admin/users/member/delete','admin',{reason:'Account removal',confirmation:'DELETE'})).status,200);
 const deleted=f.sql.prepare("SELECT * FROM users WHERE id='member'").get();assert.equal(deleted.status,'deleted');assert.equal(deleted.name,'Deleted member');assert.notEqual(deleted.email,'member@example.com');assert.equal(deleted.password,'deleted');
 assert.equal(f.sql.prepare('SELECT owner_id FROM groups WHERE id=?').get(group).owner_id,'admin');
 assert.equal(f.sql.prepare('SELECT count(*) n FROM posts').get().n,1);assert.equal((await f.request('me','member')).status,401);
 assert.ok(!(await (await f.request('people','friend')).json()).some(person=>person.id==='member'));
 assert.equal(f.sql.prepare('SELECT count(*) n FROM admin_audit').get().n,1);
});
test('moderation deletes restricted posts and groups without retaining private content in audit',async()=>{
 const f=fixture();await f.add('admin','admin');await f.add('member');const group=await makeGroup(f,'member');
 const created=await (await f.request('posts','member',{...post('admins'),groupId:group})).json();
 assert.equal((await f.request(`admin/posts/${created.id}/delete`,'member',{reason:'Attempt',confirmation:'DELETE'})).status,403);
 assert.equal((await f.request(`admin/posts/${created.id}/delete`,'admin',{reason:'Inappropriate content',confirmation:'DELETE'})).status,200);
 await f.request('posts','member',{...post('members'),groupId:group});
 assert.equal((await f.request(`admin/groups/${group}/delete`,'admin',{reason:'Harmful group',confirmation:'DELETE'})).status,200);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM groups').get().n,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM posts').get().n,0);
 const audit=await (await f.request('admin/audit','admin')).json();assert.equal(audit.length,2);assert.ok(audit.every(entry=>!('body' in entry)&&!('password' in entry)));
});
test('profiles accept usernames and optional fields without exposing private data or allowing privilege changes',async()=>{
 const f=fixture();await f.add('member');await f.add('friend');
 const profile={username:'prayer.partner',name:'A Prayer Partner',phone:'+1 972 555 0101',timezone:'America/Chicago',bio:'Glad to pray with you.',notify_requests:false,notify_updates:true,notify_answered:true,role:'admin',status:'active',is_owner:1,email:'changed@example.com'};
 const response=await f.request('profile','member',profile);assert.equal(response.status,200);const saved=(await response.json()).user;
 assert.equal(saved.username,'prayer.partner');assert.equal(saved.email,'member@example.com');assert.equal(saved.role,'member');assert.equal(saved.owner,false);
 const directory=await (await f.request('people','friend')).json(),person=directory.find(x=>x.id==='member');assert.equal(person.bio,profile.bio);assert.equal(person.username,profile.username);assert.ok(!('phone' in person)&&!('email' in person)&&!('timezone' in person));
 assert.equal((await f.request('profile','friend',{...profile,username:'PRAYER.PARTNER'})).status,400);
 assert.equal((await f.request('profile','member',{...profile,username:'friend@example.com'})).status,400);
 assert.equal((await f.request('profile','member',{...profile,username:'admin'})).status,400);
 assert.equal((await f.request('profile','member',{...profile,timezone:'Invalid/TimeZone'})).status,400);
 await f.request('follow','member',{userId:'friend',following:true,requests:true,updates:true,answered:true});
 await f.request('posts','friend',post('members'));assert.equal((await (await f.request('notifications','member')).json()).length,0);
 await f.request('posts','friend',post('members',[],'update'));assert.equal((await (await f.request('notifications','member')).json()).length,1);
});
test('a stale admin session cannot act after its account is suspended mid-request',async()=>{
 const f=fixture();await f.add('a','admin');await f.add('b','admin');
 const prepare=f.env.DB.prepare.bind(f.env.DB);let intercepted=false;
 f.env.DB.prepare=query=>{
  const statement=prepare(query);
  if(query.includes('SELECT u.*,s.csrf') && !intercepted) {
   const first=statement.first.bind(statement);statement.first=async()=>{const result=await first();intercepted=true;f.sql.prepare("UPDATE users SET status='suspended' WHERE id='b'").run();return result;};
  }
  return statement;
 };
 assert.equal((await f.request('admin/users/a/suspend','b',{reason:'Stale action'})).status,409);
 assert.equal(f.sql.prepare("SELECT status FROM users WHERE id='a'").get().status,'active');
 assert.equal(f.sql.prepare('SELECT count(*) n FROM admin_audit').get().n,0);
});
test('a failed account-deletion batch rolls back group transfer, audit, and account changes',async()=>{
 const f=fixture();await f.add('admin','admin');await f.add('member');const group=await makeGroup(f,'member');
 await f.request('posts','member',post('members'));
 f.sql.exec("CREATE TRIGGER reject_post_delete BEFORE DELETE ON posts BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");
 assert.equal((await f.request('admin/users/member/delete','admin',{reason:'Remove',confirmation:'DELETE'})).status,500);
 assert.equal(f.sql.prepare("SELECT status FROM users WHERE id='member'").get().status,'active');
 assert.equal(f.sql.prepare('SELECT owner_id FROM groups WHERE id=?').get(group).owner_id,'member');
 assert.equal(f.sql.prepare('SELECT count(*) n FROM admin_audit').get().n,0);
});

const resourceData=(changes={})=>({title:'A helpful resource',creator:'A speaker',description:'Encouragement for the journey',url:'https://example.com/resource',category_id:'books',visible:true,featured:false,sort_order:30,tags:['#Faith','spiritual growth','faith'],reason:'Curate the library',...changes});
test('resource library seeds books and categories; authentication and admin permissions protect all writes',async()=>{
 const f=fixture();await f.add('member');await f.add('admin','admin');
 for(const path of ['resources','resource-categories','admin/resources','admin/resource-categories']) assert.equal((await f.request(path)).status,401);
 const library=await (await f.request('resources','member')).json();assert.equal(library.total,3);assert.equal(library.items[0].creator,'John Eldredge');assert.equal(library.items[1].creator,'Joshua Harris');assert.equal(library.items[2].id,'connection-codes');assert.ok(library.items.every(item=>item.description.split(/\s+/).length>=65 && item.has_image));
 assert.equal((await (await f.request('resource-categories','member')).json()).length,12);
 for(const [path,data] of [['admin/resources',resourceData()],['admin/resource-categories',{name:'Counseling',sort_order:5,reason:'Add category'}],['admin/resources/wild-at-heart/delete',{revision:1,reason:'Remove',confirmation:'DELETE'}]]) assert.equal((await f.request(path,'member',data)).status,403);
 for(const [origin,csrf] of [['https://evil.example','csrf-admin'],['https://prayer.example.com','wrong']]) {
  const response=await worker.fetch(new Request('https://prayer.example.com/api/admin/resources',{method:'POST',headers:{Origin:origin,Cookie:'__Host-hs_prayer=admin','X-CSRF-Token':csrf,'Content-Type':'application/json'},body:JSON.stringify(resourceData())}),f.env);assert.equal(response.status,403);
 }
});
test('hidden resources and tags never leak through member searches, counts, filters or pagination',async()=>{
 const f=fixture();await f.add('member');await f.add('admin','admin');
 assert.equal((await f.request('admin/resources','admin',resourceData({title:'Hidden unique secret',visible:false,featured:true,tags:['secret-only']}))).status,201);
 for(const filter of ['', '?q=secret','?tag=secret-only','?featured=1','?category=books&q=secret']) {
  const result=await (await f.request(`resources${filter}`,'member')).json();assert.ok(result.items.every(row=>row.visible));assert.ok(!result.tags.includes('secret-only'));assert.equal(result.total,filter?0:3);
 }
 assert.equal((await f.request('resources?visibility=all','member')).status,403);
 assert.equal((await f.request('resources?visibility=hidden','member')).status,403);
 const admin=await (await f.request('admin/resources?visibility=hidden','admin')).json();assert.equal(admin.total,1);assert.equal(admin.items[0].title,'Hidden unique secret');assert.ok(admin.tags.includes('secret-only'));
});
test('resources support tags, combined filters, featured/manual ordering, categories and stable pagination',async()=>{
 const f=fixture();await f.add('member');await f.add('admin','admin');
 for(const data of [resourceData({title:'Zulu',sort_order:-10}),resourceData({title:'Alpha',featured:true,sort_order:10}),resourceData({title:'Beta',featured:true,sort_order:0})]) assert.equal((await f.request('admin/resources','admin',data)).status,201);
 let rows=await (await f.request('resources?category=books&tag=%23FAITH&featured=1&q=speaker','member')).json();assert.deepEqual(rows.items.map(r=>r.title),['Beta','Alpha']);assert.deepEqual(rows.items[0].tags,['faith','spiritual-growth']);
 rows=await (await f.request('resources?q=%23spiritual-growth&sort=title','member')).json();assert.deepEqual(rows.items.map(r=>r.title),['Alpha','Beta','Wild at Heart','Zulu']);
 assert.equal((await (await f.request('resources?q=Eldredge','member')).json()).total,1);
 assert.equal((await (await f.request('resources?category=music','member')).json()).total,0);
 for(let i=0;i<52;i++) f.sql.prepare('INSERT INTO resources (id,category_id,title,created_at,updated_at) VALUES (?,\'music\',?,1,1)').run(`r-${String(i).padStart(2,'0')}`,'Same title');
 const first=await (await f.request('resources?category=music','member')).json();assert.equal(first.items.length,50);assert.equal(first.more,true);
 const second=await (await f.request(`resources?category=music&offset=${first.nextOffset}`,'member')).json();assert.equal(second.items.length,2);assert.equal(second.more,false);assert.equal(new Set([...first.items,...second.items].map(r=>r.id)).size,52);
 for(const query of ['sort=invalid','offset=-1','offset=no','featured=2','visibility=invalid','tag=%25']) assert.equal((await f.request(`resources?${query}`,'member')).status,400);
});
test('resource edits, hide/promote/order changes and deletion are audited and reject outdated revisions',async()=>{
 const f=fixture();await f.add('admin','admin');await f.add('member');
 const created=await (await f.request('admin/resources','admin',resourceData())).json();assert.ok(created.id);
 const edit=resourceData({title:'Edited resource',visible:false,featured:true,sort_order:-20,tags:['#new-tag'],revision:1});
 assert.equal((await f.request(`admin/resources/${created.id}`,'admin',edit)).status,200);
 assert.equal((await f.request(`admin/resources/${created.id}`,'admin',edit)).status,409);
 assert.equal((await (await f.request('resources?q=Edited','member')).json()).total,0);
 const row=f.sql.prepare('SELECT * FROM resources WHERE id=?').get(created.id);assert.equal(row.revision,2);assert.equal(row.featured,1);assert.equal(row.sort_order,-20);
 assert.deepEqual(f.sql.prepare('SELECT tag FROM resource_tags WHERE resource_id=?').all(created.id).map(r=>r.tag),['new-tag']);
 const remove={revision:2,reason:'Outdated material',confirmation:'DELETE'};
 assert.equal((await f.request(`admin/resources/${created.id}/delete`,'admin',{...remove,confirmation:''})).status,400);
 assert.equal((await f.request(`admin/resources/${created.id}/delete`,'admin',remove)).status,200);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM resource_tags WHERE resource_id=?').get(created.id).n,0);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM resources WHERE id=?').get(created.id).n,0);
 assert.deepEqual(f.sql.prepare("SELECT action FROM admin_audit WHERE target_id=? ORDER BY rowid").all(created.id).map(r=>r.action),['create','edit','delete']);
});
test('category management permits custom names/order and blocks deletion until resources move',async()=>{
 const f=fixture();await f.add('admin','admin');
 const data={name:'Retreats',sort_order:-5,reason:'Add new category'};
 const created=await (await f.request('admin/resource-categories','admin',data)).json();assert.ok(created.id);
 assert.equal((await f.request('admin/resource-categories','admin',{...data,name:'RETREATS'})).status,409);
 assert.equal((await f.request(`admin/resource-categories/${created.id}`,'admin',{...data,name:'Retreat guides',revision:1})).status,200);
 assert.equal((await f.request(`admin/resource-categories/${created.id}`,'admin',{...data,revision:1})).status,409);
 assert.equal((await f.request('admin/resources','admin',resourceData({category_id:created.id}))).status,201);
 const remove={reason:'Consolidate',confirmation:'DELETE',revision:2};
 assert.equal((await f.request(`admin/resource-categories/${created.id}/delete`,'admin',remove)).status,409);
 f.sql.prepare("UPDATE resources SET category_id='books' WHERE category_id=?").run(created.id);
 assert.equal((await f.request(`admin/resource-categories/${created.id}/delete`,'admin',remove)).status,200);
 assert.equal((await f.request('admin/resources','admin',resourceData({category_id:created.id}))).status,409);
});
test('resource validation rejects unsafe links, excessive tags and invalid data without partial writes',async()=>{
 const f=fixture();await f.add('admin','admin');
 for(const changes of [{url:'javascript:alert(1)'},{url:'data:text/html,hi'},{url:'http://example.com'},{url:'https://user:pass@example.com'},{url:'not a url'},{tags:['bad/tag']},{tags:Array(21).fill('faith')},{title:''},{sort_order:1.5},{visible:'true'},{reason:''},{description:'a'.repeat(4001)}]) assert.equal((await f.request('admin/resources','admin',resourceData(changes))).status,400,JSON.stringify(changes));
 assert.equal(f.sql.prepare('SELECT count(*) n FROM resources').get().n,3);assert.equal(f.sql.prepare('SELECT count(*) n FROM admin_audit').get().n,0);
 assert.equal((await f.request('admin/resources','admin',resourceData({url:'',creator:'',description:'A prayer stored directly in the library.',category_id:'prayers',tags:[]}))).status,201);
});
test('resource mutations fail closed when admin authority changes and roll back failed tag writes',async()=>{
 const f=fixture();await f.add('admin','admin');
 const originalBatch=f.env.DB.batch.bind(f.env.DB);
 f.env.DB.batch=async statements=>{f.sql.prepare("UPDATE users SET role='member' WHERE id='admin'").run();return originalBatch(statements);};
 assert.equal((await f.request('admin/resources','admin',resourceData())).status,409);assert.equal(f.sql.prepare('SELECT count(*) n FROM resources').get().n,3);assert.equal(f.sql.prepare('SELECT count(*) n FROM admin_audit').get().n,0);
 f.env.DB.batch=originalBatch;f.sql.prepare("UPDATE users SET role='admin' WHERE id='admin'").run();
 f.sql.exec("CREATE TRIGGER fail_resource_tag BEFORE INSERT ON resource_tags WHEN NEW.tag='reject' BEGIN SELECT RAISE(ABORT,'rejected'); END;");
 assert.equal((await f.request('admin/resources','admin',resourceData({tags:['faith','reject']}))).status,500);assert.equal(f.sql.prepare('SELECT count(*) n FROM resources').get().n,3);assert.equal(f.sql.prepare('SELECT count(*) n FROM admin_audit').get().n,0);
});

test('members recommend actual resources privately; admins see a review count and approve explicitly',async()=>{
 const f=fixture();await f.add('member');await f.add('other');await f.add('admin','admin');
 const data=resourceData({title:'Recommended private title',tags:['recommend-only'],visible:true,featured:true,sort_order:-999,review_status:'approved'});
 const response=await f.request('resources/recommend','member',data);assert.equal(response.status,201,JSON.stringify(await response.clone().json()));
 const row=f.sql.prepare("SELECT * FROM resources WHERE title='Recommended private title'").get();assert.equal(row.review_status,'pending');assert.equal(row.visible,0);assert.equal(row.featured,0);assert.equal(row.sort_order,0);assert.equal(row.submitted_by,'member');
 for(const who of ['member','other']) {const list=await (await f.request('resources?q=Recommended','member')).json();assert.equal(list.total,0);assert.ok(!list.tags.includes('recommend-only'));assert.equal((await f.request(`resources/${row.id}/image`,who)).status,404);}
 assert.equal((await f.request('admin/resource-review-count','member')).status,403);assert.equal((await (await f.request('admin/resource-review-count','admin')).json()).pending,1);
 const queue=await (await f.request('admin/resources?visibility=all&review_status=pending','admin')).json();assert.equal(queue.total,1);assert.equal(queue.items[0].submitted_name,'member');
 assert.equal((await f.request(`admin/resources/${row.id}`,'admin',resourceData({revision:1,visible:true}))).status,409);
 assert.equal((await f.request(`admin/resources/${row.id}/approve`,'member',{revision:1,reason:'Try to approve'})).status,403);
 assert.equal((await f.request(`admin/resources/${row.id}/approve`,'admin',{revision:1,reason:'Reviewed content'})).status,200);
 assert.equal((await (await f.request('admin/resource-review-count','admin')).json()).pending,0);
 assert.equal((await (await f.request('resources?q=Recommended','member')).json()).total,1);
 assert.equal((await f.request(`admin/resources/${row.id}/approve`,'admin',{revision:1,reason:'Repeat'})).status,409);
 assert.equal(f.sql.prepare('SELECT action FROM admin_audit WHERE target_id=?').get(row.id).action,'approve');
});
test('declining recommendations and removing their images clears review queue without publishing',async()=>{
 const f=fixture();await f.add('member');await f.add('admin','admin');
 const image={mime:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1S8AAAAASUVORK5CYII='};
 assert.equal((await f.request('resources/recommend','member',resourceData({image}))).status,201);
 const row=f.sql.prepare("SELECT * FROM resources WHERE review_status='pending'").get();
 assert.equal((await f.request(`resources/${row.id}/image`,'member')).status,404);
 assert.equal((await f.request(`resources/${row.id}/image`,'admin')).headers.get('content-type'),'image/png');
 assert.equal((await f.request(`admin/resources/${row.id}/decline`,'admin',{revision:1,reason:'Not a fit'})).status,200);
 assert.equal((await (await f.request('admin/resource-review-count','admin')).json()).pending,0);
 assert.equal((await (await f.request('resources','member')).json()).total,3);
 assert.equal((await f.request(`admin/resources/${row.id}/delete`,'admin',{revision:2,reason:'Remove declined suggestion',confirmation:'DELETE'})).status,200);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM resource_images').get().n,0);
});
test('profile gender and birth date stay private, validate calendar dates, and survive omitted legacy fields',async()=>{
 const f=fixture();await f.add('member');await f.add('other');await f.add('admin','admin');
 const data={username:'member',name:'Member',phone:'',timezone:'',bio:'',notify_requests:true,notify_updates:true,notify_answered:true,gender:'female',birth_date:'2000-02-29'};
 const response=await f.request('profile','member',data);assert.equal(response.status,200);const saved=(await response.json()).user;assert.equal(saved.birth_date,'2000-02-29');assert.equal(saved.gender,'female');
 const directory=await (await f.request('people','other')).json();assert.ok(directory.every(row=>!('gender' in row)&&!('birth_date' in row)));
 const accounts=await (await f.request('admin/users','admin')).json();assert.equal(accounts.items.find(row=>row.id==='member').birth_date,'2000-02-29');
 for(const birth_date of ['2001-02-29','2000-13-01','2030-01-01','1900-01-01','2000-1-1',123]) assert.equal((await f.request('profile','member',{...data,birth_date})).status,400);
 assert.equal((await f.request('profile','member',{...data,gender:'invalid'})).status,400);
 const {gender,birth_date,...legacy}=data;assert.equal((await f.request('profile','member',legacy)).status,200);assert.equal(f.sql.prepare("SELECT gender FROM users WHERE id='member'").get().gender,'female');
 assert.equal((await f.request('admin/users/member/delete','admin',{reason:'Delete account',confirmation:'DELETE'})).status,200);const removed=f.sql.prepare("SELECT gender,birth_date FROM users WHERE id='member'").get();assert.equal(removed.gender,'');assert.equal(removed.birth_date,'');
});
test('gender and exact age boundaries gate lists, search, tags and image URLs, including missing birth dates',async()=>{
 const f=fixture();for(const who of ['adult','minor','female','unknown','nogender']) await f.add(who);await f.add('admin','admin');
 const today=new Date().toISOString().slice(0,10),year=Number(today.slice(0,4));
 for(const [who,gender,birth] of [['adult','male',`${year-18}${today.slice(4)}`],['minor','male',`${year-17}${today.slice(4)}`],['female','female',`${year-20}${today.slice(4)}`],['unknown','male',''],['nogender','',`${year-20}${today.slice(4)}`]]) f.sql.prepare('UPDATE users SET gender=?,birth_date=? WHERE id=?').run(gender,birth,who);
 const image={mime:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1S8AAAAASUVORK5CYII='};
 const created=await (await f.request('admin/resources','admin',resourceData({title:'Restricted resource',tags:['restricted-only'],genders:['male'],min_age:18,max_age:20,image}))).json();assert.ok(created.id);
 for(const [who,allowed] of [['adult',true],['minor',false],['female',false],['unknown',false],['nogender',false],['admin',true]]) {
  const list=await (await f.request('resources?q=Restricted',''+who)).json();assert.equal(list.total,allowed?1:0,who);assert.equal(list.tags.includes('restricted-only'),allowed,who);
  assert.equal((await f.request(`resources/${created.id}/image`,who)).status,allowed?200:404,who);
 }
 f.sql.prepare("UPDATE users SET birth_date=? WHERE id='adult'").run(`${year-21}${today.slice(4)}`);assert.equal((await f.request(`resources/${created.id}/image`,'adult')).status,404);
 // Clearing birth date immediately revokes access in the same signed-in session.
 f.sql.prepare("UPDATE users SET birth_date='' WHERE id='adult'").run();assert.equal((await (await f.request('resources?tag=restricted-only','adult')).json()).total,0);
});
test('age-only, gender-only and unrestricted resources correctly handle absent optional profile fields',async()=>{
 const f=fixture();await f.add('member');await f.add('admin','admin');
 for(const changes of [{title:'Age only',min_age:0},{title:'Gender only',genders:['male','female']},{title:'No limits'}]) assert.equal((await f.request('admin/resources','admin',resourceData(changes))).status,201);
 let list=await (await f.request('resources','member')).json();assert.deepEqual(list.items.filter(r=>['Age only','Gender only','No limits'].includes(r.title)).map(r=>r.title),['No limits']);
 f.sql.prepare("UPDATE users SET gender='male' WHERE id='member'").run();list=await (await f.request('resources?q=Gender only','member')).json();assert.equal(list.total,1);
 f.sql.prepare("UPDATE users SET gender='undisclosed' WHERE id='member'").run();assert.equal((await (await f.request('resources?q=Gender only','member')).json()).total,0);
 for(const changes of [{min_age:30,max_age:18},{min_age:-1},{max_age:121},{min_age:18.5},{genders:['unknown']}]) assert.equal((await f.request('admin/resources','admin',resourceData(changes))).status,400);
});
test('resource images validate, replace and remove atomically; direct static cover paths are unavailable',async()=>{
 const f=fixture();await f.add('member');await f.add('admin','admin');
 const image={mime:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1S8AAAAASUVORK5CYII='};
 const created=await (await f.request('admin/resources','admin',resourceData({image,genders:['female'],min_age:21}))).json();assert.ok(created.id);
 assert.equal((await f.request(`resources/${created.id}/image`)).status,401);assert.equal((await f.request(`resources/${created.id}/image`,'member')).status,404);
 const response=await f.request(`resources/${created.id}/image`,'admin');assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('content-type'),'image/png');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),new Uint8Array(Buffer.from(image.data,'base64')));
 const apiRows=await (await f.request('admin/resources?visibility=all','admin')).json();assert.ok(apiRows.items.every(row=>!('data' in row)));
 // A legacy admin edit cannot silently clear new audience restrictions or images.
 assert.equal((await f.request(`admin/resources/${created.id}`,'admin',resourceData({revision:1}))).status,200);let stored=f.sql.prepare('SELECT * FROM resources WHERE id=?').get(created.id);assert.equal(stored.genders,'female');assert.equal(stored.min_age,21);assert.equal(f.sql.prepare('SELECT count(*) n FROM resource_images').get().n,1);
 for(const invalid of [{mime:'image/svg+xml',data:image.data},{mime:'image/jpeg',data:image.data},{mime:'image/png',data:'!!!'},{mime:'image/png',data:'A'.repeat(350000)}]) assert.equal((await f.request(`admin/resources/${created.id}`,'admin',resourceData({revision:2,image:invalid}))).status,400);
 assert.equal((await f.request(`admin/resources/${created.id}`,'admin',resourceData({revision:2,image:null}))).status,200);assert.equal((await f.request(`resources/${created.id}/image`,'admin')).status,404);
 for(const id of ['wild-at-heart','not-even-a-hint','connection-codes']) {
  assert.equal((await worker.fetch(new Request(`https://prayer.example.com/assets/resource-covers/${id}.jpg`),f.env)).status,404);
  assert.equal((await f.request(`resources/${id}/image`)).status,401);
 }
 let coverPath;f.env.ASSETS.fetch=async request=>{coverPath=new URL(request.url).pathname;return new Response('cover',{headers:{'Content-Type':'image/jpeg'}});};
 assert.equal((await f.request('resources/connection-codes/image','member')).status,200);assert.equal(coverPath,'/assets/resource-covers/connection-codes.jpg');
});
test('recommendation spam caps and stale admin approval fail closed',async()=>{
 const f=fixture();await f.add('member');await f.add('admin','admin');
 for(let i=0;i<10;i++) assert.equal((await f.request('resources/recommend','member',resourceData({title:`Recommendation ${i}`}))).status,201);
 assert.equal((await f.request('resources/recommend','member',resourceData())).status,429);
 const row=f.sql.prepare("SELECT * FROM resources WHERE review_status='pending' LIMIT 1").get(),batch=f.env.DB.batch.bind(f.env.DB);
 f.env.DB.batch=async statements=>{f.sql.prepare("UPDATE users SET role='member' WHERE id='admin'").run();return batch(statements);};
 assert.equal((await f.request(`admin/resources/${row.id}/approve`,'admin',{revision:1,reason:'Stale actor'})).status,409);assert.equal(f.sql.prepare('SELECT review_status FROM resources WHERE id=?').get(row.id).review_status,'pending');
});

const application=(extra={})=>({name:'New Applicant',email:'applicant@example.com',username:'applicant',phone:'972-555-0101',timezone:'America/Chicago',bio:'I would like to join the group.',gender:'male',birth_date:'1990-05-02',notify_requests:true,notify_updates:false,notify_answered:true,...extra});
test('public access requests collect profile fields privately without creating accounts or granting roles',async()=>{
 const f=fixture();await f.add('admin','admin');await f.add('member');
 assert.equal((await f.request('access-requests',null,application({role:'admin',is_owner:1}))).status,202);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM users').get().n,2);
 const row=f.sql.prepare('SELECT * FROM portal_requests').get(),profile=JSON.parse(row.profile);
 assert.equal(row.status,'pending');assert.equal(profile.username,'applicant');assert.equal(profile.birth_date,'1990-05-02');assert.equal(profile.notify_updates,false);assert.ok(!('role' in profile) && !('password' in profile));
 for(const who of [undefined,'member']) {assert.equal((await f.request('admin/portal-requests',who)).status,who?403:401);assert.equal((await f.request('admin/portal-requests/count',who)).status,who?403:401);}
 assert.equal((await (await f.request('admin/portal-requests/count','admin')).json()).pending,1);
 assert.equal((await f.request('access-requests',null,application({bio:'Overwrite attempt'}))).status,202);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM portal_requests').get().n,1);assert.equal(JSON.parse(f.sql.prepare('SELECT profile FROM portal_requests').get().profile).bio,profile.bio);
 assert.ok(!(await (await f.request('people','member')).json()).some(person=>person.name==='New Applicant'));
 const list=await (await f.request('admin/portal-requests?search=applicant','admin')).json();assert.equal(list.items[0].profile.phone,profile.phone);
});
test('verified access approval issues a one-use member invitation and carries every profile field into enrollment',async()=>{
 const f=fixture();await f.add('admin','admin');await f.request('access-requests',null,application());const row=f.sql.prepare('SELECT * FROM portal_requests').get();
 const path=`admin/portal-requests/${row.id}/approve`;
 assert.equal((await f.request(path,'admin',{revision:1,reason:'Approve without verification'})).status,400);
 const approved=await (await f.request(path,'admin',{revision:1,reason:'Verified email owner by existing contact',verified:true})).json();assert.ok(approved.link);
 const raw=approved.link.split('#invite=')[1];assert.ok(!JSON.stringify(f.sql.prepare('SELECT * FROM portal_requests').get()).includes(raw));
 assert.equal((await f.request(path,'admin',{revision:1,reason:'Repeat',verified:true})).status,409);
 const details=await (await f.request('invitation-details',null,{token:raw})).json();assert.equal(details.profile.name,'New Applicant');
 const response=await f.request('accept',null,{token:raw,name:details.profile.name,password:'new-applicant-password',role:'admin'});assert.equal(response.status,200,await response.clone().text());
 const user=(await response.json()).user;assert.equal(user.role,'member');assert.equal(user.owner,false);assert.equal(user.username,'applicant');
 for(const key of ['phone','timezone','bio','gender','birth_date','notify_requests','notify_updates','notify_answered']) assert.equal(user[key],application()[key],key);
 assert.equal(f.sql.prepare('SELECT status FROM portal_requests').get().status,'completed');
 assert.equal((await (await f.request('invitation-details',null,{token:raw})).json()).profile,null);
 assert.equal((await f.request('accept',null,{token:raw,name:'Replay',password:'new-applicant-password'})).status,400);
});
test('declines and failed or stale approvals leave no usable invitation and preserve transactional audit boundaries',async()=>{
 const f=fixture();await f.add('admin','admin');await f.add('member');await f.request('access-requests',null,application());const row=f.sql.prepare('SELECT * FROM portal_requests').get(),path=`admin/portal-requests/${row.id}`;
 assert.equal((await f.request(`${path}/approve`,'member',{revision:1,reason:'Escalate',verified:true})).status,403);
 f.sql.exec("CREATE TRIGGER reject_request_invite BEFORE INSERT ON invites BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");
 assert.equal((await f.request(`${path}/approve`,'admin',{revision:1,reason:'Verified',verified:true})).status,500);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM admin_audit').get().n,0);assert.equal(f.sql.prepare('SELECT status FROM portal_requests').get().status,'pending');
 f.sql.exec('DROP TRIGGER reject_request_invite');
 assert.equal((await f.request(`${path}/decline`,'admin',{revision:1,reason:'Not part of this community'})).status,200);
 assert.equal((await f.request(`${path}/approve`,'admin',{revision:1,reason:'Stale',verified:true})).status,409);assert.equal(f.sql.prepare('SELECT count(*) n FROM invites').get().n,0);
 assert.equal((await (await f.request('admin/portal-requests/count','admin')).json()).pending,0);
});
test('request validation, reserved names, bots, origin checks and throttling protect the unauthenticated queue',async()=>{
 for(const extra of [{name:''},{email:'bad'},{username:'admin'},{timezone:'not/a-zone'},{gender:'invalid'},{birth_date:'2050-01-01'},{notify_updates:'yes'},{phone:'x'.repeat(41)}]) {
  const f=fixture();assert.equal((await f.request('access-requests',null,application(extra))).status,400,JSON.stringify(extra));assert.equal(f.sql.prepare('SELECT count(*) n FROM portal_requests').get().n,0);
 }
 const f=fixture();assert.equal((await f.request('access-requests',null,application({website:'bot'}))).status,202);assert.equal(f.sql.prepare('SELECT count(*) n FROM portal_requests').get().n,0);
 const bad=await worker.fetch(new Request('https://prayer.example.com/api/access-requests',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify(application())}),f.env);assert.equal(bad.status,403);
 for(let i=0;i<3;i++) assert.equal((await f.request('access-requests',null,application())).status,202);
 assert.equal((await f.request('access-requests',null,application())).status,429);
});
test('failed automatic email remains private and permits verified manual fallback without revoking sessions',async()=>{
 const f=fixture();f.env.ENVIRONMENT='production';await f.add('admin','admin');await f.add('member');
 const known=await (await f.request('password-help',null,{identifier:'member@example.com'})).json(),unknown=await (await f.request('password-help',null,{identifier:'unknown@example.com'})).json();assert.deepEqual(known,unknown);
 assert.equal((await f.request('me','member')).status,200);assert.equal(f.sql.prepare('SELECT count(*) n FROM portal_requests').get().n,1);
 const row=f.sql.prepare('SELECT * FROM portal_requests').get(),path=`admin/portal-requests/${row.id}/approve`;
 assert.equal((await f.request(path,'admin',{revision:row.revision,reason:'Unverified'})).status,400);
 const issued=await (await f.request(path,'admin',{revision:row.revision,reason:'Identity verified privately',verified:true})).json();assert.ok(issued.link);const raw=issued.link.split('#reset=')[1];
 assert.equal((await f.request('me','member')).status,200);assert.notEqual(f.sql.prepare('SELECT token_hash FROM password_resets').get().token_hash,raw);
 assert.equal((await f.request('reset-password',null,{token:raw,password:'replacement-user-password'})).status,200);
 assert.equal((await f.request('me','member')).status,401);assert.equal(f.sql.prepare('SELECT status FROM portal_requests').get().status,'completed');
 assert.equal((await f.request('reset-password',null,{token:raw,password:'replacement-user-password'})).status,400);
 assert.equal((await f.request('login',null,{identifier:'member@example.com',password:'replacement-user-password'})).status,200);
});
test('request approval rechecks live admin authority, username conflicts and primary-owner protection',async()=>{
 const f=fixture();f.env.ENVIRONMENT='production';await f.add('admin','admin');await f.add('owner','admin');f.sql.exec("UPDATE users SET is_owner=1 WHERE id='owner'");
 await f.request('password-help',null,{identifier:'owner@example.com'});let row=f.sql.prepare('SELECT * FROM portal_requests').get();
 assert.equal((await f.request(`admin/portal-requests/${row.id}/approve`,'admin',{revision:1,reason:'Attempt owner reset',verified:true})).status,409);
 await f.request('access-requests',null,application());row=f.sql.prepare("SELECT * FROM portal_requests WHERE kind='access'").get();
 const batch=f.env.DB.batch.bind(f.env.DB);f.env.DB.batch=async statements=>{f.sql.exec("UPDATE users SET role='member' WHERE id='admin'");return batch(statements);};
 assert.equal((await f.request(`admin/portal-requests/${row.id}/approve`,'admin',{revision:1,reason:'Stale admin',verified:true})).status,409);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM invites').get().n,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM admin_audit').get().n,0);
});

test('replacement request links invalidate the original and preserve the applicant profile',async()=>{
 const f=fixture();await f.add('admin','admin');await f.request('access-requests',null,application());let row=f.sql.prepare('SELECT * FROM portal_requests').get();
 const first=await (await f.request(`admin/portal-requests/${row.id}/approve`,'admin',{revision:1,verified:true,reason:'Verified owner'})).json();
 row=f.sql.prepare('SELECT * FROM portal_requests').get();
 const second=await (await f.request(`admin/portal-requests/${row.id}/reissue`,'admin',{revision:row.revision,verified:true,reason:'Old link lost'})).json();assert.ok(second.link);assert.notEqual(first.link,second.link);
 const old=first.link.split('#invite=')[1],fresh=second.link.split('#invite=')[1];
 assert.equal((await (await f.request('invitation-details',null,{token:old})).json()).profile,null);
 assert.equal((await f.request('accept',null,{token:old,name:'Old',password:'new-account-password'})).status,400);
 const profile=(await (await f.request('invitation-details',null,{token:fresh})).json()).profile;assert.equal(profile.phone,application().phone);
 const join=await f.request('accept',null,{token:fresh,name:profile.name,password:'new-account-password'});assert.equal(join.status,200);const id=(await join.json()).user.id;
 assert.equal((await f.request(`admin/users/${id}/delete`,'admin',{reason:'Remove synthetic member',confirmation:'DELETE'})).status,200);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM portal_requests').get().n,0);
});

test('automatic recovery emails only the canonical account address, including the owner, and never leaks or persists raw links',async()=>{
 const f=fixture();await f.add('owner','admin');f.sql.exec("UPDATE users SET is_owner=1 WHERE id='owner'");
 f.env.ENVIRONMENT='production';f.env.PRAYER_EMAIL_DELIVERY_MODE='live';f.env.PRAYER_RESEND_API_KEY='test-only-key';
 const original=globalThis.fetch,mail=[];
 globalThis.fetch=async (url,options)=>{assert.equal(url,'https://api.resend.com/emails');mail.push(JSON.parse(options.body));return Response.json({id:`test-email-${mail.length}`});};
 try {
  const knownResponse=await f.request('password-help',null,{identifier:'owner@example.com',email:'attacker@example.com'}),known=await knownResponse.json();assert.equal(knownResponse.status,202);
  const unknown=await (await f.request('password-help',null,{identifier:'unknown@example.com'})).json();assert.deepEqual(known,unknown);assert.equal(mail.length,1);assert.deepEqual(mail[0].to,['owner@example.com']);
  const raw=mail[0].text.match(/#reset=([a-f0-9]{64})/)[1];assert.ok(!JSON.stringify(known).includes(raw));assert.ok(!JSON.stringify(f.sql.prepare('SELECT * FROM portal_requests').all()).includes(raw));assert.notEqual(f.sql.prepare('SELECT token_hash FROM password_resets').get().token_hash,raw);
  assert.equal(f.sql.prepare('SELECT email_status FROM portal_requests').get().email_status,'sent');assert.equal((await f.request('me','owner')).status,200);
  await f.request('password-help',null,{identifier:'owner@example.com'});const second=mail[1].text.match(/#reset=([a-f0-9]{64})/)[1];
  assert.equal((await f.request('reset-password',null,{token:second,password:'owner-replacement-password'})).status,200);
  assert.equal((await f.request('reset-password',null,{token:raw,password:'old-link-replacement-password'})).status,400);
  assert.equal((await f.request('me','owner')).status,401);
 } finally {globalThis.fetch=original;}
});
test('test recovery cannot send live email and provider failures stay generic, invalidate tokens and allow later retry',async()=>{
 const f=fixture();await f.add('member');f.env.ENVIRONMENT='test';f.env.PRAYER_EMAIL_DELIVERY_MODE='live';f.env.PRAYER_RESEND_API_KEY='fake-key';
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response('rejected',{status:500});};
 try {
  assert.equal((await f.request('password-help',null,{identifier:'member@example.com'})).status,202);assert.equal(calls,0);assert.equal(f.sql.prepare('SELECT email_status FROM portal_requests').get().email_status,'captured');
  f.env.ENVIRONMENT='production';assert.equal((await f.request('password-help',null,{identifier:'member@example.com'})).status,202);assert.equal(calls,1);
  assert.equal(f.sql.prepare("SELECT email_status FROM portal_requests WHERE status='pending'").get().email_status,'failed');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM password_resets').get().n,1); // Only the earlier captured token remains.
  globalThis.fetch=async()=>{calls++;return Response.json({id:'accepted-retry'});};
  assert.equal((await f.request('password-help',null,{identifier:'member@example.com'})).status,202);assert.equal(calls,2);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM portal_requests WHERE status='pending'").get().n,0);assert.equal((await f.request('me','member')).status,200);
 } finally {globalThis.fetch=original;}
});


test('provisional request creates only a restricted account with hashed password and private profile',async()=>{
 const f=fixture();await f.add('admin','admin');await f.add('member');
 const response=await f.request('access-requests',null,application({password:'provisional-password',role:'admin',access_level:'full',is_owner:1}));
 assert.equal(response.status,200,await response.clone().text());const joined=await response.json();
 assert.equal(joined.user.role,'member');assert.equal(joined.user.owner,false);assert.equal(joined.user.access_level,'provisional');
 const saved=f.sql.prepare('SELECT * FROM users WHERE id=?').get(joined.user.id);assert.notEqual(saved.password,'provisional-password');assert.equal(saved.bio,application().bio);
 const q=f.sql.prepare('SELECT * FROM portal_requests').get();assert.equal(q.user_id,saved.id);assert.equal(q.status,'pending');assert.ok(!q.profile.includes('password'));
 assert.ok(!(await (await f.request('people','member')).json()).some(p=>p.id===saved.id));
 const cookie=response.headers.get('set-cookie').split(';')[0];
 async function direct(path,data,method) {return worker.fetch(new Request('https://prayer.example.com/api/'+path,{method:method||(data?'POST':'GET'),headers:{Origin:'https://prayer.example.com',Cookie:cookie,'X-CSRF-Token':joined.csrf,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined}),f.env);}
 for(const path of ['people','groups','groups/discover','notifications','invites','admin/users','admin/portal-requests','admin/resources']) assert.equal((await direct(path)).status,403,path);
 for(const [path,data,method] of [['posts',post('members')],['follow',{userId:'member',following:true}],['groups',{name:'Secret group'}],['resources/recommend',{}],['notifications/read',{}],['posts/any',null,'DELETE']]) assert.equal((await direct(path,data,method)).status,403,path);
 assert.equal((await direct('resources')).status,200);assert.equal((await direct('resource-categories')).status,200);
 assert.equal((await (await direct('me')).json()).user.access_level,'provisional');
 assert.equal((await f.request('access-requests',null,application({password:'attacker-password'}))).status,202);assert.equal(f.sql.prepare('SELECT count(*) n FROM users').get().n,3);
 assert.equal((await f.request('login',null,{identifier:application().email,password:'attacker-password'})).status,401);
 assert.equal((await f.request(`admin/users/${saved.id}/role`,'admin',{role:'admin',reason:'Skip approval'})).status,409);
 assert.equal((await f.request(`admin/portal-requests/${q.id}/approve`,'admin',{revision:1,reason:'Verified identity',verified:true})).status,200);
 assert.equal(f.sql.prepare('SELECT status FROM portal_requests').get().status,'completed');assert.equal(f.sql.prepare('SELECT count(*) n FROM invites').get().n,0);
 assert.equal((await (await direct('me')).json()).user.access_level,'full');assert.equal((await direct('people')).status,200);
});

test('Global prayers alone are visible provisionally even with existing group and recipient subscriptions',async()=>{
 const f=fixture();for(const id of ['author','provisional','member']) await f.add(id);await f.add('admin','admin');f.sql.exec("UPDATE users SET access_level='provisional' WHERE id='provisional'");
 for(const audience of ['members','selected','admins']) assert.equal((await f.request('posts','author',post(audience,['provisional']))).status,201);
 const created=await f.request('posts','author',{...post('members'),global:true});assert.equal(created.status,201,await created.clone().text());const globalId=(await created.json()).id;
 let rows=(await (await f.request('posts','provisional')).json()).posts;assert.equal(rows.length,1);assert.equal(rows[0].id,globalId);assert.equal(rows[0].is_global,1);assert.equal(rows[0].group_id,null);
 assert.equal((await (await f.request('posts?global=1','member')).json()).posts.length,1);
 for(const data of [{...post('admins'),global:true},{...post('selected',['member']),global:true},{...post('members'),global:true,groupId:'any-group'},{...post('members'),global:'true'}]) assert.equal((await f.request('posts','author',data)).status,400);
 assert.throws(()=>f.sql.prepare("UPDATE posts SET audience='admins' WHERE id=?").run(globalId));
 assert.equal((await f.request(`posts/${globalId}/global`,'member',{global:false,confirmed:true,reason:'Unauthorized'})).status,404);
 assert.equal((await f.request(`posts/${globalId}/global`,'author',{global:false,reason:'No confirmation'})).status,400);
 assert.equal((await f.request(`posts/${globalId}/global`,'author',{global:false,confirmed:true,reason:'Limit audience'})).status,200);
 assert.equal((await (await f.request('posts','provisional')).json()).posts.length,0);
 assert.equal((await f.request(`posts/${globalId}/global`,'admin',{global:true,confirmed:true,reason:'Global encouragement'})).status,200);
 assert.equal((await (await f.request('posts','provisional')).json()).posts.length,1);
});

test('declining provisional membership revokes sessions and recovery links without upgrading on reactivation',async()=>{
 const f=fixture();await f.add('admin','admin');const response=await f.request('access-requests',null,application({password:'provisional-password'}));assert.equal(response.status,200,await response.clone().text());const person=(await response.json()).user;
 await f.request('password-help',null,{identifier:person.email});const q=f.sql.prepare("SELECT * FROM portal_requests WHERE kind='access'").get();
 assert.equal((await f.request(`admin/portal-requests/${q.id}/decline`,'admin',{revision:1,reason:'Not verified'})).status,200);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM sessions WHERE user_id=?').get(person.id).n,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM password_resets WHERE user_id=?').get(person.id).n,0);
 assert.equal((await f.request('login',null,{identifier:person.email,password:'provisional-password'})).status,401);
 assert.equal((await f.request(`admin/users/${person.id}/reactivate`,'admin',{reason:'Reconsider'})).status,200);assert.equal(f.sql.prepare('SELECT access_level FROM users WHERE id=?').get(person.id).access_level,'provisional');
});

test('provisional resource discovery and images honor demographic and moderation restrictions',async()=>{
 const f=fixture();await f.add('provisional');f.sql.exec("UPDATE users SET access_level='provisional',birth_date='',gender='' WHERE id='provisional'; UPDATE resources SET min_age=18 WHERE id='not-even-a-hint'; UPDATE resources SET genders='male' WHERE id='wild-at-heart'");
 const resources=await (await f.request('resources','provisional')).json();assert.ok(!resources.items.some(r=>['not-even-a-hint','wild-at-heart'].includes(r.id)));
 for(const id of ['wild-at-heart','not-even-a-hint']) assert.equal((await f.request(`resources/${id}/image`,'provisional')).status,404);
});


test('provisional creation and approval roll back atomically when their guarded writes fail',async()=>{
 const f=fixture();await f.add('admin','admin');
 f.sql.exec("CREATE TRIGGER fail_application BEFORE INSERT ON portal_requests BEGIN SELECT RAISE(ABORT,'synthetic'); END");
 assert.equal((await f.request('access-requests',null,application({password:'provisional-password'}))).status,500);assert.equal(f.sql.prepare('SELECT count(*) n FROM users').get().n,1);
 f.sql.exec('DROP TRIGGER fail_application');const response=await f.request('access-requests',null,application({password:'provisional-password'}));assert.equal(response.status,200);const joined=await response.json(),q=f.sql.prepare('SELECT * FROM portal_requests').get();
 f.sql.exec("CREATE TRIGGER fail_promotion BEFORE UPDATE OF access_level ON users BEGIN SELECT RAISE(ABORT,'synthetic'); END");
 assert.equal((await f.request(`admin/portal-requests/${q.id}/approve`,'admin',{revision:1,verified:true,reason:'Verify'})).status,500);assert.equal(f.sql.prepare('SELECT count(*) n FROM admin_audit').get().n,0);assert.equal(f.sql.prepare('SELECT access_level FROM users WHERE id=?').get(joined.user.id).access_level,'provisional');
});

test('making a restricted group prayer Global explicitly clears its group and recipient limits',async()=>{
 const f=fixture();for(const id of ['author','friend','provisional'])await f.add(id);f.sql.exec("UPDATE users SET access_level='provisional' WHERE id='provisional'");
 const group=(await(await f.request('groups','author',{name:'Circle',description:'Private circle',kind:'accountability',discoverable:true})).json()).id;
 await f.request(`groups/${group}/join`,'friend',{});await f.request(`groups/${group}/members/friend`,'author',{status:'approved'});
 const response=await f.request('posts','author',{...post('selected',['friend']),groupId:group});assert.equal(response.status,201,await response.clone().text());const id=(await response.json()).id;
 assert.equal((await f.request(`posts/${id}/global`,'author',{global:true,confirmed:true,reason:'Share broadly'})).status,200);
 const row=f.sql.prepare('SELECT * FROM posts WHERE id=?').get(id);assert.equal(row.group_id,null);assert.equal(row.audience,'members');assert.equal(row.is_global,1);assert.equal(f.sql.prepare('SELECT count(*) n FROM recipients WHERE post_id=?').get(id).n,0);
 assert.equal((await(await f.request('posts','provisional')).json()).posts[0].id,id);
});
