import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {afterEach,expect,it} from 'vitest';
import {ministryFixture} from './ministry-fixture';
import {handleAdminRequest,authenticate} from '../src/admin';
import {handleAccountPublic} from '../src/mmt-users';
import {handleDestinations} from '../src/destinations';
const fixtures:Awaited<ReturnType<typeof ministryFixture>>[]=[];
async function setup(){const f=await ministryFixture();fixtures.push(f);f.env.ADMIN_PASSWORD='Original!Password123';f.env.ADMIN_SESSION_SECRET='test-secret-for-mmt-accounts';return {...f,call:(p:string,b?:unknown,m?:string)=>handleAdminRequest(f.request(p,b,m),f.env,p)};}
afterEach(()=>fixtures.splice(0).forEach(f=>f.sqlite.close()));
const profile={username:'reader',first_name:'Sample',last_name:'User',email:'sample@example.test',phone:'(972)555-0123',country:'US',permissions:{destinations:'read'},is_admin:false};
it('requires both username and password and keeps the existing admin password',async()=>{
 const f=await setup();expect((await f.call('/admin/login',{password:f.env.ADMIN_PASSWORD})).status).toBe(401);
 const r=await f.call('/admin/login',{username:'admin',password:f.env.ADMIN_PASSWORD});expect(r.status).toBe(200);expect((await r.json() as any).user.username).toBe('admin');expect(f.sqlite.prepare("SELECT password_hash FROM mmt_users WHERE id='primary'").get()?.password_hash).toBeTruthy();
});
it('creates a hashed-password user, enforces a one-use setup link, and hides credential material',async()=>{
 const f=await setup();const created=await f.call('/admin/account/users',profile);expect(created.status).toBe(201);const data=await created.json() as any;expect(data.delivered).toBe(false);expect(data.user.phone).toBe('9725550123');expect(data.user).not.toHaveProperty('password_hash');
 const token=data.setupLink.split('#token=')[1],b={token,password:'New!Password1234',confirmPassword:'New!Password1234'};
 const reset=()=>handleAccountPublic(f.request('/public/account/reset',b),f.env,'/public/account/reset');expect((await reset()).status).toBe(200);expect((await reset()).status).toBe(422);
 const r=await f.call('/admin/login',{username:'reader',password:b.password});expect(r.status).toBe(200);const session=await r.json() as any;
 const cookie=r.headers.get('set-cookie')!.split(';')[0];const request=(body?:unknown)=>new Request('http://localhost/api/interest/admin/destinations',{method:body?'POST':'GET',headers:{cookie,'x-csrf-token':session.csrfToken,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
 expect((await handleDestinations(request(),f.env,'/admin/destinations')).status).toBe(200);expect((await handleDestinations(request({}),f.env,'/admin/destinations')).status).toBe(403);
 const blocked=new Request('http://localhost/api/interest/admin/finance/bootstrap',{headers:{cookie}});await expect(authenticate(blocked,f.env)).rejects.toMatchObject({status:403});
});
it('requires changing a temporary password before accessing records and rejects its reuse',async()=>{
 const f=await setup();const data=await (await f.call('/admin/account/users',profile)).json() as any;
 const temporary=await (await f.call('/admin/account/users/'+data.user.id+'/temporary-password',{})).json() as any;
 const login=await f.call('/admin/login',{username:'reader',password:temporary.temporaryPassword});expect(login.status).toBe(200);const session=await login.json() as any;expect(session.user.must_change_password).toBe(true);
 expect((await f.call('/admin/login',{username:'reader',password:temporary.temporaryPassword})).status).toBe(401);
 const cookie=login.headers.get('set-cookie')!.split(';')[0];const req=new Request('http://localhost/api/interest/admin/destinations',{headers:{cookie}});expect((await handleDestinations(req,f.env,'/admin/destinations')).status).toBe(403);
 const change=new Request('http://localhost/api/interest/admin/password',{method:'POST',headers:{cookie,'x-csrf-token':session.csrfToken,'content-type':'application/json'},body:JSON.stringify({currentPassword:temporary.temporaryPassword,newPassword:'New!PersonalPass123',confirmPassword:'New!PersonalPass123'})});expect((await handleAdminRequest(change,f.env,'/admin/password')).status).toBe(200);
 expect((await handleDestinations(req,f.env,'/admin/destinations')).status).toBe(200);
});
it('protects the last administrator and rejects self permission changes',async()=>{
 const f=await setup();const me=await (await f.call('/admin/account/profile')).json() as any;
 expect((await f.call('/admin/account/users/primary',{...me.user,permissions:{},is_admin:false,status:'active'},'PUT')).status).toBe(409);
 expect((await f.call('/admin/account/profile',{...profile,is_admin:true},'PUT')).status).toBe(403);
});
it('queues access/recovery requests without granting access and rate limits public requests',async()=>{
 const f=await setup();for(let i=0;i<5;i++)expect((await handleAccountPublic(f.request('/public/account/request',profile),f.env,'/public/account/request')).status).toBe(202);
 expect((await handleAccountPublic(f.request('/public/account/request',profile),f.env,'/public/account/request')).status).toBe(429);
 expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM mmt_users').get()).toMatchObject({n:1});
});
it('sends invitation/reset instructions only to the account email and never returns reset tokens publicly',async()=>{
 const f=await setup(),messages:any[]=[];f.env.EMAIL_DELIVERY_MODE='live';f.env.EMAIL={send:async(message:any)=>{messages.push(message);return {messageId:'test-message'};}} as any;
 const created=await (await f.call('/admin/account/users',profile)).json() as any;expect(created.delivered).toBe(true);expect(created).not.toHaveProperty('setupLink');expect(messages[0].to).toBe(profile.email);expect(messages[0].text).toContain('reader');
 const r=await handleAccountPublic(f.request('/public/account/forgot',{email:profile.email}),f.env,'/public/account/forgot');expect(r.status).toBe(200);expect(await r.text()).not.toContain('token=');expect(messages[1].to).toBe(profile.email);
});
it('revokes sessions after disabling a user and prevents recovery approval without identity review',async()=>{
 const f=await setup();const created=await (await f.call('/admin/account/users',profile)).json() as any;
 await handleAccountPublic(f.request('/public/account/recovery',{...profile,message:'Lost email access'}),f.env,'/public/account/recovery');
 const request=f.sqlite.prepare('SELECT id FROM mmt_access_requests LIMIT 1').get()!;
 expect((await f.call('/admin/account/requests/'+request.id,{action:'approve',user_id:created.user.id},'PUT')).status).toBe(422);
 expect((await f.call('/admin/account/users/'+created.user.id,{...profile,revision:created.user.revision,status:'disabled'},'PUT')).status).toBe(200);
 expect((await f.call('/admin/account/users/'+created.user.id+'/invite',{})).status).toBe(409);
});

it('deletes a user from the directory, revokes access, and preserves attributable history',async()=>{
 const f=await setup();const data=await (await f.call('/admin/account/users',profile)).json() as any;
 const path='/admin/account/users/'+data.user.id;
 expect((await f.call(path,{confirmUsername:'wrong',revision:data.user.revision},'DELETE')).status).toBe(422);
 expect((await f.call(path,{confirmUsername:'reader',revision:99},'DELETE')).status).toBe(409);
 expect((await f.call(path,{confirmUsername:'reader',revision:data.user.revision},'DELETE')).status).toBe(200);
 const list=await (await f.call('/admin/account/users')).json() as any;expect(list.users.some((u:any)=>u.id===data.user.id)).toBe(false);
 expect(f.sqlite.prepare('SELECT status,password_hash,deleted_at FROM mmt_users WHERE id=?').get(data.user.id)).toMatchObject({status:'disabled',password_hash:null,deleted_at:expect.any(String)});
 expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM mmt_reset_tokens WHERE user_id=?').get(data.user.id)).toMatchObject({n:0});
 expect((await f.call(path+'/invite',{})).status).toBe(404);
 expect((await f.call(path,{...profile,status:'active',revision:2},'PUT')).status).toBe(404);
 expect((await f.call('/admin/account/users/primary',{confirmUsername:'admin',revision:1},'DELETE')).status).toBe(409);
});

it('re-adds deleted identities with fresh access while preserving old history',async()=>{
 const f=await setup();await f.call('/admin/login',{username:'admin',password:f.env.ADMIN_PASSWORD});const old=await (await f.call('/admin/account/users',{...profile,is_admin:true})).json() as any;
 const token=old.setupLink.split('#token=')[1];
 expect((await f.call('/admin/account/users/'+old.user.id,{confirmUsername:profile.username,revision:old.user.revision},'DELETE')).status).toBe(200);
 const result=await f.call('/admin/account/users',profile);expect(result.status).toBe(201);const fresh=await result.json() as any;
 expect(fresh.user.id).not.toBe(old.user.id);expect(fresh.user.is_admin).toBe(false);
 expect(f.sqlite.prepare('SELECT deleted_username,deleted_email,status,password_hash FROM mmt_users WHERE id=?').get(old.user.id)).toEqual({deleted_username:profile.username,deleted_email:profile.email,status:'disabled',password_hash:null});
 expect(()=>f.sqlite.prepare("UPDATE mmt_users SET status='active' WHERE id=?").run(old.user.id)).toThrow('Deleted users cannot be changed');
 expect((await handleAccountPublic(f.request('/public/account/reset',{token,password:'New!Password1234',confirmPassword:'New!Password1234'}),f.env,'/public/account/reset')).status).toBe(422);
 expect((await f.call('/admin/account/users',{...profile,username:'other'})).status).toBe(409);
 expect((await f.call('/admin/account/users',{...profile,email:'other@example.test'})).status).toBe(409);
 expect((await f.call('/admin/account/users/'+fresh.user.id,{confirmUsername:profile.username,revision:fresh.user.revision},'DELETE')).status).toBe(200);
 expect((await f.call('/admin/account/users',profile)).status).toBe(201);
});

it('migrates previously deleted accounts without losing their identity or references',()=>{
 const db=new DatabaseSync(':memory:');try{
 const dir=new URL('../migrations/',import.meta.url);
 for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')&&n<'0023').sort())db.exec(readFileSync(new URL(name,dir),'utf8'));
 db.prepare("INSERT INTO mmt_users(id,username,first_name,last_name,email,registered_at,updated_at,status,deleted_at) VALUES('old','reader','Sample','User','sample@example.test','2026-01-01','2026-01-01','disabled','2026-01-02')").run();
 db.prepare("INSERT INTO mmt_email_events(id,user_id,kind,recipient,status,created_at) VALUES('history','old','invite','sample@example.test','not_sent','2026-01-01')").run();
 db.exec(readFileSync(new URL('0023_mmt_reusable_deleted_identity.sql',dir),'utf8'));
 expect(db.prepare("SELECT username,email,deleted_username,deleted_email FROM mmt_users WHERE id='old'").get()).toEqual({username:'deleted:old',email:'deleted:old',deleted_username:'reader',deleted_email:'sample@example.test'});
 expect(db.prepare("SELECT user_id FROM mmt_email_events WHERE id='history'").get()?.user_id).toBe('old');
 expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
 }finally{db.close();}
});
