import {afterEach,expect,it} from 'vitest';
import {ministryFixture} from './ministry-fixture';
import {handlePlanning} from '../src/planning';
import {handleMinistryAdminRequest} from '../src/ministry-admin';
const fixtures:Awaited<ReturnType<typeof ministryFixture>>[]=[];afterEach(()=>fixtures.splice(0).forEach(f=>f.sqlite.close()));
async function setup(){const f=await ministryFixture();fixtures.push(f);return f;}
it('completes and reopens a task by status only, preserving every relationship and rejecting stale edits',async()=>{
 const f=await setup(),id=crypto.randomUUID();f.sqlite.prepare("INSERT INTO ministry_tasks(id,title,notes,created_at,updated_at) VALUES(?,'Action','Keep details','before','before')").run(id);
 const call=(status:string,revision:number)=>handlePlanning(f.request('/admin/planning/tasks/state',{id,status,revision}),f.env,'/admin/planning/tasks/state');
 expect((await call('completed',1)).status).toBe(200);expect(f.sqlite.prepare('SELECT notes,status,created_at,revision FROM ministry_tasks WHERE id=?').get(id)).toMatchObject({notes:'Keep details',status:'completed',created_at:'before',revision:2});
 expect((await call('open',1)).status).toBe(409);expect((await call('open',2)).status).toBe(200);
});
it('counts only open undeleted accessible tasks and tracks unread inbox per user separately from workflow status',async()=>{
 const f=await setup();f.sqlite.exec("INSERT INTO ministry_tasks(id,title,status,created_at,updated_at) VALUES('open','Open','open','now','now'),('done','Done','completed','now','now'); INSERT INTO ministry_tasks(id,title,status,deleted_at,created_at,updated_at) VALUES('deleted','Deleted','open','now','now','now'); INSERT INTO ministry_events(id,event_key,title,detail,action_url,status,created_at) VALUES('test-event','test','Test item','Details','/admin/','action','2026-11-16')");
 const counts=async()=>{const p='/admin/ministry/counts';return (await (await handleMinistryAdminRequest(f.request(p),f.env,p)).json()) as any;};
 expect((await counts()).openTasks).toBe(1);const before=(await counts()).unreadInbox;
 const p='/admin/ministry/inbox/read';const r=await handleMinistryAdminRequest(f.request(p,{itemId:'event:test-event'}),f.env,p);expect(r.status,await r.clone().text()).toBe(200);expect((await counts()).unreadInbox).toBe(before-1);
 expect(f.sqlite.prepare("SELECT status FROM ministry_events WHERE id='test-event'").get()?.status).toBe('action');
 f.sqlite.exec("UPDATE ministry_events SET title='Updated notice' WHERE id='test-event'");expect((await counts()).unreadInbox).toBe(before);
 await handleMinistryAdminRequest(f.request(p,{itemId:'event:test-event',unread:true}),f.env,p);expect((await counts()).unreadInbox).toBe(before);
});
it('can close an existing task after its assigned user becomes inactive',async()=>{
 const f=await setup();f.sqlite.exec("INSERT INTO mmt_users(id,username,first_name,last_name,email,status,registered_at,updated_at) VALUES('former','former','Former','Staff','former@example.test','disabled','now','now'); INSERT INTO ministry_tasks(id,title,owner_id,created_at,updated_at) VALUES('old-task','Follow up','former','before','before')");
 const path='/admin/planning/tasks';
 const old=await handlePlanning(f.request(path,{id:'old-task',revision:1,title:'Follow up',ownerId:'former',status:'completed'}),f.env,path);expect(old.status).toBe(422);
 const fixed=await handlePlanning(f.request(path+'/state',{id:'old-task',revision:1,status:'completed'}),f.env,path+'/state');expect(fixed.status).toBe(200);
 expect(f.sqlite.prepare("SELECT status,owner_id FROM ministry_tasks WHERE id='old-task'").get()).toMatchObject({status:'completed',owner_id:'former'});
});
it('lets an Inbox reader mark their own notices read without changing another user or completing notices',async()=>{
 const f=await setup();f.sqlite.exec("INSERT INTO meetings(id,title,starts_at,ends_at,created_by,created_at,updated_at) VALUES('read-meeting','Reader meeting','2026-11-17T15:00:00Z','2026-11-17T16:00:00Z','primary','now','now'); INSERT INTO ministry_tasks(id,title,meeting_id,created_at,updated_at) VALUES('reading-task','Reader notice','read-meeting','now','now'); INSERT INTO mmt_users(id,username,first_name,last_name,email,must_change_password,permissions_json,registered_at,updated_at) VALUES('reader','reader','Read','Only','reader@example.test',0,'{\"inbox\":\"read\",\"contacts\":\"read\"}','now','now')");
 const path='/admin/ministry/inbox/read',counts='/admin/ministry/counts';
 f.sqlite.exec("UPDATE admin_sessions SET user_id='reader'");
 expect((await handleMinistryAdminRequest(f.request(path,{itemId:'meeting-task:reading-task'}),f.env,path)).status).toBe(200);
 const reader=await (await handleMinistryAdminRequest(f.request(counts),f.env,counts)).json() as any;expect(reader.unreadInbox).toBe(0);
 expect((await handleMinistryAdminRequest(f.request('/admin/ministry/inbox',{itemId:'meeting-task:reading-task',action:'complete'}),f.env,'/admin/ministry/inbox')).status).toBe(403);
 f.sqlite.exec("UPDATE admin_sessions SET user_id='primary'");
 const primary=await (await handleMinistryAdminRequest(f.request(counts),f.env,counts)).json() as any;expect(primary.unreadInbox).toBe(1);
});
