import {readFileSync} from 'node:fs';
import {afterEach,expect,it} from 'vitest';
import {ministryFixture} from './ministry-fixture';
import {handleMeetings} from '../src/meetings';
import {handlePlanning} from '../src/planning';
import {handleMinistryAdminRequest} from '../src/ministry-admin';
import {previewCalendar,wallInstant} from '../src/meeting-calendar';
import {contactNameScore} from '../src/contact-name-search';
const fixtures:Awaited<ReturnType<typeof ministryFixture>>[]=[];
afterEach(()=>fixtures.splice(0).forEach(f=>f.sqlite.close()));
async function fixture(){const f=await ministryFixture();fixtures.push(f);const call=async(body?:any,suffix='',method?:string)=>{const p='/admin/meetings'+suffix;const response=await handleMeetings(f.request(p,body,method),f.env,p.split('?' )[0]);return {status:response.status,data:await response.json() as any};};return {...f,call};}
const meeting=(extra:any={})=>({id:crypto.randomUUID(),operationId:crypto.randomUUID(),title:'Coffee',meeting_type:'Coffee',starts_at:'2026-11-04T15:00:00.000Z',ends_at:'2026-11-04T16:00:00.000Z',participants:[],introductions:[],tasks:[],...extra});
const person=(name='Scott Sample')=>({kind:'new',key:crypto.randomUUID(),name,confirmNew:true});
it('creates minimal contacts and one shared reminder atomically, replays saves, and never silently merges similar names',async()=>{
 const f=await fixture(),p=person(),draft=meeting({participants:[p,p]});
 const saved=await f.call(draft);expect(saved.status).toBe(201);expect(saved.data.meeting.participants).toHaveLength(1);
 expect(saved.data.meeting.tasks).toHaveLength(1);expect(saved.data.meeting.tasks[0]).toMatchObject({task_kind:'contact_details',status:'open',person_id:p.key,meeting_id:draft.id});
 expect(f.sqlite.prepare('SELECT email,phone FROM people WHERE id=?').get(p.key)).toMatchObject({email:'',phone:null});
 expect((await f.call(draft)).data.replayed).toBe(true);
 const m=saved.data.meeting;expect((await f.call({...m,operationId:crypto.randomUUID()})).status).toBe(200);
 expect(f.sqlite.prepare('SELECT count(*) n FROM ministry_tasks WHERE task_kind=\'contact_details\'').get()?.n).toBe(1);
 expect((await f.call(meeting({participants:[person('Scott Sample')]}))).status).toBe(201);
 expect(f.sqlite.prepare("SELECT count(*) n FROM people WHERE first_name='Scott'").get()?.n).toBe(2);
 const broken=meeting({participants:[person('Atomic Example')],introductions:[{id:crypto.randomUUID(),pending_name:'',introducers:[]}]});
 expect((await f.call(broken)).status).toBe(422);expect(f.sqlite.prepare("SELECT count(*) n FROM people WHERE first_name='Atomic'").get()?.n).toBe(0);
 const conflict={...m,title:'Stale editor',operationId:crypto.randomUUID()};expect((await f.call(conflict)).status).toBe(409);
});
it('tracks multiple introductions and ministry links without inventing attendance or memberships',async()=>{
 const f=await fixture(),a=person('Blake Sample'),b=person('Scott Sample'),c=person('New Friend');const ministryId=crypto.randomUUID();
 f.sqlite.prepare("INSERT INTO ministries(id,name,name_normalized,created_at,updated_at) VALUES(?,'Ministry ABC','ministry abc','now','now')").run(ministryId);
 const draft=meeting({participants:[a,{kind:'ministry',id:ministryId}],introductions:[{id:crypto.randomUUID(),introducers:[a,b],target:c,status:'made',made_date:'2026-11-04'},{id:crypto.randomUUID(),introducers:[a],pending_name:'Unnamed coordinator',status:'promised'}]});
 const r=await f.call(draft);expect(r.status).toBe(201);expect(r.data.meeting.introductions).toHaveLength(2);expect(r.data.meeting.introductions.find((i:any)=>i.target).introducers).toHaveLength(2);
 expect(r.data.meeting.participants.map((p:any)=>p.id)).toEqual(expect.arrayContaining([a.key,ministryId]));expect(r.data.meeting.participants).toHaveLength(2);
 expect(f.sqlite.prepare('SELECT count(*) n FROM ministry_contacts').get()?.n).toBe(0);
 const profile=await f.call(undefined,'?kind=person&entityId='+c.key);expect(profile.data.meetings).toHaveLength(1);
 const m=r.data.meeting;m.introductions.find((i:any)=>!i.target).target={kind:'new',key:crypto.randomUUID(),name:'Coordinator Known',confirmNew:true};
 expect((await f.call({...m,operationId:crypto.randomUUID()})).status).toBe(200);
 expect(f.sqlite.prepare('SELECT count(*) n FROM meeting_introductions').get()?.n).toBe(2);
});
it('keeps open work independent of closure and History and protects shared tasks from bypass edits',async()=>{
 const f=await fixture(),r=await f.call(meeting({participants:[person()],tasks:[{id:crypto.randomUUID(),title:'Send notes',status:'open',direction:'mine'},{id:crypto.randomUUID(),title:'Await proposal',status:'open',direction:'waiting',due_date:'2026-10-01'}],introductions:[{id:crypto.randomUUID(),introducers:[],pending_name:'Pending person',status:'promised'}]}));expect(r.status).toBe(201);
 const m=r.data.meeting;expect((await f.call({...m,operationId:crypto.randomUUID(),archived:1,follow_up:'closed'})).status).toBe(409);
 const closed=await f.call({...m,operationId:crypto.randomUUID(),archived:1,follow_up:'closed',retainOpen:true});expect(closed.status).toBe(200);expect(closed.data.meeting.tasks.filter((t:any)=>t.status==='open')).toHaveLength(3);
 const inbox=await handleMinistryAdminRequest(f.request('/admin/ministry/inbox'),f.env,'/admin/ministry/inbox');const items=(await inbox.json() as any).items;expect(items.filter((i:any)=>i.id.startsWith('meeting-')&&i.status==='action')).toHaveLength(4);
 const attempt=await handleMinistryAdminRequest(f.request('/admin/ministry/inbox',{itemId:'meeting-task:'+m.tasks[0].id,action:'complete'}),f.env,'/admin/ministry/inbox');expect(attempt.status).toBe(409);
 const planning=await handlePlanning(f.request('/admin/planning/dashboard'),f.env,'/admin/planning/dashboard');expect((await planning.json() as any).tasks.filter((t:any)=>t.meeting_id===m.id)).toHaveLength(3);
 const edit=await handlePlanning(f.request('/admin/planning/tasks',{id:m.tasks[0].id,title:'Bypass',personId:crypto.randomUUID(),revision:1}),f.env,'/admin/planning/tasks');expect(edit.status).toBe(422);
 const reopened=await f.call({...closed.data.meeting,operationId:crypto.randomUUID(),follow_up:'open',archived:0});expect(reopened.status).toBe(200);
});
const ics='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:series@example.test\r\nDTSTART:20261102T150000Z\r\nDTEND:20261102T160000Z\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nSUMMARY:Coffee\r\nLOCATION:Coffee House\r\nATTENDEE;CN=Scott Sample:mailto:scott@example.test\r\nEND:VEVENT\r\nEND:VCALENDAR';
it('reviews calendar occurrences without importing, explicitly tracks one, deduplicates reimports and preserves local edits on canceled refresh',async()=>{
 const f=await fixture(),preview=await f.call({ics,calendarId:'calendar@example.test',from:'2026-11-01',to:'2026-11-30'},'/calendar-preview');expect(preview.status).toBe(200);expect(preview.data.events).toHaveLength(3);expect(f.sqlite.prepare('SELECT count(*) n FROM meetings').get()?.n).toBe(0);
 const source=preview.data.events[1],r=await f.call(meeting({source,starts_at:source.starts_at,ends_at:source.ends_at,notes:'My protected notes',participants:[person()]}));expect(r.status).toBe(201);expect(r.data.meeting.occurrence_status).toBe('planned');
 const duplicate=await f.call(meeting({source}));expect(duplicate.data.alreadyTracked).toBe(true);expect(duplicate.data.meeting.id).toBe(r.data.meeting.id);
 const m=r.data.meeting,refresh=await f.call({id:m.id,revision:m.revision,source:{...source,title:'Changed source',status:'CANCELLED'}},'/refresh');expect(refresh.status).toBe(200);expect(refresh.data.meeting).toMatchObject({notes:'My protected notes',title:'Coffee',occurrence_status:'planned'});expect(refresh.data.meeting.tasks).toHaveLength(1);expect(JSON.parse(refresh.data.meeting.source_review).status).toBe('CANCELLED');
 expect((await f.call(meeting({source:preview.data.events[2]}))).status).toBe(201);expect(f.sqlite.prepare('SELECT count(*) n FROM meetings').get()?.n).toBe(2);
});
it('handles timezone, all-day dates, recurrence exceptions and DST boundaries',()=>{
 expect(wallInstant('2026-11-04T09:00')).toBe('2026-11-04T15:00:00.000Z');expect(wallInstant('2026-07-04T09:00')).toBe('2026-07-04T14:00:00.000Z');expect(()=>wallInstant('2026-03-08T02:30')).toThrow('does not exist');
 const allDay=ics.replace('DTSTART:20261102T150000Z','DTSTART;VALUE=DATE:20261102').replace('DTEND:20261102T160000Z','DTEND;VALUE=DATE:20261103');const events=previewCalendar(allDay,'cal','2026-11-01','2026-11-30');expect(events[0]).toMatchObject({all_day:true,starts_at:'2026-11-02',ends_at:'2026-11-03'});
 const exception=ics.replace('END:VCALENDAR','BEGIN:VEVENT\r\nUID:series@example.test\r\nRECURRENCE-ID:20261109T150000Z\r\nDTSTART:20261109T170000Z\r\nDTEND:20261109T180000Z\r\nSTATUS:CANCELLED\r\nSUMMARY:Changed occurrence\r\nEND:VEVENT\r\nEND:VCALENDAR');expect(previewCalendar(exception,'cal','2026-11-01','2026-11-30')[1]).toMatchObject({occurrence_id:'2026-11-09T15:00:00Z',starts_at:'2026-11-09T17:00:00.000Z',status:'CANCELLED'});
});
it('enforces session, CSRF, read-only and blocked contact permissions for every meeting route',async()=>{
 const f=await fixture();const path='/admin/meetings';expect((await handleMeetings(new Request('http://localhost'+path),f.env,path)).status).toBe(401);
 const noCsrf=f.request(path,meeting());noCsrf.headers.delete('x-csrf-token');expect((await handleMeetings(noCsrf,f.env,path)).status).toBe(403);
 f.sqlite.exec(`INSERT INTO mmt_users(id,username,first_name,last_name,email,must_change_password,permissions_json,registered_at,updated_at) VALUES('reader','reader','Read','Only','read@example.test',0,'{"contacts":"read"}','now','now');UPDATE admin_sessions SET user_id='reader'`);
 expect((await f.call()).status).toBe(200);expect((await f.call(meeting())).status).toBe(403);expect((await f.call({ics,calendarId:'cal',from:'2026-11-01',to:'2026-11-30'},'/calendar-preview')).status).toBe(403);
 f.sqlite.exec("UPDATE mmt_users SET permissions_json='{}' WHERE id='reader'");expect((await f.call()).status).toBe(403);
});
it('rolls back contacts, relationships, reminders and meeting updates when a database write fails',async()=>{
 const f=await fixture();f.sqlite.exec("CREATE TRIGGER fail_meeting_action BEFORE INSERT ON ministry_tasks WHEN NEW.title='Fail this action' BEGIN SELECT RAISE(ABORT,'Simulated database failure'); END");
 const draft=meeting({participants:[person('Atomic Rollback')],tasks:[{id:crypto.randomUUID(),title:'Fail this action',status:'open',direction:'mine'}]});
 expect((await f.call(draft)).status).toBe(500);expect(f.sqlite.prepare('SELECT count(*) n FROM meetings').get()?.n).toBe(0);expect(f.sqlite.prepare('SELECT count(*) n FROM meeting_contact_keys').get()?.n).toBe(0);expect(f.sqlite.prepare('SELECT count(*) n FROM ministry_tasks').get()?.n).toBe(0);expect(f.sqlite.prepare("SELECT count(*) n FROM people WHERE first_name='Atomic'").get()?.n).toBe(0);
});
it('rejects an in-flight revision race atomically and preserves the winning edit',async()=>{
 const f=await fixture(),saved=await f.call(meeting()),m=saved.data.meeting,db=f.env.DB as any,original=db.batch;
 db.batch=async(statements:any[])=>{f.sqlite.prepare("UPDATE meetings SET title='Winning edit',revision=revision+1 WHERE id=?").run(m.id);return original(statements);};
 const result=await f.call({...m,operationId:crypto.randomUUID(),participants:[person('Race Loser')]});expect(result.status).toBe(409);expect(f.sqlite.prepare('SELECT title FROM meetings WHERE id=?').get(m.id)?.title).toBe('Winning edit');expect(f.sqlite.prepare("SELECT count(*) n FROM people WHERE first_name='Race'").get()?.n).toBe(0);
});
it('uses normalized partial and conservative similar-name matching without merging records',()=>{
 expect(contactNameScore('scot','Scott Example')).not.toBeNull();expect(contactNameScore('Scott Exampel','Scott Example')).not.toBeNull();expect(contactNameScore('José','Jose Example')).not.toBeNull();expect(contactNameScore('An','Ann Example')).not.toBeNull();expect(contactNameScore('Scott','Unrelated Person')).toBeNull();
});
it('requires a contact for a named introduction and converts an unnamed promise without duplicate reminders',async()=>{
 const f=await fixture(),introId=crypto.randomUUID();
 const missing=await f.call(meeting({introductions:[{id:introId,introducers:[],target_mode:'named',pending_name:'George Peterson',status:'promised'}]}));
 expect(missing.status).toBe(422);expect(missing.data.code).toBe('INTRODUCTION_CONTACT_REQUIRED');
 const saved=await f.call(meeting({introductions:[{id:introId,introducers:[],target_mode:'unnamed',pending_name:'George Peterson',status:'promised'}]}));
 expect(saved.status).toBe(201);expect(saved.data.meeting.tasks).toHaveLength(0);
 const m=saved.data.meeting;m.introductions[0]={...m.introductions[0],target_mode:'named',pending_name:'',target:person('George Peterson')};
 const fixed=await f.call({...m,operationId:crypto.randomUUID()});expect(fixed.status).toBe(200);
 expect(fixed.data.meeting.introductions[0].target).toMatchObject({kind:'person',name:'George Peterson'});
 expect(fixed.data.meeting.participants).toHaveLength(0);expect(fixed.data.meeting.tasks).toHaveLength(1);
 expect(fixed.data.meeting.tasks[0]).toMatchObject({task_kind:'contact_details',status:'open',meeting_id:m.id});
 expect((await f.call({...fixed.data.meeting,operationId:crypto.randomUUID()})).status).toBe(200);
 expect(f.sqlite.prepare("SELECT count(*) n FROM ministry_tasks WHERE task_kind='contact_details'").get()?.n).toBe(1);
 const inbox=await handleMinistryAdminRequest(f.request('/admin/ministry/inbox'),f.env,'/admin/ministry/inbox');
 expect((await inbox.json() as any).items).toEqual(expect.arrayContaining([expect.objectContaining({kind:'Complete contact details',status:'action',action_url:'/admin/meetings/?meeting='+m.id})]));
 const tasks=await handlePlanning(f.request('/admin/planning/dashboard'),f.env,'/admin/planning/dashboard');
 expect((await tasks.json() as any).tasks).toEqual(expect.arrayContaining([expect.objectContaining({task_kind:'contact_details',meeting_id:m.id,status:'open'})]));
});
it('edits, completes, cancels and reopens meeting tasks directly while preserving links and synchronizing the inbox',async()=>{
 const f=await fixture(),saved=await f.call(meeting({participants:[person('Task Contact')],introductions:[{id:crypto.randomUUID(),introducers:[],pending_name:'Coordinator',status:'promised'}]}));
 const m=saved.data.meeting,t=m.tasks[0],path='/admin/planning/tasks';
 const update=async(body:any)=>{const r=await handlePlanning(f.request(path,{id:t.id,...body}),f.env,path);return {status:r.status,data:await r.json() as any};};
 expect((await update({revision:t.revision,title:'Complete known contact details',notes:'Call for details',dueDate:'2026-11-08',ownerId:'primary',status:'open',direction:'mine'})).status).toBe(200);
 expect((await update({revision:t.revision,status:'completed'})).status).toBe(409);
 expect((await update({revision:t.revision+1,status:'completed',meetingId:crypto.randomUUID(),introductionId:crypto.randomUUID()})).status).toBe(200);
 const row=f.sqlite.prepare('SELECT * FROM ministry_tasks WHERE id=?').get(t.id);expect(row).toMatchObject({meeting_id:m.id,person_id:t.person_id,introduction_id:null,task_kind:'contact_details',status:'completed',notes:'Call for details',due_date:'2026-11-08'});
 const inbox=await handleMinistryAdminRequest(f.request('/admin/ministry/inbox'),f.env,'/admin/ministry/inbox');expect((await inbox.json() as any).items.find((i:any)=>i.id==='meeting-task:'+t.id).status).toBe('completed');
 expect((await f.call({...m,operationId:crypto.randomUUID()})).status).toBe(409); // An older open meeting cannot undo direct task changes.
 expect((await update({revision:t.revision+2,status:'open'})).status).toBe(200);
 expect((await update({revision:t.revision+3,status:'canceled'})).status).toBe(200);
 expect((await update({revision:t.revision+4,status:'open'})).status).toBe(200);
 expect(f.sqlite.prepare('SELECT count(*) n FROM ministry_tasks WHERE person_id=?').get(t.person_id)?.n).toBe(1);
 expect(f.sqlite.prepare('SELECT occurrence_status,follow_up FROM meetings WHERE id=?').get(m.id)).toMatchObject({occurrence_status:'planned',follow_up:'open'});
 const noCsrf=f.request(path,{id:t.id,revision:t.revision+5,status:'completed'});noCsrf.headers.delete('x-csrf-token');expect((await handlePlanning(noCsrf,f.env,path)).status).toBe(403);
 f.sqlite.exec(`INSERT INTO mmt_users(id,username,first_name,last_name,email,must_change_password,permissions_json,registered_at,updated_at) VALUES('task-reader','task-reader','Read','Only','reader@example.test',0,'{"contacts":"read"}','now','now');UPDATE admin_sessions SET user_id='task-reader'`);
 expect((await update({revision:t.revision+5,status:'completed'})).status).toBe(403);
});

