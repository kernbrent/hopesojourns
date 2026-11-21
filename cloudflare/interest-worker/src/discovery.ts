import {AdminError,adminJson,authenticate,auditStatement,readAdminJson,type AdminEnv} from './admin';
import {can} from './mmt-permissions';

export const discoveryChoices:Record<string,string[]>={
 path:['mission','internship','corporate','support','unsure'],
 motivation:['faith','relationships','learning','impact','leadership','unsure'],
 gifts:['hospitality','children','practical','communication','professional','listening','unsure'],
 company:['individual','family','church','students','colleagues','unsure'],
 timing:['soon','year','later','browsing'],
 concern:['cost','time','readiness','travel','fit','none'],
};
export function validateDiscovery(value:unknown):Record<string,string>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new AdminError(422,'INVALID_ANSWERS','Please complete the questions.');
 const input=value as Record<string,unknown>,result:Record<string,string>={};
 for(const [key,choices] of Object.entries(discoveryChoices)){
  if(typeof input[key]!=='string'||!choices.includes(input[key] as string))throw new AdminError(422,'INVALID_ANSWERS','Please choose an answer for each question.');
  result[key]=input[key] as string;
 }
 return result;
}
async function limit(request:Request,env:AdminEnv){
 const hour=Math.floor(Date.now()/3600000),ip=request.headers.get('cf-connecting-ip')||'local';
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${hour}:${ip}`));
 const key=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
 await env.DB.prepare('DELETE FROM discovery_rate_limits WHERE expires_at<?').bind(Date.now()).run();
 const row=await env.DB.prepare('INSERT INTO discovery_rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,(hour+1)*3600000).first<{count:number}>();
 if((row?.count||0)>30)throw new AdminError(429,'RATE_LIMIT','Too many saved interviews. Please try again later.');
}
export async function handleDiscovery(request:Request,env:AdminEnv,path:string):Promise<Response>{
 try{
  const self=path==='/admin/discovery-self',publicSave=path==='/public/discovery';
  if(self&&request.method==='GET'){
   const session=await authenticate(request,env);
   return adminJson({linked:!!session.user.hs_person_id,name:session.user.first_name,accountId:session.user.id+':'+(session.user.hs_person_id||''),csrfToken:session.csrf_token});
  }
  if((publicSave||self)&&request.method==='POST'){
   const session=self?await authenticate(request,env,true):null;
   await limit(request,env);
   const body=await readAdminJson(request,8192);
   if(body.consent!==true||body.consentVersion!=='2026-11-20')throw new AdminError(422,'CONSENT_REQUIRED','Choose whether to share your answers.');
   const answers=validateDiscovery(body.answers);
   if(typeof body.id!=='string'||!/^[a-f0-9-]{36}$/i.test(body.id))throw new AdminError(422,'INVALID_ID','Please restart the interview.');
   // Identity comes only from the authenticated account, never visitor-supplied IDs or email.
   const personId=session?.user.hs_person_id||null,now=new Date().toISOString();
   await env.DB.prepare('INSERT INTO discovery_interviews(id,created_at,answers_json,person_id,identity_source,consent_version,linked_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(body.id,now,JSON.stringify(answers),personId,personId?'account':'anonymous','2026-11-20',personId?now:null).run();
   return adminJson({saved:true},201);
  }
  if(path==='/admin/discovery/contacts'&&request.method==='GET'){
   await authenticate(request,env);
   const q=(new URL(request.url).searchParams.get('q')||'').trim();
   if(q.length<2||q.length>100)return adminJson({contacts:[]});
   const contacts=await env.DB.prepare("SELECT id,first_name,last_name,email FROM people WHERE instr(lower(first_name||' '||last_name||' '||coalesce(email,'')),lower(?))>0 ORDER BY last_name,first_name LIMIT 20").bind(q).all();
   return adminJson({contacts:contacts.results});
  }
  if(path==='/admin/discovery'&&request.method==='GET'){
   const session=await authenticate(request,env);
   const url=new URL(request.url),offset=Math.max(0,Math.min(100000,Number(url.searchParams.get('offset'))||0));
   const counts=await env.DB.prepare('SELECT COUNT(*) total,COUNT(person_id) linked FROM discovery_interviews').first();
   const distribution=await env.DB.prepare("SELECT j.key question,j.value answer,COUNT(*) total FROM discovery_interviews d,json_each(d.answers_json) j GROUP BY j.key,j.value ORDER BY j.key,total DESC").all();
   const records=await env.DB.prepare(`SELECT d.*,p.first_name,p.last_name,json_extract(t.details_json,'$.ageRange') age_range,json_extract(t.details_json,'$.occupation') occupation,json_extract(t.details_json,'$.church') church FROM discovery_interviews d LEFT JOIN people p ON p.id=d.person_id LEFT JOIN traveler_profiles t ON t.person_id=p.id ORDER BY d.created_at DESC,d.id DESC LIMIT 50 OFFSET ?`).bind(offset).all();
   return adminJson({counts,distribution:distribution.results,records:records.results.map(r=>({...r,answers:JSON.parse(String(r.answers_json)),answers_json:undefined})),canEdit:can(session.user,'contacts',true),offset});
  }
  const link=path.match(/^\/admin\/discovery\/([a-f0-9-]{36})\/link$/i);
  if(link&&request.method==='POST'){
   const session=await authenticate(request,env,true),body=await readAdminJson(request,8192);
   const personId=body.personId===null?null:body.personId;
   if(personId!==null&&(typeof personId!=='string'||!await env.DB.prepare('SELECT id FROM people WHERE id=?').bind(personId).first()))throw new AdminError(422,'INVALID_CONTACT','Choose an existing contact.');
   if(!await env.DB.prepare('SELECT id FROM discovery_interviews WHERE id=?').bind(link[1]).first())throw new AdminError(404,'NOT_FOUND','Interview not found.');
   await env.DB.batch([
    env.DB.prepare('UPDATE discovery_interviews SET person_id=?,identity_source=?,linked_at=?,linked_by=? WHERE id=?').bind(personId,personId?'staff':'anonymous',personId?new Date().toISOString():null,session.user.id,link[1]),
    auditStatement(env,'discovery',link[1],personId?'contact_linked':'contact_unlinked',{personId}),
   ]);
   return adminJson({saved:true});
  }
  throw new AdminError(404,'NOT_FOUND','Not found.');
 }catch(error){
  if(error instanceof AdminError)return adminJson({error:error.message,code:error.code},error.status);
  console.error('Discovery request failed');return adminJson({error:'Answers could not be saved. Please try again.'},500);
 }
}
