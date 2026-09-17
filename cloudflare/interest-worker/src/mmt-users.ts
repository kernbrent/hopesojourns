import {AdminError,adminJson,authenticate,auditStatement,readAdminJson,adminPasswordPolicyError,base64Url,base64UrlBytes,randomToken,hashText,deriveAdminPasswordHash,secureEqual,verifyAdminPassword,type AdminEnv} from './admin';
import {sections,permissions,actorContext,type MmtIdentity} from './mmt-permissions';
type User=MmtIdentity&{password_salt:string|null;password_hash:string|null;iterations:number;temporary_expires_at:string|null};
const now=()=>new Date().toISOString();
function line(value:unknown,max=150,optional=false){if(optional&&(value==null||value===''))return '';if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f]/.test(value))throw new AdminError(422,'INVALID_FIELD','Complete all required fields using plain text.');return value.trim();}
function username(value:unknown){const v=line(value,60).toLowerCase();if(!/^[a-z][a-z0-9._-]{2,59}$/.test(v))throw new AdminError(422,'INVALID_USERNAME','Use 3–60 letters, numbers, periods, underscores, or hyphens; start with a letter.');return v;}
function profile(b:Record<string,unknown>){const email=line(b.email,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new AdminError(422,'INVALID_EMAIL','Enter a valid email address.');const raw=line(b.phone,40),country=line(b.country||'US',60);let phone=raw;if(['US','USA','UNITED STATES'].includes(country.toUpperCase())){phone=raw.replace(/\D/g,'');if(phone.length===11&&phone.startsWith('1'))phone=phone.slice(1);if(!/^[2-9]\d{2}[2-9]\d{6}$/.test(phone))throw new AdminError(422,'INVALID_PHONE','Enter a 10-digit US phone number.');}else if(!/^\+?[\d ().-]{7,40}$/.test(phone))throw new AdminError(422,'INVALID_PHONE','Enter a valid international phone number including its country code.');return {first_name:line(b.first_name,70),last_name:line(b.last_name,70),email,phone,country};}
function access(b:Record<string,unknown>){const p=b.permissions;if(!p||typeof p!=='object'||Array.isArray(p))throw new AdminError(422,'INVALID_ACCESS','Choose section permissions.');const result:Record<string,string>={};for(const s of sections){const v=(p as Record<string,unknown>)[s]??'blocked';if(!['blocked','read','edit'].includes(String(v)))throw new AdminError(422,'INVALID_ACCESS','Choose Blocked, Read only, or Edit.');result[s]=String(v);}return {is_admin:b.is_admin===true||b.is_admin===1?1:0,permissions_json:JSON.stringify(result)};}
export function publicUser(u:MmtIdentity){return {id:u.id,username:u.username,first_name:u.first_name,last_name:u.last_name,email:u.email,phone:u.phone,country:u.country,is_admin:!!u.is_admin,permissions:permissions(u),status:u.status,must_change_password:!!u.must_change_password,registered_at:u.registered_at,revision:u.revision};}
async function user(env:AdminEnv,id:string){const u=await env.DB.prepare('SELECT * FROM mmt_users WHERE id=?').bind(id).first<User>();if(!u)throw new AdminError(404,'NOT_FOUND','User not found.');return u;}
async function passwordParts(password:string){const error=adminPasswordPolicyError(password);if(error)throw new AdminError(422,'INVALID_PASSWORD',error);const salt=crypto.getRandomValues(new Uint8Array(16));return {salt:base64Url(salt),hash:await deriveAdminPasswordHash(password,salt)};}
export async function verifyUserPassword(env:AdminEnv,id:string,password:string){
 const u=await user(env,id);if(u.temporary_expires_at&&Date.parse(u.temporary_expires_at)<=Date.now())return false;
 if(!u.password_hash){if(id!=='primary'||!(await verifyAdminPassword(env,password)))return false;const salt=crypto.getRandomValues(new Uint8Array(16));await env.DB.prepare('UPDATE mmt_users SET password_salt=?,password_hash=? WHERE id=? AND password_hash IS NULL').bind(base64Url(salt),await deriveAdminPasswordHash(password,salt),id).run();return true;}
 const salt=base64UrlBytes(u.password_salt||'');return !!salt&&salt.length===16&&u.iterations===100000&&await secureEqual(await deriveAdminPasswordHash(password,salt,u.iterations),u.password_hash);
}
export async function changeUserPassword(request:Request,env:AdminEnv){
 const session=await authenticate(request,env,true),b=await readAdminJson(request);
 const current=typeof b.currentPassword==='string'?b.currentPassword:'';const password=typeof b.newPassword==='string'?b.newPassword:'';
 if(!current||current.length>256||!(await verifyUserPassword(env,session.user_id,current)))throw new AdminError(422,'INVALID_CURRENT_PASSWORD','The current password is incorrect.');
 if(password!==b.confirmPassword||password===current)throw new AdminError(422,'INVALID_PASSWORD','Choose a different password and enter it identically twice.');
 const p=await passwordParts(password);
 await env.DB.batch([env.DB.prepare('UPDATE mmt_users SET password_salt=?,password_hash=?,must_change_password=0,temporary_expires_at=NULL,temporary_used_at=NULL,revision=revision+1,updated_at=? WHERE id=?').bind(p.salt,p.hash,now(),session.user_id),env.DB.prepare('DELETE FROM admin_sessions WHERE user_id=? AND id<>?').bind(session.user_id,session.id),env.DB.prepare('DELETE FROM mmt_reset_tokens WHERE user_id=?').bind(session.user_id),auditStatement(env,'mmt_user',session.user_id,'password_changed')]);return adminJson({success:true,otherSessionsEnded:true});
}
async function rateLimit(request:Request,env:AdminEnv){
 const key=await hashText('mmt-public:'+ (request.headers.get('cf-connecting-ip')||'local')),minute=Math.floor(Date.now()/900000);
 await env.DB.prepare('INSERT INTO mmt_public_limits(key_hash,count,window_start) VALUES(?,1,?) ON CONFLICT(key_hash) DO UPDATE SET count=CASE WHEN window_start=excluded.window_start THEN count+1 ELSE 1 END,window_start=excluded.window_start').bind(key,minute).run();
 const row=await env.DB.prepare('SELECT count FROM mmt_public_limits WHERE key_hash=?').bind(key).first<{count:number}>();if(Number(row?.count)>5)throw new AdminError(429,'RATE_LIMITED','Please wait 15 minutes before trying again.');
}
async function issueLink(request:Request,env:AdminEnv,u:User,purpose:'invite'|'reset',admin=false){
 const token=randomToken(),tokenHash=await hashText(token),time=now(),expires=new Date(Date.now()+(purpose==='invite'?24:1)*3600000).toISOString();
 await env.DB.batch([env.DB.prepare('DELETE FROM mmt_reset_tokens WHERE user_id=?').bind(u.id),env.DB.prepare('INSERT INTO mmt_reset_tokens(token_hash,user_id,purpose,expires_at,created_at) VALUES(?,?,?,?,?)').bind(tokenHash,u.id,purpose,expires,time)]);
 // Origin comes from the validated deployment, never from a submitted address.
 const host=new URL(request.url).hostname;const origin=host==='localhost'||host==='127.0.0.1'?new URL(request.url).origin:env.ENVIRONMENT==='test'?'https://test.hopesojourns.com':'https://hopesojourns.com';
 const link=origin+'/admin/access/#token='+token;let delivered=false;
 if(env.EMAIL_DELIVERY_MODE==='live'&&env.EMAIL){try{await env.EMAIL.send({to:u.email,from:{email:env.EMAIL_FROM_ADDRESS||'admin@hopesojourns.com',name:'Hope Sojourns'},subject:purpose==='invite'?'Your Hope Sojourns MMT account':'Reset your Hope Sojourns password',text:`Hello ${u.first_name},\n\nYour MMT user name is ${u.username}.\n${purpose==='invite'?'Set your personal password before your first sign-in':'Reset your password'} using this one-use link:\n${link}\n\nThis link expires ${purpose==='invite'?'in 24 hours':'in one hour'}. If you did not expect this email, contact the administrator.`,replyTo:env.EMAIL_REPLY_TO||env.EMAIL_FROM_ADDRESS||'admin@hopesojourns.com'});delivered=true;}catch{delivered=false;}}
 await env.DB.prepare('INSERT INTO mmt_email_events(id,user_id,kind,recipient,status,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),u.id,purpose,u.email,delivered?'sent':'not_sent',time).run();
 return {delivered,...(admin&&!delivered?{setupLink:link}:{}),message:delivered?'Instructions sent by email.':'Email delivery is not available. An administrator can securely share a new setup link.'};
}
export async function handleAccountPublic(request:Request,env:AdminEnv,path:string){
 try{
 if(request.method!=='POST')throw new AdminError(405,'METHOD_NOT_ALLOWED','Submit the form to continue.');
 await rateLimit(request,env);const b=await readAdminJson(request);
 if(path==='/public/account/request'||path==='/public/account/recovery'){
  const p=profile(b),name=username(b.username),kind=path.endsWith('recovery')?'recovery':'access';
  await env.DB.prepare('INSERT INTO mmt_access_requests(id,kind,first_name,last_name,username,email,phone,country,message,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),kind,p.first_name,p.last_name,name,p.email,p.phone,p.country,line(b.message,1500,true),now()).run();
  return adminJson({message:'Your request is in the administrator’s inbox. They will review it and contact you.'},202);
 }
 if(path==='/public/account/forgot'){
  const email=line(b.email,254).toLowerCase();const u=await env.DB.prepare("SELECT * FROM mmt_users WHERE email=? AND status='active'").bind(email).first<User>();
  if(u)await issueLink(request,env,u,'reset');return adminJson({message:'If that address belongs to an active account, password-reset instructions have been requested. If no email arrives, use Request administrator help.'});
 }
 if(path==='/public/account/reset'){
  const token=line(b.token,100);if(!/^[A-Za-z0-9_-]{40,100}$/.test(token))throw new AdminError(422,'INVALID_LINK','This link is invalid or expired.');
  const hash=await hashText(token);const row=await env.DB.prepare("SELECT t.*,u.status FROM mmt_reset_tokens t JOIN mmt_users u ON u.id=t.user_id WHERE token_hash=? AND consumed_at IS NULL AND expires_at>? AND u.status='active'").bind(hash,now()).first<{user_id:string}>();if(!row)throw new AdminError(422,'INVALID_LINK','This link is invalid or expired. Request a new one.');
  const password=line(b.password,128);if(password!==b.confirmPassword)throw new AdminError(422,'INVALID_PASSWORD','Enter the same new password twice.');const p=await passwordParts(password),time=now(),claim=crypto.randomUUID();
  // The conditional user update claims the token atomically in a serialized batch.
  const results=await env.DB.batch([
   env.DB.prepare("UPDATE mmt_reset_tokens SET consumed_at=?,redemption_id=? WHERE token_hash=? AND consumed_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM mmt_users WHERE id=mmt_reset_tokens.user_id AND status='active')").bind(time,claim,hash,time),
   env.DB.prepare('UPDATE mmt_users SET password_salt=?,password_hash=?,must_change_password=0,temporary_expires_at=NULL,temporary_used_at=NULL,revision=revision+1,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM mmt_reset_tokens WHERE token_hash=? AND redemption_id=?)').bind(p.salt,p.hash,time,row.user_id,hash,claim),
   env.DB.prepare('DELETE FROM admin_sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM mmt_reset_tokens WHERE token_hash=? AND redemption_id=?)').bind(row.user_id,hash,claim)
  ]);
  if(!results[0].meta.changes)throw new AdminError(422,'INVALID_LINK','This link has already been used.');
  await auditStatement(env,'mmt_user',row.user_id,'password_reset').run();return adminJson({message:'Password saved. Sign in with your user name and new password.'});
 }
 throw new AdminError(404,'NOT_FOUND','Not found.');
 }catch(error){return accountError(error);}
}
function accountError(error:unknown){if(error instanceof AdminError)return adminJson({error:error.message,code:error.code},error.status,error.headers);const message=error instanceof Error?error.message:'';if(/UNIQUE constraint/.test(message))return adminJson({error:'That user name or email address is already registered.'},409);if(/Keep at least one/.test(message))return adminJson({error:'Keep at least one active administrator.'},409);console.error('mmt_account_error');return adminJson({error:'The account change could not be completed.'},500);}
async function createUser(env:AdminEnv,b:Record<string,unknown>){const p=profile(b),a=access(b),id=crypto.randomUUID(),time=now();await env.DB.prepare('INSERT INTO mmt_users(id,username,first_name,last_name,email,phone,country,is_admin,permissions_json,registered_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,username(b.username),p.first_name,p.last_name,p.email,p.phone,p.country,a.is_admin,a.permissions_json,time,time).run();return user(env,id);}
export async function handleAccountRequest(request:Request,env:AdminEnv,path:string){
 try{
 const session=await authenticate(request,env,request.method!=='GET');
 if(path==='/admin/account/profile'){
  if(request.method==='GET')return adminJson({user:publicUser(await user(env,session.user_id))});
  if(request.method==='PUT'){const b=await readAdminJson(request),p=profile(b);if(b.username!==undefined||b.permissions!==undefined||b.is_admin!==undefined||b.status!==undefined)throw new AdminError(403,'ACCESS_DENIED','You cannot change your own user name or access level here.');const result=await env.DB.prepare('UPDATE mmt_users SET first_name=?,last_name=?,email=?,phone=?,country=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').bind(p.first_name,p.last_name,p.email,p.phone,p.country,now(),session.user_id,Number(b.revision)).run();if(!result.meta.changes)throw new AdminError(409,'STALE_EDIT','Refresh your profile before saving.');await env.DB.prepare('DELETE FROM mmt_reset_tokens WHERE user_id=?').bind(session.user_id).run();await auditStatement(env,'mmt_user',session.user_id,'profile_updated').run();return adminJson({user:publicUser(await user(env,session.user_id))});}
 }
 if(!session.user.is_admin)throw new AdminError(403,'ACCESS_DENIED','Administrator access is required.');
 if(path==='/admin/account/users'&&request.method==='GET'){const rows=await env.DB.prepare('SELECT * FROM mmt_users ORDER BY username').all<User>();const requests=await env.DB.prepare('SELECT * FROM mmt_access_requests ORDER BY created_at DESC LIMIT 250').all();const emailEvents=await env.DB.prepare('SELECT * FROM mmt_email_events ORDER BY created_at DESC LIMIT 100').all();return adminJson({users:rows.results.map(publicUser),requests:requests.results,emailEvents:emailEvents.results,sections,emailReady:env.EMAIL_DELIVERY_MODE==='live'&&!!env.EMAIL});}
 if(path==='/admin/account/users'&&request.method==='POST'){const b=await readAdminJson(request),u=await createUser(env,b);await auditStatement(env,'mmt_user',u.id,'created').run();const delivery=await issueLink(request,env,u,'invite',true);return adminJson({user:publicUser(u),...delivery},201);}
 const match=path.match(/^\/admin\/account\/users\/([a-z0-9-]+)(?:\/(invite|temporary-password))?$/);
 if(match){const u=await user(env,match[1]);if(request.method==='POST'&&match[2]){
  if(u.status!=='active')throw new AdminError(409,'USER_DISABLED','Enable the user before resetting access.');
  if(match[2]==='invite'){await auditStatement(env,'mmt_user',u.id,'instructions_requested').run();return adminJson(await issueLink(request,env,u,'invite',true));}
  const temporaryPassword='Hs!'+randomToken(18)+'9a',p=await passwordParts(temporaryPassword);await env.DB.batch([env.DB.prepare('UPDATE mmt_users SET password_salt=?,password_hash=?,must_change_password=1,temporary_used_at=NULL,temporary_expires_at=?,revision=revision+1,updated_at=? WHERE id=?').bind(p.salt,p.hash,new Date(Date.now()+86400000).toISOString(),now(),u.id),env.DB.prepare('DELETE FROM admin_sessions WHERE user_id=?').bind(u.id),env.DB.prepare('DELETE FROM mmt_reset_tokens WHERE user_id=?').bind(u.id),auditStatement(env,'mmt_user',u.id,'temporary_password_issued')]);return adminJson({temporaryPassword,message:'Share securely after verifying identity. Expires in 24 hours and must be changed before portal access.'});
 }
 if(request.method==='PUT'&&!match[2]){const b=await readAdminJson(request),p=profile(b),a=access(b);if(!['active','disabled'].includes(String(b.status)))throw new AdminError(422,'INVALID_STATUS','Choose Active or Disabled.');const result=await env.DB.prepare('UPDATE mmt_users SET first_name=?,last_name=?,email=?,phone=?,country=?,is_admin=?,permissions_json=?,status=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').bind(p.first_name,p.last_name,p.email,p.phone,p.country,a.is_admin,a.permissions_json,b.status,now(),u.id,Number(b.revision)).run();if(!result.meta.changes)throw new AdminError(409,'STALE_EDIT','This user changed. Refresh before saving.');await env.DB.batch([env.DB.prepare('DELETE FROM admin_sessions WHERE user_id=?').bind(u.id),env.DB.prepare('DELETE FROM mmt_reset_tokens WHERE user_id=?').bind(u.id),auditStatement(env,'mmt_user',u.id,'access_or_profile_updated')]);return adminJson({user:publicUser(await user(env,u.id))});}
 }
 const review=path.match(/^\/admin\/account\/requests\/([a-z0-9-]+)$/);
 if(review&&request.method==='PUT'){
  const b=await readAdminJson(request);const r=await env.DB.prepare("SELECT * FROM mmt_access_requests WHERE id=? AND status='pending'").bind(review[1]).first<Record<string,unknown>>();if(!r)throw new AdminError(409,'REQUEST_RESOLVED','This request was already reviewed.');
  if(!['approve','reject'].includes(String(b.action)))throw new AdminError(422,'INVALID_ACTION','Choose Approve or Reject.');
  if(b.action==='approve'&&r.kind==='recovery'&&b.identityVerified!==true)throw new AdminError(422,'VERIFY_IDENTITY','Verify identity using trusted records before approving recovery.');
  let u:User|null=null;
  if(b.action==='approve'){if(r.kind==='access')u=await createUser(env,{...r,...b,username:r.username});else{const id=line(b.user_id,80);u=await user(env,id);}}
  await env.DB.batch([env.DB.prepare('UPDATE mmt_access_requests SET status=?,user_id=?,resolved_at=?,resolved_by=? WHERE id=? AND status=\'pending\'').bind(b.action==='approve'?'approved':'rejected',u?.id??null,now(),session.user_id,review[1]),auditStatement(env,'mmt_access_request',review[1],String(b.action))]);
  const delivery=u&&r.kind==='access'?await issueLink(request,env,u,'invite',true):{};
  return adminJson({message:u?'Request approved. For recovery, use the verified user’s Temporary password action.':'Request rejected.',user:u?publicUser(u):null,...delivery});
 }
 throw new AdminError(404,'NOT_FOUND','Not found.');
 }catch(error){return accountError(error);}
}