it('finishes a simplified meeting in one save while keeping ordinary introduction tasks open and reminders optional',async()=>{
 const f=await fixture(),p={...person('Simple Contact'),createReminder:false},task={id:crypto.randomUUID(),title:'Introduce George to Scott',owner_id:'primary',status:'open',direction:'mine'};
 const draft=meeting({simplified:true,finish:true,participants:[p],notes:'Conversation notes',tasks:[task]});
 const r=await f.call(draft);expect(r.status).toBe(201);expect(r.data.meeting).toMatchObject({archived:1,follow_up:'closed',occurrence_status:'held',notes:'Conversation notes'});expect(r.data.meeting.tasks).toHaveLength(1);expect(r.data.meeting.tasks[0]).toMatchObject({id:task.id,status:'open',task_kind:'action'});expect(r.data.meeting.introductions).toHaveLength(0);
 expect((await f.call(draft)).data.replayed).toBe(true);
 const inbox=await handleMinistryAdminRequest(f.request('/admin/ministry/inbox'),f.env,'/admin/ministry/inbox');expect((await inbox.json() as any).items.find((i:any)=>i.id==='meeting-task:'+task.id).status).toBe('action');
 const m=r.data.meeting;expect((await f.call({...m,simplified:true,archived:0,follow_up:'open',introductions:[],operationId:crypto.randomUUID()})).status).toBe(200);
 const opted=await f.call(meeting({simplified:true,participants:[{...person('Reminder Requested'),createReminder:true}]}));expect(opted.data.meeting.tasks).toHaveLength(1);expect(opted.data.meeting.tasks[0].task_kind).toBe('contact_details');
});
it('migrates every introduction stage into one shared task without losing history, existing actions, or target relationships',async()=>{
 const f=await ministryFixture('0064_meeting_relationships.sql');fixtures.push(f);
 const id=crypto.randomUUID(),target=crypto.randomUUID(),action=crypto.randomUUID();
 f.sqlite.prepare("INSERT INTO people(id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,created_at,updated_at) VALUES(?,'George','Sample','george','sample','','','now','now')").run(target);
 f.sqlite.prepare("INSERT INTO meetings(id,title,starts_at,ends_at,created_by,created_at,updated_at) VALUES(?,'Earlier meeting','2026-11-01T15:00:00Z','2026-11-01T16:00:00Z','primary','now','now')").run(id);
 f.sqlite.prepare("INSERT INTO ministry_tasks(id,title,meeting_id,created_at,updated_at) VALUES(?,'Existing action',?,'now','now')").run(action,id);
 const stages=['promised','made','outreach_pending','connected','closed','canceled'];const ids=stages.map(()=>crypto.randomUUID());
 stages.forEach((stage,n)=>{f.sqlite.prepare("INSERT INTO meeting_introductions(id,meeting_id,introducers_json,target_json,status,notes,promised_date,made_date,next_action,created_at,updated_at) VALUES(?,?,?,?,?,'Keep my notes','2026-10-29','2026-11-01','Send the email','now','now')").run(ids[n],id,JSON.stringify([{kind:'person',id:target}]),JSON.stringify({kind:'person',id:target}),stage);f.sqlite.prepare("INSERT INTO meeting_introduction_entities VALUES(?,'introducer',?,NULL)").run(ids[n],target);});
 f.sqlite.prepare('UPDATE meeting_introductions SET notes=? WHERE id=?').run('Keep my notes '+ 'x'.repeat(3986),ids[5]);
 f.sqlite.exec(readFileSync(new URL('../migrations/0065_simplify_meeting_introductions.sql',import.meta.url),'utf8'));
 f.sqlite.exec(readFileSync(new URL('../migrations/0066_task_deleted_at.sql',import.meta.url),'utf8'));
 expect(f.sqlite.prepare('SELECT count(*) n FROM meeting_introductions WHERE converted_task_id IS NOT NULL').get()?.n).toBe(6);
 for(let n=0;n<stages.length;n++){const t=f.sqlite.prepare('SELECT * FROM ministry_tasks WHERE id=?').get(ids[n]);expect(t).toMatchObject({person_id:target,meeting_id:id,introduction_id:ids[n],status:n<3?'open':n===5?'canceled':'completed'});expect(t?.notes).toContain('Keep my notes');expect(t?.notes).toContain('George Sample');expect(t?.notes).toContain('2026-10-29');if(n<5)expect(t?.notes).toContain('Send the email');expect(String(t?.notes).length).toBeLessThanOrEqual(4000);}
 expect(f.sqlite.prepare('SELECT length(notes) n FROM meeting_introductions WHERE id=?').get(ids[5])?.n).toBe(4000);
 expect(f.sqlite.prepare('SELECT title FROM ministry_tasks WHERE id=?').get(action)?.title).toBe('Existing action');expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
 const inbox=await handleMinistryAdminRequest(f.request('/admin/ministry/inbox'),f.env,'/admin/ministry/inbox');const items=(await inbox.json() as any).items;expect(items.filter((i:any)=>i.id.startsWith('meeting-intro:'))).toHaveLength(0);expect(items.filter((i:any)=>i.id.startsWith('meeting-task:'))).toHaveLength(7);
 const response=await handleMeetings(f.request('/admin/meetings'),f.env,'/admin/meetings');const m=(await response.json() as any).meetings[0];const edit={...m,simplified:true,introductions:[],tasks:m.tasks.map((t:any)=>({...t,related:t.person_id?{kind:'person',id:t.person_id}:null})),operationId:crypto.randomUUID()};
 const saved=await handleMeetings(f.request('/admin/meetings',edit),f.env,'/admin/meetings');expect(saved.status).toBe(200);expect(f.sqlite.prepare('SELECT count(*) n FROM ministry_tasks').get()?.n).toBe(7);expect(f.sqlite.prepare('SELECT count(*) n FROM meeting_introductions').get()?.n).toBe(6);
 expect((await handleMeetings(f.request('/admin/meetings',{...m,operationId:crypto.randomUUID()}),f.env,'/admin/meetings')).status).toBe(409);
});

