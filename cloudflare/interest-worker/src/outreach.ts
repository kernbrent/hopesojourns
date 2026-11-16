import {AdminError,adminJson,authenticate,auditStatement,readAdminJson,type AdminEnv} from './admin';
import {can} from './mmt-permissions';
type Row=Record<string,any>;
export const outreachStages=['not_contacted','awaiting_response','in_conversation','meeting_scheduled','active_partner','not_interested','follow_up_later'];
function fail(s:string,status=422):never{throw new AdminError(status,'OUTREACH_ERROR',s);}
const text=(v:any,max=180,required=false):string=>{if(typeof v!=='string'||v.length>max||required&&!v.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))fail('Complete the fields within their length limits.');return v.trim();};
const norm=(s:string)=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US');
const list=(v:any,max=100):Row[]=>{if(!Array.isArray(v)||v.length>max)fail('Invalid list or too many records.');return v;};
const mail=(v:any)=>{const s=text(v||'',254);if(s&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s))fail('Enter a valid email address.');return s.toLowerCase();};
const day=(v:any)=>{if(!v)return null;const s=text(v,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)fail('Choose a valid follow-up date.');return s;};
const rows=async(env:AdminEnv,sql:string,...args:any[])=>(await env.DB.prepare(sql).bind(...args).all<Row>()).results;
function profile(b:Row){
 const d=b.data||{},data:Row={};for(const key of ['denomination','address','city','county','region','postalCode','country','phone','notes','sizeEvidence'])data[key]=text(d[key]||'',key==='notes'?8000:1000);
 data.email=mail(d.email);data.website=text(d.website||'',2000);if(data.website&&!/^https?:\/\//i.test(data.website))fail('Use an HTTP or HTTPS website.');
 data.sources=list(d.sources||[],30).map(v=>text(v,2000));if(data.sources.some((s:string)=>!/^https?:\/\//i.test(s)))fail('Use HTTP or HTTPS source links.');
 data.opportunities=list(d.opportunities||[],5);if(data.opportunities.some((s:string)=>!['church_partnership','speaking','giving','journey','other'].includes(s)))fail('Choose valid opportunities.');
 data.drivingMiles=d.drivingMiles==null?null:Number(d.drivingMiles);if(data.drivingMiles!==null&&(!Number.isFinite(data.drivingMiles)||data.drivingMiles<0))fail('Invalid driving distance.');
 const stage=b.stage||'not_contacted',response=b.response||'none',kind=b.kind||'organization';
 if(!outreachStages.includes(stage)||!['none','positive','declined'].includes(response)||!['organization','person'].includes(kind))fail('Choose a valid stage, response and record kind.');
 return {name:text(b.name,180,true),kind,stage,response,data,nextAction:text(b.nextAction||'',1000),dueDate:day(b.dueDate),ownerId:b.ownerId||null};
}
function person(p:Row){return {id:p.id?text(p.id,80):crypto.randomUUID(),name:text(p.name,180,true),role:text(p.role||'',180),email:mail(p.email),phone:text(p.phone||'',80)};}
function activity(b:Row){
 const kind=b.kind||'note';if(!['email_sent','email_received','call','meeting','note'].includes(kind))fail('Choose a valid activity type.');
 const occurredAt=text(b.occurredAt||new Date().toISOString(),40,true);if(!Number.isFinite(Date.parse(occurredAt)))fail('Enter a valid activity time.');
 const metadata=b.metadata||{};if(typeof metadata!=='object'||Array.isArray(metadata)||JSON.stringify(metadata).length>10000)fail('Invalid email metadata.');
 return {id:crypto.randomUUID(),sourceKey:b.sourceKey?text(b.sourceKey,250):null,kind,occurredAt,subject:text(b.subject||'',300),body:text(b.body||'',50000),metadata};
}
const activitySQL=(env:AdminEnv,id:string,a:ReturnType<typeof activity>,uid:string,now:string)=>env.DB.prepare('INSERT INTO outreach_activities(id,prospect_id,source_key,kind,occurred_at,subject,body,metadata_json,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(a.id,id,a.sourceKey,a.kind,a.occurredAt,a.subject,a.body,JSON.stringify(a.metadata),uid,now);
async function owner(env:AdminEnv,id:any){if(id&&!await env.DB.prepare("SELECT id FROM mmt_users WHERE id=? AND status='active' AND hs_access=1").bind(id).first())fail('Choose an active portal owner.');}
async function detail(env:AdminEnv,id:string):Promise<Row>{const p=await env.DB.prepare('SELECT * FROM outreach_prospects WHERE id=?').bind(id).first<Row>();if(!p)fail('Prospect not found.',404);return {...p,data:JSON.parse(p!.data_json),data_json:undefined,people:await rows(env,'SELECT * FROM outreach_people WHERE prospect_id=? ORDER BY rowid',id),activities:(await rows(env,'SELECT * FROM outreach_activities WHERE prospect_id=? ORDER BY occurred_at DESC,created_at DESC',id)).map(a=>({...a,metadata:JSON.parse(a.metadata_json),metadata_json:undefined}))};}
async function matches(env:AdminEnv,c:Row){const parts=c.name.trim().split(/\s+/);return rows(env,"SELECT id,first_name,last_name,email,organization FROM people WHERE (?<>'' AND email_normalized=?) OR (first_name_normalized=? AND last_name_normalized=?) LIMIT 30",c.email,norm(c.email),norm(parts[0]),norm(parts.slice(1).join(' ')));}
export async function handleOutreach(request:Request,env:AdminEnv,path:string):Promise<Response>{try{
 const write=request.method!=='GET',session=await authenticate(request,env,write),user=session.user;
 if(!can(user,'contacts',write))fail('Contact access is required for Outreach.',403);
 const suffix=path.slice('/admin/outreach'.length),now=new Date().toISOString();
 if(suffix===''&&!write)return adminJson({prospects:(await rows(env,`SELECT p.*,(SELECT group_concat(name||' '||email,' ') FROM outreach_people WHERE prospect_id=p.id) people_search,(SELECT MAX(occurred_at) FROM outreach_activities WHERE prospect_id=p.id AND kind IN ('email_sent','email_received','call','meeting')) last_contact_at,u.first_name||' '||u.last_name owner_name FROM outreach_prospects p LEFT JOIN mmt_users u ON u.id=p.owner_id ORDER BY p.due_date IS NULL,p.due_date,p.name`)).map(p=>({...p,data:JSON.parse(p.data_json),data_json:undefined})),owners:await rows(env,"SELECT id,first_name,last_name FROM mmt_users WHERE hs_access=1 AND status='active' ORDER BY first_name"),canEdit:can(user,'contacts',true)});
 if(!write){const m=suffix.match(/^\/([^/]+)(\/matches)?$/);if(!m)fail('Not found.',404);const p=await detail(env,m![1]);if(!m![2])return adminJson({prospect:p});return adminJson({ministries:await rows(env,'SELECT id,name FROM ministries WHERE name_normalized=?',norm(p.name)),people:await Promise.all(p.people.map(async(c:Row)=>({outreachPersonId:c.id,candidates:await matches(env,c)})))});}
 if(request.method!=='POST')fail('Method not allowed.',405);const b=await readAdminJson(request,1024*1024);
 if(suffix==='/import'){
  const records=list(b.prospects,50),statements=[],keys=new Set();let skipped=0;
  for(const raw of records){const key=text(raw.sourceKey,200,true);if(keys.has(key))fail('Duplicate import source key.');keys.add(key);if(await env.DB.prepare('SELECT id FROM outreach_prospects WHERE source_key=?').bind(key).first()){skipped++;continue;}
   const p=profile(raw),id=crypto.randomUUID();await owner(env,p.ownerId);
   statements.push(env.DB.prepare('INSERT INTO outreach_prospects(id,source_key,name,kind,stage,response,data_json,next_action,due_date,owner_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,key,p.name,p.kind,p.stage,p.response,JSON.stringify(p.data),p.nextAction,p.dueDate,p.ownerId||user.id,now,now));
   for(const c of list(raw.people||[],30).map(person))statements.push(env.DB.prepare('INSERT INTO outreach_people(id,prospect_id,name,role,email,phone) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),id,c.name,c.role,c.email,c.phone));
   for(const a of list(raw.activities||[],50).map(activity))statements.push(activitySQL(env,id,a,user.id,now));
   statements.push(auditStatement(env,'outreach',id,'imported',{sourceKey:key}));
  }if(statements.length)await env.DB.batch(statements);return adminJson({created:records.length-skipped,skipped});
 }
 if(suffix===''){
  const p=profile(b),prior=b.id?await detail(env,String(b.id)):null,id=prior?.id||crypto.randomUUID();await owner(env,p.ownerId);
  const people=list(b.people||[],30).map(person);if(new Set(people.map(c=>c.id)).size!==people.length)fail('Duplicate person identifiers.');if(prior?.converted_at)fail('This prospect is already in Contacts. Edit linked people there.',409);
  const guard=crypto.randomUUID(),statements=[];
  if(prior){statements.push(env.DB.prepare('INSERT INTO meeting_save_guard(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM outreach_prospects WHERE id=? AND revision=?) THEN 1 ELSE 0 END').bind(guard,id,Number(b.revision)),env.DB.prepare('UPDATE outreach_prospects SET name=?,kind=?,stage=?,response=?,data_json=?,next_action=?,due_date=?,owner_id=?,revision=revision+1,updated_at=? WHERE id=?').bind(p.name,p.kind,p.stage,p.response,JSON.stringify(p.data),p.nextAction,p.dueDate,p.ownerId,now,id),env.DB.prepare('DELETE FROM outreach_people WHERE prospect_id=?').bind(id));}
  else statements.push(env.DB.prepare('INSERT INTO outreach_prospects(id,name,kind,stage,response,data_json,next_action,due_date,owner_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,p.name,p.kind,p.stage,p.response,JSON.stringify(p.data),p.nextAction,p.dueDate,p.ownerId,now,now));
  for(const c of people)statements.push(env.DB.prepare('INSERT INTO outreach_people(id,prospect_id,name,role,email,phone) VALUES(?,?,?,?,?,?)').bind(c.id,id,c.name,c.role,c.email,c.phone));
  statements.push(auditStatement(env,'outreach',id,prior?'updated':'created'));if(prior)statements.push(env.DB.prepare('DELETE FROM meeting_save_guard WHERE id=?').bind(guard));await env.DB.batch(statements);return adminJson({prospect:await detail(env,id)},prior?200:201);
 }
 const m=suffix.match(/^\/([^/]+)\/(activities|convert|workflow)$/);if(!m)fail('Not found.',404);const p=await detail(env,m![1]);
 if(m![2]==='workflow'){
  const clean=profile({...p,...b,data:p.data});await owner(env,clean.ownerId);
  const guard=crypto.randomUUID();await env.DB.batch([
   env.DB.prepare('INSERT INTO meeting_save_guard(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM outreach_prospects WHERE id=? AND revision=?) THEN 1 ELSE 0 END').bind(guard,p.id,Number(b.revision)),
   env.DB.prepare('UPDATE outreach_prospects SET stage=?,response=?,next_action=?,due_date=?,owner_id=?,revision=revision+1,updated_at=? WHERE id=?').bind(clean.stage,clean.response,clean.nextAction,clean.dueDate,clean.ownerId,now,p.id),
   auditStatement(env,'outreach',p.id,'workflow_updated'),env.DB.prepare('DELETE FROM meeting_save_guard WHERE id=?').bind(guard)
  ]);return adminJson({prospect:await detail(env,p.id)});
 }
 if(m![2]==='activities'){const a=activity(b);await env.DB.batch([activitySQL(env,p.id,a,user.id,now),auditStatement(env,'outreach',p.id,'activity_added',{kind:a.kind})]);return adminJson({prospect:await detail(env,p.id)},201);}
 if(p.converted_at)return adminJson({prospect:p,alreadyConverted:true});if(p.response!=='positive')fail('Record a positive response before adding this prospect to Contacts.');if(Number(b.revision)!==p.revision)fail('This prospect changed. Refresh before converting.',409);
 const selected=list(b.people||[],30),seen=new Set(),guard=crypto.randomUUID(),statements=[];if(p.kind==='person'&&!selected.length)fail('Select at least one person.');
 statements.push(env.DB.prepare('INSERT INTO meeting_save_guard(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM outreach_prospects WHERE id=? AND revision=? AND converted_at IS NULL) THEN 1 ELSE 0 END').bind(guard,p.id,p.revision));let ministryId=null;
 if(p.kind==='organization'){const existing=await rows(env,'SELECT id FROM ministries WHERE name_normalized=?',norm(p.name));ministryId=b.ministryId||existing[0]?.id||crypto.randomUUID();if(b.ministryId&&!await env.DB.prepare('SELECT id FROM ministries WHERE id=?').bind(b.ministryId).first())fail('Choose an existing ministry.');if(!b.ministryId&&!existing.length)statements.push(env.DB.prepare("INSERT INTO ministries(id,name,name_normalized,address_line_1,city,region,postal_code,country,email,phone,website,notes,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?)").bind(ministryId,p.name,norm(p.name),p.data.address,p.data.city,p.data.region,p.data.postalCode,p.data.country,p.data.email,p.data.phone,p.data.website,p.data.notes,now,now));}
 for(const choice of selected){const c=p.people.find((x:Row)=>x.id===choice.id);if(!c||seen.has(c.id))fail('Select distinct people from this prospect.');seen.add(c.id);const found=await matches(env,c);let personId=choice.personId||null;
  if(personId&&!await env.DB.prepare('SELECT id FROM people WHERE id=?').bind(personId).first())fail('Choose an existing contact.');if(!personId&&found.length>1)fail('Several contacts match '+c.name+'. Select which contact to use.',409);personId ||= found[0]?.id||crypto.randomUUID();
  if(!choice.personId&&!found.length){const parts=c.name.trim().split(/\s+/),first=parts[0],last=parts.slice(1).join(' ');statements.push(env.DB.prepare("INSERT INTO people(id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,phone,phone_normalized,organization,record_source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,'manual',?,?)").bind(personId,first,last,norm(first),norm(last),c.email,norm(c.email),c.phone,c.phone.replace(/\D/g,''),p.kind==='organization'?p.name:'',now,now));}
  statements.push(env.DB.prepare("INSERT OR IGNORE INTO contact_types(person_id,contact_type,created_at) VALUES(?,'ministry_contact',?)").bind(personId,now));if(ministryId)statements.push(env.DB.prepare('INSERT INTO ministry_contacts(ministry_id,person_id,role,is_primary,created_at,updated_at) VALUES(?,?,?,0,?,?) ON CONFLICT(ministry_id,person_id) DO NOTHING').bind(ministryId,personId,c.role,now,now));statements.push(env.DB.prepare('UPDATE outreach_people SET person_id=? WHERE id=? AND prospect_id=?').bind(personId,c.id,p.id));
 }
 statements.push(env.DB.prepare('UPDATE outreach_prospects SET converted_ministry_id=?,converted_at=?,revision=revision+1,updated_at=? WHERE id=?').bind(ministryId,now,now,p.id),env.DB.prepare("INSERT INTO outreach_activities(id,prospect_id,kind,occurred_at,subject,body,metadata_json,created_by,created_at) VALUES(?,?,'conversion',?,'Added to Contacts',?,'{}',?,?)").bind(crypto.randomUUID(),p.id,now,selected.length+' selected people linked; outreach history retained.',user.id,now),auditStatement(env,'outreach',p.id,'converted',{ministryId,people:[...seen]}),env.DB.prepare('DELETE FROM meeting_save_guard WHERE id=?').bind(guard));await env.DB.batch(statements);return adminJson({prospect:await detail(env,p.id)});
 }catch(e){if(e instanceof AdminError)return adminJson({error:e.message,code:e.code},e.status);if(/CHECK constraint|UNIQUE constraint/.test(String(e)))return adminJson({error:'This record changed or matches existing data. Refresh and review before saving.',code:'CONFLICT'},409);console.error('Outreach request failed');return adminJson({error:'Unable to save Outreach. Refresh and try again.'},500);}}
