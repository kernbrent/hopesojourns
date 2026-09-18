import {AdminError,adminJson,authenticate,readAdminJson,randomToken,hashText,handleAdminRequest,type AdminEnv} from './admin';
import {handleAccountPublic,publicUser} from './mmt-users';
import {actorContext,currentPortal,hasPortal,effectiveUser,type MmtIdentity,type Portal} from './mmt-permissions';

export type SharedEnv=AdminEnv&{SHARED_SIGNIN?:string;HS_PORTAL_ORIGIN?:string;CSM_PORTAL_ORIGIN?:string};
export const portalOrigin=(env:SharedEnv,p:Portal)=>p==='hs'?(env.HS_PORTAL_ORIGIN||'https://hopesojourns.com'):(env.CSM_PORTAL_ORIGIN||'https://christiansteps.net');
export function switchCookie(value:string){return `mmt_switch=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${value?120:0}`;}
function cookie(request:Request,name:string){return request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';}
export async function startSwitch(env:SharedEnv,portal:Portal,requestedOrigin?:unknown){
 const verifier=randomToken(),source=portal==='hs'?'csm':'hs';
 const canonical=portalOrigin(env,source),allowed=new Set([canonical]);
 const canonicalUrl=new URL(canonical);if(canonicalUrl.protocol==='https:'&&!canonicalUrl.hostname.startsWith('www.'))allowed.add(canonicalUrl.origin.replace('://','://www.'));
 const origin=typeof requestedOrigin==='string'&&allowed.has(requestedOrigin)?requestedOrigin:canonical;
 return adminJson({url:origin+'/admin/shared-signin/#challenge='+await hashText(verifier)},200,{'Set-Cookie':switchCookie(verifier)});
}
export async function sharedSwitch(request:Request,env:SharedEnv,path:string):Promise<Response>{
 try{
  if(env.SHARED_SIGNIN!=='enabled')throw new AdminError(503,'SHARED_SIGNIN_DISABLED','Shared sign-in has not been activated.');
  if(currentPortal()==='hs'&&request.headers.get('origin')!==new URL(request.url).origin)throw new AdminError(403,'ORIGIN_REJECTED','Start the switch from your portal.');
  const portal=currentPortal(),target=portal==='hs'?'csm':'hs';
  const b=await readAdminJson(request);
  if(path==='/admin/switch/start'&&request.method==='POST')return startSwitch(env,portal,b.sourceOrigin);
  if(path==='/admin/switch/issue'&&request.method==='POST'){
   const session=await authenticate(request,env,true);
   if(session.user.must_change_password)throw new AdminError(403,'PASSWORD_CHANGE_REQUIRED','Change your password first.');
   const raw=(await env.DB.prepare('SELECT * FROM mmt_users WHERE id=?').bind(session.user_id).first<MmtIdentity>())!;
   if(!hasPortal(raw,target))throw new AdminError(403,'ACCESS_DENIED','You do not have access to the other portal.');
   if(typeof b.challenge!=='string'||!/^[a-f0-9]{64}$/.test(b.challenge))throw new AdminError(422,'INVALID_SWITCH','Start again from the other portal.');
   const code=randomToken();await env.DB.batch([
    env.DB.prepare('DELETE FROM mmt_switch_codes WHERE expires_at<=?').bind(new Date().toISOString()),
    env.DB.prepare('INSERT INTO mmt_switch_codes(code_hash,user_id,source_session_id,source,target,challenge,expires_at) VALUES(?,?,?,?,?,?,?)').bind(await hashText(code),raw.id,session.id,portal,target,b.challenge,new Date(Date.now()+60000).toISOString())]);
   return adminJson({url:portalOrigin(env,target)+'/admin/shared-signin/#code='+code});
  }
  if(path==='/admin/switch/finish'&&request.method==='POST'){
   const verifier=cookie(request,'mmt_switch');
   if(!/^[A-Za-z0-9_-]{40,100}$/.test(verifier)||typeof b.code!=='string'||!/^[A-Za-z0-9_-]{40,100}$/.test(b.code))throw new AdminError(422,'INVALID_SWITCH','This sign-in link is invalid. Start again.');
   const now=new Date().toISOString(),codeHash=await hashText(b.code),challenge=await hashText(verifier),claim=crypto.randomUUID();
   const row=await env.DB.prepare('SELECT c.*,s.expires_at AS session_expiry FROM mmt_switch_codes c JOIN admin_sessions s ON s.id=c.source_session_id AND s.portal=c.source WHERE c.code_hash=? AND c.target=? AND c.challenge=? AND c.consumed_at IS NULL AND c.expires_at>? AND s.expires_at>?').bind(codeHash,portal,challenge,now,now).first<{user_id:string;source:Portal;source_session_id:string;session_expiry:string}>();
   const u=row?await env.DB.prepare('SELECT * FROM mmt_users WHERE id=?').bind(row.user_id).first<MmtIdentity>():null;
   if(!row||!u||u.must_change_password||!hasPortal(u,portal)||!hasPortal(u,row.source))throw new AdminError(403,'INVALID_SWITCH','Access changed or this link expired. Start again.');
   const token=randomToken(),csrfToken=randomToken(24),id=crypto.randomUUID(),expiresAt=new Date(Math.min(Date.parse(row.session_expiry),Date.now()+8*3600000)).toISOString();
   const activePortal=portal==='hs'?'hs_access':'csm_access',sourcePortal=portal==='hs'?'csm_access':'hs_access';
   const results=await env.DB.batch([
    env.DB.prepare(`UPDATE mmt_switch_codes SET consumed_at=?,claim=? WHERE code_hash=? AND target=? AND challenge=? AND consumed_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM admin_sessions s JOIN mmt_users u ON u.id=s.user_id WHERE s.id=mmt_switch_codes.source_session_id AND s.expires_at>? AND u.status='active' AND u.deleted_at IS NULL AND u.must_change_password=0 AND u.${activePortal}=1 AND u.${sourcePortal}=1)`).bind(now,claim,codeHash,portal,challenge,now,now),
    env.DB.prepare('INSERT INTO admin_sessions(id,token_hash,csrf_token,created_at,expires_at,last_seen_at,user_id,portal) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM mmt_switch_codes WHERE code_hash=? AND claim=?)').bind(id,await hashText(token),csrfToken,now,expiresAt,now,u.id,portal,codeHash,claim)
   ]);
   if(!results[0].meta.changes)throw new AdminError(409,'INVALID_SWITCH','This link was already used or access changed. Start again.');
   await env.DB.prepare('UPDATE mmt_users SET last_login_at=? WHERE id=?').bind(now,u.id).run();
   const headers=new Headers();headers.append('Set-Cookie',`hs_admin_session=${token}; Path=/api/interest; HttpOnly; Secure; SameSite=Strict`);headers.append('Set-Cookie',switchCookie(''));
   return adminJson({authenticated:true,csrfToken,expiresAt,user:publicUser(u,env)},200,headers);
  }
  throw new AdminError(404,'NOT_FOUND','Not found.');
 }catch(e){if(e instanceof AdminError)return adminJson({error:e.message,code:e.code},e.status);throw e;}
}

// Only the private named service entrypoint calls this. Portal identity is not
// accepted from HTTP headers or request bodies on the public HS worker.
export async function csmAuthority(request:Request,env:SharedEnv):Promise<Response>{
 if(env.SHARED_SIGNIN!=='enabled')return adminJson({error:'Shared sign-in is not activated.'},503);
 return actorContext.run({portal:'csm'},async()=>{
  const url=new URL(request.url),path=url.pathname;
  if(path.startsWith('/public/account/'))return handleAccountPublic(request,env,path);
  if(path.startsWith('/admin/switch/'))return sharedSwitch(request,env,path);
  if(['/admin/login','/admin/logout','/admin/password','/admin/session'].includes(path)||path.startsWith('/admin/account/'))return handleAdminRequest(request,env,path);
  if(path==='/authorize'){
   try{
    // Authenticate using the self route, then enforce CSM route permissions.
    const authRequest=new Request('https://identity.internal/admin/session',{headers:request.headers});
    const b=await readAdminJson(request),session=await authenticate(authRequest,env,b.method!=='GET');
    const u=session.user,p=String(b.path||'');
    if(u.must_change_password)throw new AdminError(403,'PASSWORD_CHANGE_REQUIRED','Change your temporary password first.');
    const section=/^\/(transactions|donors|distribution|paypal)(\/|$)/.test(p)?'giving':/^\/(data|settings|attachments|artifacts|invoices|invoice-assets|invoice-profiles|records|trips|donation-splits)(\/|$)/.test(p)?'finances':null;
    const permission=JSON.parse(u.permissions_json||'{}')[section||''];
    if(!section||(!u.is_admin&&!(permission==='edit'||b.method==='GET'&&permission==='read')))throw new AdminError(403,'ACCESS_DENIED','Your account does not have access to this action.');
    const raw=(await env.DB.prepare('SELECT * FROM mmt_users WHERE id=?').bind(u.id).first<MmtIdentity>())!;
    return adminJson({id:session.id,user_id:u.id,csrf_token:session.csrf_token,expires_at:session.expires_at,user:publicUser(raw,env)});
   }catch(e){if(e instanceof AdminError)return adminJson({error:e.message,code:e.code},e.status);throw e;}
  }
  return adminJson({error:'Not found.'},404);
 });
}