it('deletes a mistaken meeting task atomically on save and restores it without changing its creation date or links',async()=>{
 const f=await fixture(),task={id:crypto.randomUUID(),title:'Mistaken follow-up',owner_id:'primary',status:'open'};const first=await f.call(meeting({tasks:[task]}));const original=first.data.meeting.tasks[0],m=first.data.meeting;
 const saved=await f.call({...m,simplified:true,operationId:crypto.randomUUID(),tasks:[{...original,delete:true}]});expect(saved.status).toBe(200);expect(saved.data.meeting.tasks).toEqual([]);
 const get=async()=>{const r=await handleMinistryAdminRequest(f.request('/admin/ministry/inbox'),f.env,'/admin/ministry/inbox');return (await r.json() as any).items;};expect((await get()).some((i:any)=>i.id==='meeting-task:'+task.id)).toBe(false);
 expect((await f.call({...m,operationId:crypto.randomUUID()})).status).toBe(409);
 const deleted=f.sqlite.prepare('SELECT * FROM ministry_tasks WHERE id=?').get(task.id);expect(deleted).toMatchObject({created_at:original.created_at,meeting_id:m.id,status:'open',revision:2});expect(deleted?.deleted_at).toBeTruthy();
 const restored=await handlePlanning(f.request('/admin/planning/tasks/restore',{id:task.id,revision:2}),f.env,'/admin/planning/tasks/restore');expect(restored.status).toBe(200);expect((await get()).some((i:any)=>i.id==='meeting-task:'+task.id)).toBe(true);
 expect(f.sqlite.prepare('SELECT created_at,meeting_id,deleted_at FROM ministry_tasks WHERE id=?').get(task.id)).toMatchObject({created_at:original.created_at,meeting_id:m.id,deleted_at:null});
});

