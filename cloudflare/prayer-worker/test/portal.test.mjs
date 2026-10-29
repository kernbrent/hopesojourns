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
    sql.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run(id,`${id}@example.com`,id,'unused',role,Date.now());
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
