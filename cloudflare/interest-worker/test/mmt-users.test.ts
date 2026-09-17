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