it('records attendees and introduction contacts only when the meeting is finished, using its Chicago date',async()=>{
 const f=await fixture(),attendee={...person('Meeting Attendee'),createReminder:false},introducer={...person('Introducer Contact'),createReminder:false},target={...person('Introduced Contact'),createReminder:false},taskPerson={...person('Task Contact'),createReminder:false};
 const r=await f.call(meeting({starts_at:'2026-11-04T01:00:00Z',ends_at:'2026-11-04T02:00:00Z',participants:[attendee],introductions:[{id:crypto.randomUUID(),introducers:[introducer],target,status:'made'}],tasks:[{id:crypto.randomUUID(),title:'Introduce Task Contact',related:taskPerson}]}));
 expect(r.status).toBe(201);
 const ids=[attendee.key,introducer.key,target.key,taskPerson.key];
 for(const id of ids)expect(f.sqlite.prepare('SELECT last_contacted_at FROM people WHERE id=?').get(id)?.last_contacted_at).toBeNull();
 const finished=await f.call({...r.data.meeting,tasks:r.data.meeting.tasks.map((t:any)=>({...t,related:{kind:'person',id:t.person_id}})),simplified:true,finish:true,operationId:crypto.randomUUID()});expect(finished.status).toBe(200);
 for(const id of ids)expect(f.sqlite.prepare('SELECT last_contacted_at,last_contacted_note FROM people WHERE id=?').get(id)).toMatchObject({last_contacted_at:'2026-11-03T00:00:00.000Z',last_contacted_note:'Meeting: Coffee'});
 expect(f.sqlite.prepare("SELECT count(*) n FROM audit_events WHERE event_type='meeting_contacted'").get()?.n).toBe(4);
 const payload={...finished.data.meeting,operationId:crypto.randomUUID()};expect((await f.call(payload)).status).toBe(200);expect((await f.call(payload)).data.replayed).toBe(true);
 expect(f.sqlite.prepare("SELECT count(*) n FROM audit_events WHERE event_type='meeting_contacted'").get()?.n).toBe(4);
});

