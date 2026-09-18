import {AdminError,adminJson,auditStatement,readAdminJson,randomToken,type AdminEnv} from './admin';
import {profile,username,user,publicUser,issueLink,passwordParts,type User} from './mmt-users';
import {currentPortal,sections,csmSections,type MmtIdentity,type Portal} from './mmt-permissions';
import {accountEmailReady} from './account-email';

type Session={user_id:string;user:MmtIdentity};
const now=()=>new Date().toISOString();
function deny(message='This action requires an Organization Administrator.'):never{throw new AdminError(403,'ACCESS_DENIED',message);}
function membership(value:unknown,portal:Portal){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new AdminError(422,'INVALID_ACCESS','Choose portal access.');
 const b=value as Record<string,unknown>,p=b.permissions as Record<string,unknown>|undefined,result:Record<string,string>={};
 for(const key of portal==='hs'?sections:csmSections){const v=String(p?.[key]??'blocked');if(!['blocked','read','edit'].includes(v))throw new AdminError(422,'INVALID_ACCESS','Choose Blocked, Read only, or Edit.');result[key]=v;}
 return {enabled:b.enabled===true||b.enabled===1?1:0,is_admin:b.is_admin===true||b.is_admin===1?1:0,permissions:JSON.stringify(result)};
}
function existing(u:User,p:Portal){return {enabled:p==='hs'?u.hs_access!==0:!!u.csm_access,is_admin:p==='hs'?!!u.is_admin:!!u.csm_is_admin,permissions:JSON.parse((p==='hs'?u.permissions_json:u.csm_permissions_json)||'{}')};}
function changes(b:Record<string,unknown>,u:User|null,actor:MmtIdentity){
 const portal=currentPortal(),org=!!actor.is_org_admin,values=(b.memberships||{}) as Record<string,unknown>;
 if(!org){
  if(b.is_org_admin!==undefined||b.status!==undefined)deny();
  if(Object.keys(values).some(p=>p!==portal))deny('You can manage access only to your own portal.');
  if(u?.is_org_admin)deny('Only Organization Administrators can manage another Organization Administrator.');
  if(u&&['first_name','last_name','email','phone','country','username'].some(k=>b[k]!==undefined&&b[k]!==u[k as keyof User]))deny('Only the account owner or an Organization Administrator can edit shared identity.');
 }
 const legacy={enabled:true,is_admin:b.is_admin,permissions:b.permissions||{}};
 const hs=membership(values.hs??(portal==='hs'&&(b.permissions!==undefined||(!u&&!b.memberships))?legacy:u?existing(u,'hs'):{enabled:false}),'hs');
 const csm=membership(values.csm??(portal==='csm'&&(b.permissions!==undefined||(!u&&!b.memberships))?legacy:u?existing(u,'csm'):{enabled:false}),'csm');
 const role=org?(b.is_org_admin===undefined?u?.is_org_admin||0:b.is_org_admin===true?1:0):u?.is_org_admin||0;
 const status=org?String(b.status??u?.status??'active'):u?.status||'active';
 if(!['active','disabled'].includes(status))throw new AdminError(422,'INVALID_STATUS','Choose active or suspended.');
 return {hs,csm,role,status};
}
async function save(env:AdminEnv,b:Record<string,unknown>,u:User|null,actor:MmtIdentity){
 const a=changes(b,u,actor),p=profile(u?{...u,...b}:b),time=now(),id=u?.id||crypto.randomUUID();
 if(u){
  const result=await env.DB.prepare('UPDATE mmt_users SET first_name=?,last_name=?,email=?,phone=?,country=?,is_org_admin=?,hs_access=?,is_admin=?,permissions_json=?,csm_access=?,csm_is_admin=?,csm_permissions_json=?,status=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND deleted_at IS NULL').bind(p.first_name,p.last_name,p.email,p.phone,p.country,a.role,a.hs.enabled,a.hs.is_admin,a.hs.permissions,a.csm.enabled,a.csm.is_admin,a.csm.permissions,a.status,time,id,Number(b.revision)).run();
  if(!result.meta.changes)throw new AdminError(409,'STALE_EDIT','This account changed. Refresh before saving.');
  // Membership changes end that portal's sessions; shared identity/role/status changes end both.
  const global=!!actor.is_org_admin;
  await env.DB.prepare('DELETE FROM admin_sessions WHERE user_id=? AND (?=1 OR portal=?)').bind(id,global?1:0,currentPortal()).run();
  if(global)await env.DB.prepare('DELETE FROM mmt_reset_tokens WHERE user_id=?').bind(id).run();
 }else{
  await env.DB.prepare('INSERT INTO mmt_users(id,username,first_name,last_name,email,phone,country,is_org_admin,hs_access,is_admin,permissions_json,csm_access,csm_is_admin,csm_permissions_json,status,registered_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,username(b.username),p.first_name,p.last_name,p.email,p.phone,p.country,a.role,a.hs.enabled,a.hs.is_admin,a.hs.permissions,a.csm.enabled,a.csm.is_admin,a.csm.permissions,a.status,time,time).run();
 }
 await auditStatement(env,'mmt_user',id,u?'access_or_profile_updated':'created',{portal:currentPortal(),before:u?{profile:profile(u),status:u.status,is_org_admin:u.is_org_admin,hs:existing(u,'hs'),csm:existing(u,'csm')}:null,after:{profile:p,...a}}).run();
 return user(env,id);
}
function scoped(u:User,actor:MmtIdentity){if(!actor.is_org_admin&&!(currentPortal()==='hs'?u.hs_access:u.csm_access))deny('This account is not enrolled in your portal. Ask an Organization Administrator to grant access.');}
export async function handleSharedUsers(request:Request,env:AdminEnv,path:string,session:Session):Promise<Response>{
 const actor=session.user,portal=currentPortal();if(!actor.is_admin)deny('Portal Administrator access is required.');
 if(path==='/admin/account/users'&&request.method==='GET'){
  const rows=await env.DB.prepare('SELECT * FROM mmt_users WHERE deleted_at IS NULL AND (?=1 OR (CASE WHEN ?=\'hs\' THEN hs_access ELSE csm_access END)=1) ORDER BY username').bind(actor.is_org_admin?1:0,portal).all<User>();
  const requests=await env.DB.prepare('SELECT * FROM mmt_access_requests WHERE (?=1 OR portal=?) ORDER BY created_at DESC LIMIT 250').bind(actor.is_org_admin?1:0,portal).all();
  const emails=await env.DB.prepare('SELECT e.* FROM mmt_email_events e JOIN mmt_users u ON u.id=e.user_id WHERE (?=1 OR (CASE WHEN ?=\'hs\' THEN u.hs_access ELSE u.csm_access END)=1) ORDER BY e.created_at DESC LIMIT 100').bind(actor.is_org_admin?1:0,portal).all();
  return adminJson({users:rows.results.map(u=>{const v=publicUser(u);if(!actor.is_org_admin)delete (v.memberships as Partial<typeof v.memberships>)[portal==='hs'?'csm':'hs'];return v;}),requests:requests.results,emailEvents:emails.results,emailReady:accountEmailReady(env)});
 }
 if(path==='/admin/account/users'&&request.method==='POST'){
  const b=await readAdminJson(request),u=await save(env,b,null,actor);return adminJson({user:publicUser(u),...await issueLink(request,env,u,'invite',true)},201);
 }
 const match=path.match(/^\/admin\/account\/users\/([a-z0-9-]+)(?:\/(invite|temporary-password))?$/);
 if(match){const u=await user(env,match[1]);scoped(u,actor);
  if(request.method==='PUT'&&!match[2])return adminJson({user:publicUser(await save(env,await readAdminJson(request),u,actor))});
  if(request.method==='DELETE'&&!match[2]){
   if(!actor.is_org_admin)deny('Remove this portal’s access in Edit. Deleting a shared account requires an Organization Administrator.');
   if(u.id===session.user_id)throw new AdminError(409,'OWN_ACCOUNT','You cannot delete your own account.');
   const b=await readAdminJson(request);if(b.confirmUsername!==u.username)throw new AdminError(422,'CONFIRM_DELETE','Type the user name exactly to confirm deletion.');
   const time=now(),result=await env.DB.prepare("UPDATE mmt_users SET deleted_username=username,deleted_email=email,username='deleted:'||id,email='deleted:'||id,deleted_at=?,status='disabled',password_hash=NULL,password_salt=NULL,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND deleted_at IS NULL").bind(time,time,u.id,Number(b.revision)).run();
   if(!result.meta.changes)throw new AdminError(409,'STALE_EDIT','Refresh before deleting.');
   await env.DB.batch([env.DB.prepare('DELETE FROM admin_sessions WHERE user_id=?').bind(u.id),env.DB.prepare('DELETE FROM mmt_reset_tokens WHERE user_id=?').bind(u.id),auditStatement(env,'mmt_user',u.id,'deleted',{portal})]);
   return adminJson({message:'Account deleted across both portals. Historical activity is preserved.'});
  }
  if(request.method==='POST'&&match[2]){
   if(u.status!=='active')throw new AdminError(409,'USER_DISABLED','Enable the user before resetting access.');
   if(!actor.is_org_admin&&u.is_org_admin)deny();
   if(match[2]==='invite'){await auditStatement(env,'mmt_user',u.id,'instructions_requested',{portal}).run();return adminJson(await issueLink(request,env,u,'invite',!!actor.is_org_admin));}
   if(!actor.is_org_admin)deny();
   const temporaryPassword='Hs!'+randomToken(18)+'9a',p=await passwordParts(temporaryPassword);
   await env.DB.batch([env.DB.prepare('UPDATE mmt_users SET password_salt=?,password_hash=?,must_change_password=1,temporary_used_at=NULL,temporary_expires_at=?,revision=revision+1,updated_at=? WHERE id=?').bind(p.salt,p.hash,new Date(Date.now()+86400000).toISOString(),now(),u.id),env.DB.prepare('DELETE FROM admin_sessions WHERE user_id=?').bind(u.id),env.DB.prepare('DELETE FROM mmt_reset_tokens WHERE user_id=?').bind(u.id),auditStatement(env,'mmt_user',u.id,'temporary_password_issued',{portal})]);
   return adminJson({temporaryPassword,message:'Share after verifying identity. Expires in 24 hours and requires a new password.'});
  }
 }
 const review=path.match(/^\/admin\/account\/requests\/([a-z0-9-]+)$/);
 if(review&&request.method==='PUT'){
  const b=await readAdminJson(request),r=await env.DB.prepare("SELECT * FROM mmt_access_requests WHERE id=? AND status='pending'").bind(review[1]).first<Record<string,unknown>>();
  if(!r)throw new AdminError(409,'REQUEST_RESOLVED','This request was already reviewed.');
  if(!actor.is_org_admin&&r.portal!==portal)deny();
  if(!['approve','reject'].includes(String(b.action)))throw new AdminError(422,'INVALID_ACTION','Choose Approve or Reject.');
  let u:User|null=null;
  if(b.action==='approve'){
   if(r.kind==='recovery'){if(!actor.is_org_admin)deny();if(b.identityVerified!==true)throw new AdminError(422,'VERIFY_IDENTITY','Verify identity before approving recovery.');u=await user(env,String(b.user_id));}
   else if(b.user_id){if(!actor.is_org_admin)deny('An Organization Administrator must link an existing shared account.');if(b.identityVerified!==true)throw new AdminError(422,'VERIFY_IDENTITY','Verify identity before linking accounts.');u=await user(env,String(b.user_id));const requested=r.portal==='csm'?'csm':'hs';const proposed=(b.memberships||{}) as Record<string,unknown>;u=await save(env,{memberships:{[requested]:proposed[requested]||{...existing(u,requested),enabled:true}},revision:u.revision},u,actor);}
   else u=await save(env,{...profile(r),...b,username:r.username, ...(b.memberships?{}:{memberships:{[String(r.portal)]:{enabled:true,is_admin:b.is_admin,permissions:b.permissions||{}}}})},null,actor);
  }
  const result=await env.DB.prepare("UPDATE mmt_access_requests SET status=?,user_id=?,resolved_at=?,resolved_by=? WHERE id=? AND status='pending'").bind(b.action==='approve'?'approved':'rejected',u?.id??null,now(),session.user_id,review[1]).run();
  if(!result.meta.changes)throw new AdminError(409,'REQUEST_RESOLVED','This request was already reviewed.');
  await auditStatement(env,'mmt_access_request',review[1],String(b.action),{portal:r.portal,user_id:u?.id}).run();
  return adminJson({message:u?'Request approved.':'Request rejected.',...(u&&!(r.kind==='access'&&b.user_id)?await issueLink(request,env,u,r.kind==='recovery'?'reset':'invite',!!actor.is_org_admin):{})});
 }
 throw new AdminError(404,'NOT_FOUND','Not found.');
}
