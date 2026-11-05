import {AdminError,adminJson,authenticate,auditStatement,readAdminJson,type AdminEnv} from './admin';
import {can} from './mmt-permissions';
import {meetingTimezone,previewCalendar} from './meeting-calendar';
type Row=Record<string,any>;
type Entity={kind:'person'|'ministry';id:string;name?:string};
function bad(message:string,code='INVALID_MEETING',status=422):never{throw new AdminError(status,code,message);}
const text=(v:unknown,max=180)=>{if(typeof v!=='string'||v.length>max)bad('Use text within the field limit.');return (v as string).trim();};
const uuid=(v:unknown)=>{const s=text(v,36);if(!/^[a-f\d-]{36}$/i.test(s))bad('Invalid record identifier.');return s;};
const choice=(v:unknown,values:string[])=>{if(!values.includes(String(v)))bad('Choose a valid status.');return String(v);};
const list=(v:unknown,max=100):Row[]=>{if(!Array.isArray(v)||v.length>max||v.some(x=>!x||typeof x!=='object'))bad('Invalid list or too many entries.');return v as Row[];};
const day=(v:unknown)=>{if(!v)return null;const s=text(v,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)bad('Choose a real date.');return s;};
const rows=async(env:AdminEnv,sql:string,...args:any[]) => (await env.DB.prepare(sql).bind(...args).all<Row>()).results;
const hash=async(v:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(v)))),b=>b.toString(16).padStart(2,'0')).join('');
const safeUrl=(v:unknown)=>{const s=text(v||'',2000);if(s&&!/^https?:\/\//i.test(s))bad('Source links must use HTTPS or HTTP.');return s;};
function linkedContactIds(meeting:Row|null):string[]{
 if(!meeting)return [];
 return [...new Set<string>([
  ...meeting.participants.filter((e:Entity)=>e.kind==='person').map((e:Entity)=>e.id),
  ...meeting.introductions.filter((i:Row)=>!i.converted_task_id&&i.status!=='canceled').flatMap((i:Row)=>[...i.introducers,i.target].filter(e=>e?.kind==='person').map(e=>e.id)),
  ...meeting.tasks.filter((t:Row)=>t.person_id&&t.status!=='canceled').map((t:Row)=>t.person_id)
 ])];
}
function meetingContactDate(starts:string,allDay:boolean):string{
 if(allDay)return starts;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:meetingTimezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(starts)).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
}
export async function meetingData(env:AdminEnv,id?:string){
 const meetings=await rows(env,'SELECT * FROM meetings'+(id?' WHERE id=?':'')+' ORDER BY starts_at DESC',...(id?[id]:[]));
 const participants=await rows(env,`SELECT x.*,p.first_name||' '||p.last_name person_name,m.name ministry_name FROM meeting_participants x LEFT JOIN people p ON p.id=x.person_id LEFT JOIN ministries m ON m.id=x.ministry_id`);
 const introductions=await rows(env,'SELECT * FROM meeting_introductions ORDER BY created_at,id');
 const tasks=await rows(env,`SELECT t.*,u.first_name||' '||u.last_name owner_name FROM ministry_tasks t LEFT JOIN mmt_users u ON u.id=t.owner_id WHERE t.meeting_id IS NOT NULL AND t.deleted_at IS NULL ORDER BY t.due_date IS NULL,t.due_date,t.created_at`);
 const names=new Map((await rows(env,"SELECT id,'person' kind,trim(first_name||' '||last_name) name FROM people UNION ALL SELECT id,'ministry',name FROM ministries")).map(p=>[p.kind+':'+p.id,p.name]));
 const named=(e:Entity)=>({...e,name:names.get(e.kind+':'+e.id)||'Unavailable record'});
 return meetings.map(m=>({...m,participants:participants.filter(p=>p.meeting_id===m.id).map(p=>named({kind:p.person_id?'person':'ministry',id:p.person_id||p.ministry_id})),introductions:introductions.filter(i=>i.meeting_id===m.id).map(i=>({...i,introducers:JSON.parse(i.introducers_json).map(named),target:i.target_json?named(JSON.parse(i.target_json)):null})),tasks:tasks.filter(t=>t.meeting_id===m.id)}));
}
export async function meetingInboxItems(env:AdminEnv){return [...await rows(env,`SELECT 'meeting-task:'||t.id id,CASE WHEN t.task_kind='contact_details' THEN 'Complete contact details' WHEN t.direction='waiting' THEN 'Waiting on commitment' ELSE 'Meeting follow-up' END kind,t.title,t.notes detail,CASE WHEN t.status='open' THEN 'action' ELSE 'completed' END status,t.created_at,t.due_date,'/admin/meetings/?meeting='||t.meeting_id action_url FROM ministry_tasks t WHERE t.meeting_id IS NOT NULL AND t.deleted_at IS NULL`),...await rows(env,`SELECT 'meeting-intro:'||i.id id,'Pending introduction' kind,COALESCE(json_extract(i.target_json,'$.name'),NULLIF(i.pending_name,''),'Introduction') title,i.next_action detail,CASE WHEN i.status IN ('connected','closed','canceled') THEN 'completed' ELSE 'action' END status,i.created_at,'/admin/meetings/?meeting='||i.meeting_id action_url FROM meeting_introductions i WHERE i.converted_task_id IS NULL`)];}
async function save(request:Request,env:AdminEnv,userId:string){
 const b=await readAdminJson(request),id=uuid(b.id),operation=uuid(b.operationId),fingerprint=await hash(b);
 const replay=await env.DB.prepare('SELECT * FROM meeting_operations WHERE id=?').bind(operation).first<Row>();
 if(replay){if(replay.fingerprint!==fingerprint)bad('This save identifier was used for different changes.','CONFLICT',409);return adminJson({meeting:(await meetingData(env,replay.meeting_id))[0],replayed:true});}
 const prior=await env.DB.prepare('SELECT * FROM meetings WHERE id=?').bind(id).first<Row>();
 if(prior&&Number(b.revision)!==prior.revision)bad('This meeting changed. Reload it before saving.','CONFLICT',409);
 const now=new Date().toISOString(),statements:D1PreparedStatement[]=[],newKeys=new Map<string,Entity>();
 const entity=async(raw:Row):Promise<Entity>=>{
  if(raw.kind==='new'){
   const key=uuid(raw.key),name=text(raw.name,160);if(!name)bad('Name the new contact or retain an unnamed introduction.');
   if(newKeys.has(key))return newKeys.get(key)!;
   const known=await env.DB.prepare('SELECT person_id FROM meeting_contact_keys WHERE client_key=?').bind(key).first<{person_id:string}>();
   if(known)return {kind:'person',id:known.person_id};
   if(raw.confirmNew!==true)bad('Review matching contacts and confirm Add as new contact.');
   const personId=key,parts=name.split(/\s+/),first=parts.shift()!,last=parts.join(' ');
   statements.push(env.DB.prepare(`INSERT INTO people(id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,record_source,approved_duplicate,created_at,updated_at) VALUES(?,?,?,?,?,'','','manual',1,?,?)`).bind(personId,first,last,first.normalize('NFKC').toLowerCase(),last.normalize('NFKC').toLowerCase(),now,now),env.DB.prepare('INSERT INTO meeting_contact_keys VALUES(?,?)').bind(key,personId));
   if(raw.createReminder!==false)statements.push(env.DB.prepare(`INSERT INTO ministry_tasks(id,title,notes,person_id,owner_id,status,meeting_id,task_kind,created_at,updated_at) VALUES(?,?,?,?,?,'open',?,'contact_details',?,?)`).bind(crypto.randomUUID(),'Complete contact details: '+name,'Created from a meeting. Open the contact and complete the details when known.',personId,userId,id,now,now));
   statements.push(auditStatement(env,'person',personId,'meeting_minimal_contact_created',{meetingId:id,actorUserId:userId}));
   const e:Entity={kind:'person',id:personId};newKeys.set(key,e);return e;
  }
  const kind=choice(raw.kind,['person','ministry']) as Entity['kind'],entityId=uuid(raw.id);
  if(!await env.DB.prepare(`SELECT id FROM ${kind==='person'?'people':'ministries'} WHERE id=?`).bind(entityId).first())bad('A linked contact or ministry no longer exists.');return {kind,id:entityId};
 };
 let starts=text(b.starts_at,40),ends=text(b.ends_at,40);const allDay=b.all_day===true||b.all_day===1;
 if(allDay){day(starts);day(ends);}else if(![starts,ends].every(s=>/T.*(?:Z|[+-]\d\d:\d\d)$/.test(s)&&Number.isFinite(Date.parse(s))))bad('Choose a valid start and end time with timezone.');
 if(!allDay){starts=new Date(starts).toISOString();ends=new Date(ends).toISOString();}
 if(Date.parse(ends)<=Date.parse(starts))bad('The end must be after the start.');
 const title=text(b.title),type=text(b.meeting_type||'Meeting',80);if(!title)bad('Enter a meeting title.');
 const finishing=b.simplified===true&&b.finish===true;
 if(finishing)b.retainOpen=true; // Finish explicitly retains tasks, as explained beside the button.
 const occurrence=choice(finishing?'held':b.occurrence_status||'planned',['planned','held','canceled','not_held']),follow=choice(finishing?'closed':b.follow_up||'open',['open','closed']),archived=Number(finishing||b.archived===true||b.archived===1);
 const oldData=prior?(await meetingData(env,id))[0]:null;
 const introductions=list(b.introductions),tasks=list(b.tasks),participants=list(b.participants);
 // Existing work is retained. Omitting it from a save never completes or deletes it.
 const existingOpen=(oldData?.tasks||[]).filter((t:Row)=>t.status==='open'&&!tasks.some(x=>x.id===t.id&&(x.delete===true||['completed','canceled'].includes(x.status))));
 const pendingIntros=(oldData?.introductions||[]).filter((i:Row)=>!i.converted_task_id&&!['connected','closed','canceled'].includes(i.status)&&!introductions.some(x=>x.id===i.id&&['connected','closed','canceled'].includes(x.status)));
 const unresolved=existingOpen.length+pendingIntros.length+tasks.filter(t=>t.status==='open'&&t.delete!==true).length+introductions.filter(i=>!['connected','closed','canceled'].includes(i.status)).length;
 if((follow==='closed'&&prior?.follow_up!=='closed'||archived&&!prior?.archived)&&unresolved&&b.retainOpen!==true)bad('Review unresolved work and explicitly retain it, or resolve/cancel it before closing.','OPEN_WORK',409);
 let source=prior?.source_snapshot||null;
 const calendar=b.source?b.source as Row:null;
 if(prior&&calendar)bad('Refresh source details separately to preserve local edits.');
 let calendarId:null|string=null,eventId:null|string=null,occurrenceId:null|string=null;
 if(calendar){calendarId=text(calendar.calendar_id,300);eventId=text(calendar.event_id,500);occurrenceId=text(calendar.occurrence_id,100);if(!calendarId||!eventId||!occurrenceId)bad('Calendar identifiers are required.');source=JSON.stringify(calendar);const existing=await env.DB.prepare('SELECT id FROM meetings WHERE calendar_id=? AND event_id=? AND occurrence_id=?').bind(calendarId,eventId,occurrenceId).first<Row>();if(existing)return adminJson({meeting:(await meetingData(env,existing.id))[0],alreadyTracked:true});}
 // A CHECK failure rolls the entire batch back if another editor wins the revision race.
 statements.unshift(env.DB.prepare('INSERT INTO meeting_save_guard(id,valid) SELECT ?,CASE WHEN '+(prior?'EXISTS(SELECT 1 FROM meetings WHERE id=? AND revision=?)':'NOT EXISTS(SELECT 1 FROM meetings WHERE id=?)')+' THEN 1 ELSE 0 END').bind(operation,id,...(prior?[prior.revision]:[])));
 const values=[title,type,starts,ends,Number(allDay),'America/Chicago',text(b.location_name||'',300),text(b.street_address||'',700),text(b.notes||'',12000),occurrence,follow,archived];
 const meetingStatement=prior?env.DB.prepare(`UPDATE meetings SET title=?,meeting_type=?,starts_at=?,ends_at=?,all_day=?,timezone=?,location_name=?,street_address=?,notes=?,occurrence_status=?,follow_up=?,archived=?,revision=revision+1,updated_at=? WHERE id=?`).bind(...values,now,id):env.DB.prepare(`INSERT INTO meetings(title,meeting_type,starts_at,ends_at,all_day,timezone,location_name,street_address,notes,occurrence_status,follow_up,archived,id,created_by,created_at,updated_at,calendar_id,event_id,occurrence_id,source_url,source_snapshot) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...values,id,userId,now,now,calendarId,eventId,occurrenceId,safeUrl(calendar?.source_url||''),source);
 // Meeting must exist before contacts' reminder tasks are inserted.
 statements.splice(1,0,meetingStatement);
 const entities:Entity[]=[];for(const participant of participants)entities.push(await entity(participant));
 statements.push(env.DB.prepare('DELETE FROM meeting_participants WHERE meeting_id=?').bind(id));
 for(const e of new Map(entities.map(e=>[e.kind+e.id,e])).values())statements.push(env.DB.prepare('INSERT INTO meeting_participants VALUES(?,?,?)').bind(id,e.kind==='person'?e.id:null,e.kind==='ministry'?e.id:null));
 const introIds=new Set<string>();
 for(const i of introductions){const introId=uuid(i.id);if(introIds.has(introId))bad('Duplicate introduction.');introIds.add(introId);
  const existing=await env.DB.prepare('SELECT meeting_id,converted_task_id FROM meeting_introductions WHERE id=?').bind(introId).first<Row>();if(existing&&existing.meeting_id!==id)bad('Introduction belongs to another meeting.');
  if(existing?.converted_task_id)bad('This introduction is now a task. Update it in the task list.','INTRODUCTION_IS_TASK',409);
  const introducers=[];for(const r of list(i.introducers,30))introducers.push(await entity(r));
  const target=i.target?await entity(i.target):null,pending=text(i.pending_name||'',180);
  if(i.target_mode==='named'&&!target)bad('Link an existing contact or confirm Add as a new person for this named introduction.','INTRODUCTION_CONTACT_REQUIRED');
  if(!target&&!pending)bad('Describe the unnamed introduction.');
  statements.push(env.DB.prepare(`INSERT INTO meeting_introductions(id,meeting_id,introducers_json,target_json,pending_name,status,notes,promised_date,made_date,next_action,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET introducers_json=excluded.introducers_json,target_json=excluded.target_json,pending_name=excluded.pending_name,status=excluded.status,notes=excluded.notes,promised_date=excluded.promised_date,made_date=excluded.made_date,next_action=excluded.next_action,updated_at=excluded.updated_at`).bind(introId,id,JSON.stringify(introducers),target?JSON.stringify(target):null,pending,choice(i.status||'promised',['promised','made','outreach_pending','connected','closed','canceled']),text(i.notes||'',4000),day(i.promised_date),day(i.made_date),text(i.next_action||'',500),now,now));
  statements.push(env.DB.prepare('DELETE FROM meeting_introduction_entities WHERE introduction_id=?').bind(introId));
  for(const [role,es] of [['introducer',introducers],['target',target?[target]:[]]] as const)for(const e of es)statements.push(env.DB.prepare('INSERT INTO meeting_introduction_entities VALUES(?,?,?,?)').bind(introId,role,e.kind==='person'?e.id:null,e.kind==='ministry'?e.id:null));
 }
 const taskIds=new Set<string>();
 for(const t of tasks){const taskId=uuid(t.id);if(taskIds.has(taskId))bad('Duplicate action.');taskIds.add(taskId);
  const existing=await env.DB.prepare('SELECT * FROM ministry_tasks WHERE id=?').bind(taskId).first<Row>();if(existing&&(existing.deleted_at||existing.meeting_id!==id||Number(t.revision)!==existing.revision))bad('An action changed. Reload before saving.','CONFLICT',409);
  if(existing)statements.push(env.DB.prepare('INSERT INTO meeting_save_guard(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM ministry_tasks WHERE id=? AND revision=?) THEN 1 ELSE 0 END').bind(taskId,taskId,existing.revision));
  if(t.delete===true){
   if(!existing)bad('Only saved tasks can be deleted.');
   statements.push(env.DB.prepare('UPDATE ministry_tasks SET deleted_at=?,revision=revision+1,updated_at=? WHERE id=?').bind(now,now,taskId),auditStatement(env,'ministry_task',taskId,'deleted',{actorUserId:userId,meetingId:id,before:existing}),env.DB.prepare('DELETE FROM meeting_save_guard WHERE id=?').bind(taskId));
   continue;
  }
  const related=t.related?await entity(t.related):null,owner=t.owner_id?text(t.owner_id,100):null;
  if(owner&&!await env.DB.prepare("SELECT id FROM mmt_users WHERE id=? AND status='active' AND hs_access=1").bind(owner).first())bad('Choose an active responsible user.');
  const intro=t.introduction_id?uuid(t.introduction_id):null;if(intro&&!introIds.has(intro)&&!(oldData?.introductions||[]).some((i:Row)=>i.id===intro))bad('Choose an introduction from this meeting.');
  if(existing?.task_kind==='contact_details'&&related&&related.id!==existing.person_id)bad('Contact reminders must stay linked to their original contact.');
  const taskTitle=text(t.title);if(!taskTitle)bad('Describe each action.');
  statements.push(env.DB.prepare(`INSERT INTO ministry_tasks(id,title,notes,person_id,ministry_id,owner_id,due_date,status,meeting_id,introduction_id,direction,responsible_name,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,notes=excluded.notes,person_id=excluded.person_id,ministry_id=excluded.ministry_id,owner_id=excluded.owner_id,due_date=excluded.due_date,status=excluded.status,introduction_id=excluded.introduction_id,direction=excluded.direction,responsible_name=excluded.responsible_name,revision=ministry_tasks.revision+1,updated_at=excluded.updated_at`).bind(taskId,taskTitle,text(t.notes||'',4000),existing?.task_kind==='contact_details'?existing.person_id:related?.kind==='person'?related.id:null,related?.kind==='ministry'?related.id:null,owner,day(t.due_date),choice(t.status||'open',['open','completed','canceled']),id,intro,choice(t.direction||'mine',['mine','waiting']),text(t.responsible_name||'',180),now,now));
  if(b.simplified===true&&intro&&taskId===intro)statements.push(env.DB.prepare('UPDATE meeting_introductions SET converted_task_id=? WHERE id=? AND meeting_id=? AND converted_task_id IS NULL').bind(taskId,intro,id));
  if(existing)statements.push(env.DB.prepare('DELETE FROM meeting_save_guard WHERE id=?').bind(taskId));
 }
 if((follow==='closed'&&prior?.follow_up!=='closed'||archived&&!prior?.archived)&&newKeys.size&&b.retainOpen!==true)bad('New contacts create open contact-detail reminders. Review and retain that independent work before closing.','OPEN_WORK',409);
 if(occurrence==='held'&&archived){
  // Only Finish (or its legacy equivalent) records contact. Later edits update
  // newly linked people, without repeatedly replacing manual contact notes.
  const priorContacts=prior?.occurrence_status==='held'&&prior.archived?linkedContactIds(oldData):[];
  const contactDay=meetingContactDate(starts,allDay),contactAt=contactDay+'T00:00:00.000Z';
  const fullNote=('Meeting: '+title).normalize('NFKC').replace(/\s+/g,' ').trim();
  const contactNote=fullNote.length>50?fullNote.slice(0,49).replace(/[\uD800-\uDBFF]$/u,'')+'…':fullNote;
  const eligible=`id IN (
   SELECT person_id FROM meeting_participants WHERE meeting_id=?1 AND person_id IS NOT NULL
   UNION SELECT e.person_id FROM meeting_introduction_entities e JOIN meeting_introductions i ON i.id=e.introduction_id WHERE i.meeting_id=?1 AND i.converted_task_id IS NULL AND i.status!='canceled' AND e.person_id IS NOT NULL
   UNION SELECT person_id FROM ministry_tasks WHERE meeting_id=?1 AND deleted_at IS NULL AND status!='canceled' AND person_id IS NOT NULL
  ) AND id NOT IN (SELECT value FROM json_each(?2))
   AND (last_contacted_at IS NULL OR last_contacted_at='' OR substr(last_contacted_at,1,10)<=?3)`;
  // Audit and contact fields share the meeting transaction and revision guard.
  statements.push(env.DB.prepare(`INSERT INTO audit_events(id,entity_type,entity_id,event_type,metadata_json,created_at,actor_user_id)
   SELECT lower(hex(randomblob(16))),'person',id,'meeting_contacted',json_object('meetingId',?1,'actorUserId',?7,'beforeDate',last_contacted_at,'beforeNote',last_contacted_note,'lastContactedAt',?4,'lastContactedNote',?5),?6,?7 FROM people WHERE ${eligible}`)
   .bind(id,JSON.stringify(priorContacts),contactDay,contactAt,contactNote,now,userId));
  statements.push(env.DB.prepare(`UPDATE people SET last_contacted_at=?4,last_contacted_note=?5,updated_at=?6 WHERE ${eligible}`)
   .bind(id,JSON.stringify(priorContacts),contactDay,contactAt,contactNote,now));
 }
 statements.push(env.DB.prepare('INSERT INTO meeting_operations VALUES(?,?,?)').bind(operation,id,fingerprint),env.DB.prepare('DELETE FROM meeting_save_guard WHERE id=?').bind(operation),auditStatement(env,'meeting',id,prior?'updated':'created',{actorUserId:userId,retainOpen:b.retainOpen===true,before:oldData,changes:b}));
 try{await env.DB.batch(statements);}catch(e){if(String(e).includes('CHECK constraint')||String(e).includes('UNIQUE constraint'))bad('A linked record or meeting changed during this save. Reload before retrying.','CONFLICT',409);throw e;}
 return adminJson({meeting:(await meetingData(env,id))[0]},prior?200:201);
}
export async function handleMeetings(request:Request,env:AdminEnv,path:string):Promise<Response>{
 try{const edit=request.method!=='GET',session=await authenticate(request,env,edit);
 if(!can(session.user,'contacts',edit))bad('Contact access is required.','ACCESS_DENIED',403);
 const suffix=path.slice('/admin/meetings'.length),url=new URL(request.url);
 if(suffix==='/calendar-preview'&&request.method==='POST'){const b=await readAdminJson(request);return adminJson({events:previewCalendar(text(b.ics,25000),text(b.calendarId,300),day(b.from)!,day(b.to)!),connection:'file'});}
 if(suffix==='/refresh'&&request.method==='POST'){
  const b=await readAdminJson(request),id=uuid(b.id),m=await env.DB.prepare('SELECT * FROM meetings WHERE id=?').bind(id).first<Row>();if(!m)bad('Meeting not found.','NOT_FOUND',404);
  const source=b.source as Row;if(!source||source.calendar_id!==m.calendar_id||source.event_id!==m.event_id||source.occurrence_id!==m.occurrence_id)bad('Choose the same calendar occurrence.');
  const snapshot=JSON.stringify(source);if(snapshot.length>25000)bad('Calendar event is too large.');
  // Refresh stores a review proposal only. Applying fields uses the normal, revision-protected editor.
  const result=await env.DB.prepare('UPDATE meetings SET source_review=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').bind(snapshot,new Date().toISOString(),id,Number(b.revision)).run();if(!result.meta.changes)bad('Meeting changed. Reload before refreshing.','CONFLICT',409);
  await auditStatement(env,'meeting',id,'calendar_refresh_review',{actorUserId:session.user.id}).run();return adminJson({meeting:(await meetingData(env,id))[0]});
 }
 if(suffix==='/review-source'&&request.method==='POST'){const b=await readAdminJson(request);const r=await env.DB.prepare('UPDATE meetings SET source_snapshot=COALESCE(source_review,source_snapshot),source_review=NULL,revision=revision+1,updated_at=? WHERE id=? AND revision=?').bind(new Date().toISOString(),uuid(b.id),Number(b.revision)).run();if(!r.meta.changes)bad('Meeting changed. Reload before reviewing.','CONFLICT',409);return adminJson({ok:true});}
 if(suffix===''&&request.method==='POST')return await save(request,env,session.user.id);
 if(suffix===''&&request.method==='GET'){
  let meetings=await meetingData(env,url.searchParams.get('id')||undefined);
  const entityId=url.searchParams.get('entityId'),kind=url.searchParams.get('kind');
  if(entityId)meetings=meetings.filter(m=>m.participants.some((e:Entity)=>e.kind===kind&&e.id===entityId)||m.introductions.some((i:Row)=>[...i.introducers,i.target].filter(Boolean).some(e=>e.kind===kind&&e.id===entityId))||m.tasks.some((t:Row)=>(kind==='person'?t.person_id:t.ministry_id)===entityId));
  return adminJson({meetings,canEdit:can(session.user,'contacts',true),timezone:'America/Chicago',weekStart:0,calendarConnection:'file',owners:await rows(env,"SELECT id,first_name||' '||last_name name FROM mmt_users WHERE status='active' AND hs_access=1")});
 }
 bad('Meeting route not found.','NOT_FOUND',404);
 }catch(e){if(e instanceof AdminError)return adminJson({error:e.message,code:e.code},e.status);console.error('Meeting request failed',e instanceof Error?e.message:'Unknown');return adminJson({error:'Could not complete the meeting request. Refresh the saved record before retrying.'},500);}
}