it('preserves newer contact dates and manual notes while updating newly linked contacts on finished meetings',async()=>{
 const f=await fixture(),p={...person('Newer Contact'),createReminder:false};
 let r=await f.call(meeting({participants:[p]}));
 f.sqlite.prepare('UPDATE people SET last_contacted_at=?,last_contacted_note=? WHERE id=?').run('2026-11-05T00:00:00.000Z','A newer phone call',p.key);
 r=await f.call({...r.data.meeting,simplified:true,finish:true,operationId:crypto.randomUUID()});expect(r.status).toBe(200);
 expect(f.sqlite.prepare('SELECT last_contacted_at,last_contacted_note FROM people WHERE id=?').get(p.key)).toMatchObject({last_contacted_at:'2026-11-05T00:00:00.000Z',last_contacted_note:'A newer phone call'});
 const added={...person('Added Afterwards'),createReminder:false};
 r=await f.call({...r.data.meeting,participants:[...r.data.meeting.participants,added],operationId:crypto.randomUUID()});expect(r.status).toBe(200);
 expect(f.sqlite.prepare('SELECT last_contacted_note FROM people WHERE id=?').get(added.key)?.last_contacted_note).toBe('Meeting: Coffee');
 f.sqlite.prepare('UPDATE people SET last_contacted_note=? WHERE id=?').run('My manual note',added.key);
 expect((await f.call({...r.data.meeting,notes:'Unrelated meeting edit',operationId:crypto.randomUUID()})).status).toBe(200);
 expect(f.sqlite.prepare('SELECT last_contacted_note FROM people WHERE id=?').get(added.key)?.last_contacted_note).toBe('My manual note');
});

