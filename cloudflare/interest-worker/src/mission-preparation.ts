import {AdminError,adminJson,authenticate,auditStatement,readAdminJson,type AdminEnv} from './admin';
import {can} from './mmt-permissions';
import {deliverInquiryEmail,inquiryPayload} from './inquiry-email';
import {outlineText} from '../../../mission-journey/content.js';

const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
const line=(v:unknown,max:number)=>{if(typeof v!=='string'||v.length>max||/[\u0000-\u001f\u007f]/.test(v))throw new AdminError(422,'INVALID_FIELD','Check your details and text lengths.');return v.normalize('NFKC').trim();};
async function limit(env:AdminEnv,key:string,count:number,until:number){
 const row=await env.DB.prepare('INSERT INTO mission_preparation_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,until).first<{count:number}>();
 if((row?.count||0)>count)throw new AdminError(429,'RATE_LIMIT','Too many requests. Please try again later or download the outline.');
}
export async function handleMissionPreparation(request:Request,env:AdminEnv,path:string):Promise<Response>{
 try{
  if(path==='/public/mission-preparation'&&request.method==='POST'){
   if(request.headers.get('origin')!==new URL(request.url).origin)throw new AdminError(403,'ORIGIN','Please request the outline from this website.');
   const b=await readAdminJson(request,8192);
   if(b.website)return adminJson({status:'accepted',shared:false},202);
   if(b.emailConsent!==true||b.consentVersion!=='2026-11-24')throw new AdminError(422,'CONSENT','Choose whether to receive the outline.');
   const id=line(b.id,36);if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))throw new AdminError(422,'INVALID_ID','Refresh the form and try again.');
   const email=line(b.email,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))throw new AdminError(422,'EMAIL','Enter a valid email address.');
   if(typeof b.shareProfile!=='boolean'||typeof b.contactConsent!=='boolean'||(!b.shareProfile&&b.contactConsent))throw new AdminError(422,'CONSENT','Review the sharing and contact choices.');
   let profile:Record<string,string>|null=null;
   if(b.shareProfile){profile={name:line(b.name??'',120),city:line(b.city??'',100),church:line(b.church??'',200),interest:line(b.interest??'',30)};if(!['','curious','considering','group','local'].includes(profile.interest))throw new AdminError(422,'INTEREST','Choose a listed interest.');}
   const signature=await hash(JSON.stringify({email,profile,contact:b.contactConsent,consent:b.consentVersion}));
   const prior=await env.DB.prepare('SELECT request_hash FROM mission_preparation_requests WHERE id=?').bind(id).first<{request_hash:string}>();
   if(prior&&prior.request_hash!==signature)throw new AdminError(409,'ID_REUSED','These details changed. Submit a new outline request.');
   if(!prior){const now=Date.now(),hour=Math.floor(now/3600000),day=Math.floor(now/86400000);await env.DB.prepare('DELETE FROM mission_preparation_limits WHERE expires_at<?').bind(now).run();await limit(env,await hash('ip:'+hour+':'+(request.headers.get('cf-connecting-ip')||'local')),10,(hour+1)*3600000);await limit(env,await hash('email:'+day+':'+email),3,(day+1)*86400000);}
   const now=new Date().toISOString(),mailId='mission-outline-'+id,payload=inquiryPayload(env,email,'Seven days to prepare your heart for mission work',outlineText());
   await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO mission_preparation_requests(id,request_hash,email,profile_json,contact_permission,consent_version,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,signature,email,profile?JSON.stringify(profile):null,b.contactConsent?1:0,'2026-11-24',now),
    env.DB.prepare("INSERT OR IGNORE INTO inquiry_emails(id,inquiry_id,kind,payload_json,attempt_key,updated_at) SELECT ?,id,'acknowledgment',?,?,? FROM mission_preparation_requests WHERE id=? AND request_hash=?").bind(mailId,JSON.stringify(payload),mailId,now,id,signature),
   ]);
   const saved=await env.DB.prepare('SELECT request_hash FROM mission_preparation_requests WHERE id=?').bind(id).first<{request_hash:string}>();if(saved?.request_hash!==signature)throw new AdminError(409,'ID_REUSED','These details changed. Submit a new outline request.');
   const delivery=await deliverInquiryEmail(env,mailId);return adminJson({status:delivery.status,shared:!!profile,requestId:id});
  }
  const write=request.method!=='GET',session=await authenticate(request,env,write);if(!can(session.user,'contacts',write))throw new AdminError(403,'ACCESS_DENIED','Contacts access is required.');
  if(request.method==='GET'&&path==='/admin/mission-preparation'){
   const offset=Math.max(0,Math.min(100000,Math.floor(Number(new URL(request.url).searchParams.get('offset'))||0)));
   const records=await env.DB.prepare(`SELECT r.id,r.email,r.profile_json,r.contact_permission,r.consent_version,r.created_at,r.reviewed_at,e.status delivery_status,e.error delivery_error FROM mission_preparation_requests r JOIN inquiry_emails e ON e.id='mission-outline-'||r.id WHERE r.profile_json IS NOT NULL OR e.status IN ('failed','uncertain','sending','queued') ORDER BY r.created_at DESC,r.id LIMIT 50 OFFSET ?`).bind(offset).all();
   return adminJson({records:records.results.map(r=>({...r,profile:r.profile_json?JSON.parse(String(r.profile_json)):null,profile_json:undefined})),canEdit:can(session.user,'contacts',true),offset});
  }
  const action=path.match(/^\/admin\/mission-preparation\/([a-f0-9-]{36})\/(review|retry)$/i);
  if(request.method==='POST'&&action){
   const row=await env.DB.prepare('SELECT id FROM mission_preparation_requests WHERE id=?').bind(action[1]).first();if(!row)throw new AdminError(404,'NOT_FOUND','Request not found.');
   if(action[2]==='retry')return adminJson(await deliverInquiryEmail(env,'mission-outline-'+action[1]));
   await env.DB.batch([env.DB.prepare('UPDATE mission_preparation_requests SET reviewed_at=? WHERE id=?').bind(new Date().toISOString(),action[1]),auditStatement(env,'mission_preparation',action[1],'reviewed',{})]);return adminJson({saved:true});
  }
  throw new AdminError(404,'NOT_FOUND','Not found.');
 }catch(e){if(e instanceof AdminError)return adminJson({error:e.message,code:e.code},e.status);console.error('Mission preparation request failed');return adminJson({error:'We could not complete this request. Retry with the same details or download the outline.'},503);}
}
