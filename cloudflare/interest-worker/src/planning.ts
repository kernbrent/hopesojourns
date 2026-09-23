import {AdminError,adminJson,authenticate,auditStatement,readAdminJson,type AdminEnv} from './admin';
import {can,type MmtIdentity} from './mmt-permissions';
type Row=Record<string,unknown>;
const sections=['team','content','logistics','budget'];
const placeholder=/\b(TBD|TODO)\b|Add the high-level plan|Review before publishing|Add destination-specific|Need to write/i;
function text(v:unknown,max=180,required=true){if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw new AdminError(422,'INVALID_FIELD','Complete the required fields.');return v.trim();}
function date(v:unknown){if(v==null||v==='')return null;const s=text(v,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)throw new AdminError(422,'INVALID_DATE','Choose a valid date.');return s;}
function requireAccess(user:MmtIdentity,section:'trips'|'contacts'|'inbox',edit=false){if(!can(user,section,edit))throw new AdminError(403,'ACCESS_DENIED','You do not have access to this record.');}
function taskAccess(user:MmtIdentity,t:Row,edit=false){if(t.trip_id)requireAccess(user,'trips',edit);if(t.person_id)requireAccess(user,'contacts',edit);if(!t.trip_id&&!t.person_id)requireAccess(user,'inbox',edit);}
async function rows(env:AdminEnv,sql:string,...args:(string|number|null)[]){return (await env.DB.prepare(sql).bind(...args).all<Row>()).results;}
async function trip(env:AdminEnv,id:string){const t=await env.DB.prepare('SELECT * FROM trips WHERE id=?').bind(id).first<Row>();if(!t)throw new AdminError(404,'NOT_FOUND','Trip not found.');return t;}
async function digest(value:unknown){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');}
export async function readiness(env:AdminEnv,id:string){
 const t=await trip(env,id);
 const [content,members,costs,tasks,reviews,charges,payments]=await Promise.all([
 rows(env,'SELECT * FROM trip_content WHERE trip_id=? ORDER BY id',id),rows(env,'SELECT * FROM trip_members WHERE trip_id=? ORDER BY person_id',id),
 rows(env,"SELECT * FROM trip_cost_items WHERE trip_id=? AND payment_status!='canceled' ORDER BY id",id),rows(env,'SELECT * FROM ministry_tasks WHERE trip_id=? ORDER BY id',id),
 rows(env,'SELECT * FROM trip_reviews WHERE trip_id=?',id),rows(env,"SELECT id,amount,status FROM trip_charges WHERE trip_id=? AND status NOT IN ('canceled','waived') ORDER BY id",id),rows(env,"SELECT id,amount,status FROM trip_payments WHERE trip_id=? AND status='received' ORDER BY id",id)]);
 const incomplete=content.filter(c=>placeholder.test(String(c.content))||!String(c.content).trim());
 const activeTasks=tasks.filter(x=>x.status==='open');
 const values:Record<string,unknown>={team:members,content,logistics:[t.start_date,t.end_date,t.location,activeTasks,content.filter(c=>c.content_type==='itinerary')],budget:[costs,charges,payments,t.budget_completed_at]};
 const result=await Promise.all(sections.map(async section=>{
  const fingerprint=await digest(values[section]),saved=reviews.find(r=>r.section===section);
  const issues:string[]=[];
  if(section==='team'&&!members.some(m=>m.status!=='withdrawn'))issues.push('No active team members.');
  if(section==='content'){if(!content.length)issues.push('No trip content.');if(incomplete.length)issues.push(`${incomplete.length} content items have placeholders or empty text.`);if(content.some(c=>c.publication_status==='draft'&&c.visibility!=='admin'))issues.push('Traveler content drafts still need review.');}
  if(section==='logistics'){if(!t.start_date||!t.end_date)issues.push('Trip dates are missing.');if(activeTasks.length)issues.push(`${activeTasks.length} trip tasks remain open.`);if(!content.some(c=>c.content_type==='itinerary'))issues.push('No itinerary entered.');}
  const money=costs.some(c=>Number(c.estimated_total)||Number(c.actual_total))||charges.length>0||payments.length>0;
  const na=section==='budget'&&saved?.status==='not_applicable'&&!money&&saved.fingerprint===fingerprint;
  if(section==='budget'&&!na){if(costs.some(c=>c.needs_estimate))issues.push('Budget items still need estimates.');if(!t.budget_completed_at)issues.push('Budget has not been finished.');}
  const state=na?'not_applicable':saved?.fingerprint===fingerprint&&!issues.length?'reviewed':saved?'needs_review':'not_reviewed';
  return {section,state,issues,fingerprint,canSkip:section==='budget'&&!money,note:saved?.note||'',reviewedAt:saved?.reviewed_at||null};
 }));
 const warnings:string[]=[];if(t.status==='completed'&&String(t.end_date)>new Date().toISOString().slice(0,10))warnings.push('This trip is marked Completed before its end date. Review the trip status.');
 return {sections:result,warnings};
}
export async function templateStatements(env:AdminEnv,templateId:string,tripId:string,start:string|null,end:string|null,now:string){
 const found=await env.DB.prepare('SELECT snapshot FROM trip_templates WHERE id=? AND archived=0').bind(templateId).first<{snapshot:string}>();
 if(!found)throw new AdminError(422,'TEMPLATE_NOT_FOUND','Choose an available template.');
 const snapshot=JSON.parse(found.snapshot) as {content:Row[],costs:Row[]};const statements:D1PreparedStatement[]=[];
 for(const c of snapshot.content){const day=start&&c.day_offset!=null?new Date(Date.parse(start)+Number(c.day_offset)*86400000).toISOString().slice(0,10):null;
 if(day&&end&&day>end)throw new AdminError(422,'TEMPLATE_DATES','The template has more days than this trip. Extend the end date or choose another template.');
 statements.push(env.DB.prepare(`INSERT INTO trip_content(id,trip_id,content_type,title,content,event_date,event_time,visibility,publication_status,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'travelers','draft',?,?,?)`).bind(crypto.randomUUID(),tripId,c.content_type,c.title,c.content,day,c.event_time,Number(c.sort_order)||0,now,now));}
 for(const c of snapshot.costs)statements.push(env.DB.prepare(`INSERT INTO trip_cost_items(id,trip_id,category_id,description,quantity,calculation_method,percentage_rate,needs_estimate,budget_group,travel_eligible,bill_to_traveler,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,?,?,?,?,?)`).bind(crypto.randomUUID(),tripId,c.category_id,c.description,c.quantity,c.calculation_method,c.percentage_rate,c.budget_group,c.travel_eligible,c.bill_to_traveler,now,now));
 return statements;
}
export async function handlePlanning(request:Request,env:AdminEnv,path:string):Promise<Response>{
 try{
 const edit=request.method!=='GET',session=await authenticate(request,env,edit),user=session.user;
 const url=new URL(request.url),suffix=path.slice('/admin/planning'.length),now=new Date().toISOString();
 if(suffix==='/dashboard'&&request.method==='GET'){
 const tasks=(await rows(env,`SELECT t.*,p.first_name||' '||p.last_name person_name,tr.title trip_title,u.first_name||' '||u.last_name owner_name FROM ministry_tasks t LEFT JOIN people p ON p.id=t.person_id LEFT JOIN trips tr ON tr.id=t.trip_id LEFT JOIN mmt_users u ON u.id=t.owner_id ORDER BY t.due_date IS NULL,t.due_date,t.created_at DESC`)).filter(t=>{try{taskAccess(user,t);return true;}catch{return false;}});
 const trips=can(user,'trips')?await rows(env,"SELECT id,title,start_date,end_date,status FROM trips WHERE status NOT IN ('archived','canceled') ORDER BY start_date"):[];
 const users=await rows(env,"SELECT id,first_name,last_name FROM mmt_users WHERE status='active' AND hs_access=1 ORDER BY first_name,last_name");
 return adminJson({tasks:tasks.map(t=>({...t,canEdit:(()=>{try{taskAccess(user,t,true);return true;}catch{return false;}})()})),trips,owners:users,people:can(user,'contacts')?await rows(env,'SELECT id,first_name,last_name FROM people ORDER BY last_name_normalized'):[],canEdit:{trips:can(user,'trips',true),contacts:can(user,'contacts',true),inbox:can(user,'inbox',true)}});
 }
 if(suffix==='/tasks'&&request.method==='POST'){
 const b=await readAdminJson(request),prior=b.id?await env.DB.prepare('SELECT * FROM ministry_tasks WHERE id=?').bind(String(b.id)).first<Row>():null;
 if(b.id&&!prior)throw new AdminError(404,'NOT_FOUND','Task not found.');if(prior)taskAccess(user,prior,true);
 const row={trip_id:b.tripId||null,person_id:b.personId||null};taskAccess(user,row,true);
 if(row.trip_id)await trip(env,String(row.trip_id));if(row.person_id&&!await env.DB.prepare('SELECT id FROM people WHERE id=?').bind(row.person_id).first())throw new AdminError(422,'INVALID_PERSON','Choose an existing contact.');
 if(b.ownerId&&!await env.DB.prepare("SELECT id FROM mmt_users WHERE id=? AND status='active' AND hs_access=1").bind(b.ownerId).first())throw new AdminError(422,'INVALID_OWNER','Choose an active portal user.');
 const title=text(b.title),notes=text(b.notes??'',4000,false),due=date(b.dueDate),status=String(b.status||'open');if(!['open','completed','canceled'].includes(status))throw new AdminError(422,'INVALID_STATUS','Choose a task status.');
 const id=prior?String(prior.id):crypto.randomUUID();
 if(prior){const result=await env.DB.prepare('UPDATE ministry_tasks SET title=?,notes=?,trip_id=?,person_id=?,owner_id=?,due_date=?,status=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').bind(title,notes,row.trip_id,row.person_id,b.ownerId||null,due,status,now,id,Number(b.revision)).run();if(!result.meta.changes)throw new AdminError(409,'CONFLICT','This task changed. Refresh before editing.');}
 else await env.DB.prepare('INSERT INTO ministry_tasks(id,title,notes,trip_id,person_id,owner_id,due_date,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,title,notes,row.trip_id,row.person_id,b.ownerId||null,due,status,now,now).run();
 await auditStatement(env,'ministry_task',id,prior?'updated':'created',{actorUserId:user.id}).run();return adminJson({id},prior?200:201);
 }
 const review=suffix.match(/^\/trips\/([a-f0-9-]{36})\/readiness$/i);
 if(review){requireAccess(user,'trips',edit);const data=await readiness(env,review[1]);if(!edit)return adminJson(data);
 if(request.method!=='POST')throw new AdminError(405,'METHOD','Method not allowed.');const b=await readAdminJson(request),section=data.sections.find(s=>s.section===b.section);if(!section)throw new AdminError(422,'INVALID_SECTION','Choose a readiness area.');
 if(b.fingerprint!==section.fingerprint)throw new AdminError(409,'CONFLICT','The trip changed. Review the latest information.');
 const status=b.status==='not_applicable'?'not_applicable':'reviewed';if(status==='not_applicable'&&!section.canSkip||status==='reviewed'&&section.issues.length)throw new AdminError(422,'NOT_READY','Resolve the listed items before confirming readiness.');
 const note=text(b.note??'',1000,status==='not_applicable');
 await env.DB.batch([env.DB.prepare('INSERT INTO trip_reviews(trip_id,section,status,fingerprint,note,reviewed_by,reviewed_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(trip_id,section) DO UPDATE SET status=excluded.status,fingerprint=excluded.fingerprint,note=excluded.note,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at').bind(review[1],section.section,status,section.fingerprint,note,user.id,now),auditStatement(env,'trip',review[1],'readiness_reviewed',{section:section.section,status})]);return adminJson({ok:true});
 }
 if(suffix==='/templates'){requireAccess(user,'trips',edit);if(!edit)return adminJson({templates:await rows(env,'SELECT id,title,created_at FROM trip_templates WHERE archived=0 ORDER BY title')});
 const b=await readAdminJson(request);if(b.archive){await env.DB.prepare('UPDATE trip_templates SET archived=1,updated_at=? WHERE id=?').bind(now,String(b.archive)).run();return adminJson({ok:true});}
 const source=await trip(env,String(b.tripId)),selected=Array.isArray(b.contentIds)?b.contentIds.map(String):[];
 const content=(await rows(env,"SELECT * FROM trip_content WHERE trip_id=? AND visibility!='admin' ORDER BY sort_order,event_date",String(source.id))).filter(c=>selected.includes(String(c.id))).map(c=>({content_type:c.content_type,title:c.title,content:c.content,event_time:c.event_time,sort_order:c.sort_order,day_offset:c.event_date&&source.start_date?Math.round((Date.parse(String(c.event_date))-Date.parse(String(source.start_date)))/86400000):null}));
 if(content.some(c=>c.day_offset!=null&&(c.day_offset<0||c.day_offset>365)))throw new AdminError(422,'TEMPLATE_DATES','Selected content must fall within the trip dates.');
 const costs=b.includeBudget?await rows(env,"SELECT category_id,description,quantity,calculation_method,percentage_rate,budget_group,travel_eligible,bill_to_traveler FROM trip_cost_items WHERE trip_id=? AND payment_status!='canceled'",String(source.id)):[];
 const id=crypto.randomUUID();await env.DB.batch([env.DB.prepare('INSERT INTO trip_templates(id,title,snapshot,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id,text(b.title),JSON.stringify({content,costs}),now,now),auditStatement(env,'trip_template',id,'created',{sourceTrip:source.id})]);return adminJson({id},201);
 }
 throw new AdminError(404,'NOT_FOUND','Planning tool not found.');
 }catch(e){if(e instanceof AdminError)return adminJson({error:e.message,code:e.code},e.status);console.error('Planning request failed',e instanceof Error?e.message:'Unknown error');return adminJson({error:'Could not complete the planning request.'},500);}
}