it('supports all-day dates and bounded meeting notes without implying ministry attendance',async()=>{
 const f=await fixture(),p={...person('All Day Contact'),createReminder:false},unrelated={...person('Ministry Member'),createReminder:false};
 const other=await f.call(meeting({participants:[unrelated]}));expect(other.status).toBe(201);
 const ministry=crypto.randomUUID();f.sqlite.prepare("INSERT INTO ministries(id,name,name_normalized,created_at,updated_at) VALUES(?,'Sample Ministry','sample ministry','now','now')").run(ministry);
 f.sqlite.prepare("INSERT INTO ministry_contacts(ministry_id,person_id,created_at,updated_at) VALUES(?,?,'now','now')").run(ministry,unrelated.key);
 const r=await f.call(meeting({title:'A very long meeting title '.repeat(5),all_day:true,starts_at:'2026-11-04',ends_at:'2026-11-05',simplified:true,finish:true,participants:[p,{kind:'ministry',id:ministry}]}));expect(r.status).toBe(201);
 const contact=f.sqlite.prepare('SELECT last_contacted_at,last_contacted_note FROM people WHERE id=?').get(p.key);
 expect(contact?.last_contacted_at).toBe('2026-11-04T00:00:00.000Z');expect(String(contact?.last_contacted_note)).toHaveLength(50);expect(String(contact?.last_contacted_note)).toMatch(/^Meeting: .*…$/);
 expect(f.sqlite.prepare('SELECT last_contacted_at FROM people WHERE id=?').get(unrelated.key)?.last_contacted_at).toBeNull();
});

it('excludes canceled introductions, canceled tasks, deleted tasks and meetings that did not happen',async()=>{
 const f=await fixture(),target={...person('Canceled Introduction'),createReminder:false},canceled={...person('Canceled Task'),createReminder:false},deleted={...person('Deleted Task'),createReminder:false};
 let r=await f.call(meeting({introductions:[{id:crypto.randomUUID(),introducers:[],target,status:'canceled'}],tasks:[{id:crypto.randomUUID(),title:'Canceled',status:'canceled',related:canceled},{id:crypto.randomUUID(),title:'Delete me',related:deleted}]}));expect(r.status).toBe(201);
 r=await f.call({...r.data.meeting,simplified:true,finish:true,tasks:r.data.meeting.tasks.map((t:any)=>({...t,related:{kind:'person',id:t.person_id},delete:t.title==='Delete me'})),operationId:crypto.randomUUID()});expect(r.status).toBe(200);
 for(const id of [target.key,canceled.key,deleted.key])expect(f.sqlite.prepare('SELECT last_contacted_at FROM people WHERE id=?').get(id)?.last_contacted_at).toBeNull();
 for(const outcome of ['canceled','not_held']){
  const p={...person('Did Not Meet'),createReminder:false};expect((await f.call(meeting({participants:[p],occurrence_status:outcome,archived:true,retainOpen:true}))).status).toBe(201);
  expect(f.sqlite.prepare('SELECT last_contacted_at FROM people WHERE id=?').get(p.key)?.last_contacted_at).toBeNull();
 }
});

it('rolls contact fields and contact audits back if the meeting transaction loses a revision race',async()=>{
 const f=await fixture(),p={...person('Atomic Contact'),createReminder:false};
 const saved=await f.call(meeting({participants:[p]}));expect(saved.status).toBe(201);
 const payload={...saved.data.meeting,simplified:true,finish:true,operationId:crypto.randomUUID()};
 const batch=f.env.DB.batch.bind(f.env.DB);
 f.env.DB.batch=((statements:D1PreparedStatement[])=>batch([...statements,f.env.DB.prepare("INSERT INTO meeting_save_guard(id,valid) VALUES('contact-rollback-test',0)")])) as typeof f.env.DB.batch;
 expect((await f.call(payload)).status).toBe(409);
 expect(f.sqlite.prepare('SELECT occurrence_status,archived FROM meetings WHERE id=?').get(payload.id)).toMatchObject({occurrence_status:'planned',archived:0});
 expect(f.sqlite.prepare('SELECT last_contacted_at FROM people WHERE id=?').get(p.key)?.last_contacted_at).toBeNull();
 expect(f.sqlite.prepare("SELECT count(*) n FROM audit_events WHERE event_type='meeting_contacted'").get()?.n).toBe(0);
 f.env.DB.batch=batch;
 expect((await f.call(payload)).status).toBe(200);
 expect(f.sqlite.prepare("SELECT count(*) n FROM audit_events WHERE event_type='meeting_contacted'").get()?.n).toBe(1);
});
