import {afterEach,expect,it} from 'vitest';
import {ministryFixture} from './ministry-fixture';
import {handleOutreach} from '../src/outreach';
const fixtures:Awaited<ReturnType<typeof ministryFixture>>[]=[];
afterEach(()=>fixtures.splice(0).forEach(f=>f.sqlite.close()));
async function setup(){const f=await ministryFixture();fixtures.push(f);const call=async(path='',body?:unknown)=>{const r=await handleOutreach(f.request('/admin/outreach'+path,body),f.env,'/admin/outreach'+path);return {status:r.status,data:await r.json() as any};};return {...f,call};}
const record=()=>({name:'Sample Church',data:{email:'office@example.test',website:'https://example.test',opportunities:['church_partnership'],sources:[]},people:[{name:'Alex Example',role:'Pastor',email:'alex@example.test'},{name:'Taylor Example',role:'Missions',email:'taylor@example.test'}]});
it('keeps prospects out of Contacts; saves stages, owner, next action and full history',async()=>{
 const f=await setup(),r=await f.call('',{...record(),stage:'awaiting_response',ownerId:'primary',dueDate:'2026-11-18',nextAction:'Follow up'});expect(r.status,r.data.error).toBe(201);
 expect(f.sqlite.prepare('SELECT count(*) n FROM ministries').get()?.n).toBe(0);expect(f.sqlite.prepare('SELECT count(*) n FROM people').get()?.n).toBe(0);
 const p=r.data.prospect;const a=await f.call('/'+p.id+'/activities',{kind:'email_sent',occurredAt:'2026-11-11T12:00:00Z',subject:'Coffee?',body:'Full original message',metadata:{to:'alex@example.test',bcc:'admin@hopesojourns.com'}});expect(a.status).toBe(201);expect(a.data.prospect.activities[0].body).toBe('Full original message');
 expect((await f.call('',{...record(),id:p.id,revision:0})).status).toBe(409);
 expect((await f.call('/'+p.id+'/convert',{revision:1,people:[]})).status).toBe(422);
});
it('imports atomically and idempotently without replaying emails or overwriting later replies',async()=>{
 const f=await setup(),p={...record(),sourceKey:'church-1',stage:'awaiting_response',activities:[{sourceKey:'mail-1',kind:'email_sent',body:'Message',occurredAt:'2026-11-11T12:00:00Z'}]};
 expect((await f.call('/import',{prospects:[p]})).data).toMatchObject({created:1,skipped:0});
 expect((await f.call('/import',{prospects:[p]})).data).toMatchObject({created:0,skipped:1});
 expect(f.sqlite.prepare('SELECT count(*) n FROM outreach_activities').get()?.n).toBe(1);
 const bad={...record(),sourceKey:'church-2',data:{website:'javascript:alert(1)'}};
 expect((await f.call('/import',{prospects:[{...p,sourceKey:'church-3'},bad]})).status).toBe(422);
 expect(f.sqlite.prepare('SELECT count(*) n FROM outreach_prospects').get()?.n).toBe(1);
});
it('promotes selected people once, reuses a matching contact and ministry, and preserves history',async()=>{
 const f=await setup();f.sqlite.prepare("INSERT INTO people(id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,notes,created_at,updated_at) VALUES('existing','Alex','Example','alex','example','alex@example.test','alex@example.test','Keep this','now','now')").run();
 f.sqlite.prepare("INSERT INTO ministries(id,name,name_normalized,created_at,updated_at) VALUES('existing-ministry','Sample Church','sample church','now','now')").run();
 const r=await f.call('',{...record(),response:'positive',stage:'in_conversation'}),p=r.data.prospect;
 const preview=await f.call('/'+p.id+'/matches');expect(preview.data.ministries[0].id).toBe('existing-ministry');expect(preview.data.people[0].candidates[0].id).toBe('existing');
 await f.call('/'+p.id+'/activities',{body:'Accepted coffee',kind:'email_received'});
 const promoted=await f.call('/'+p.id+'/convert',{revision:p.revision,people:[{id:p.people[0].id}]});expect(promoted.status,promoted.data.error).toBe(200);
 expect(promoted.data.prospect.converted_ministry_id).toBe('existing-ministry');expect(promoted.data.prospect.activities).toHaveLength(2);
 expect(f.sqlite.prepare('SELECT count(*) n FROM people').get()?.n).toBe(1);expect(f.sqlite.prepare("SELECT notes FROM people WHERE id='existing'").get()?.notes).toBe('Keep this');
 expect(f.sqlite.prepare('SELECT count(*) n FROM ministry_contacts').get()?.n).toBe(1);expect(promoted.data.prospect.people[1].person_id).toBeNull();
 expect((await f.call('/'+p.id+'/convert',{revision:1,people:[]})).data.alreadyConverted).toBe(true);
});
it('creates contact links atomically and rolls back on failure',async()=>{
 const f=await setup(),r=await f.call('',{...record(),response:'positive'}),p=r.data.prospect;
 f.sqlite.exec("CREATE TRIGGER reject_outreach_conversion BEFORE INSERT ON ministry_contacts BEGIN SELECT RAISE(ABORT,'blocked for test'); END;");
 expect((await f.call('/'+p.id+'/convert',{revision:1,people:[{id:p.people[0].id}]})).status).toBe(500);
 expect(f.sqlite.prepare('SELECT count(*) n FROM people').get()?.n).toBe(0);expect(f.sqlite.prepare('SELECT count(*) n FROM ministries').get()?.n).toBe(0);
 expect(f.sqlite.prepare('SELECT converted_at FROM outreach_prospects WHERE id=?').get(p.id)?.converted_at).toBeNull();
});
it('requires authentication, CSRF and contact edit access for changes',async()=>{
 const f=await setup(),path='/admin/outreach';const req=f.request(path,record());req.headers.delete('x-csrf-token');expect((await handleOutreach(req,f.env,path)).status).toBe(403);req.headers.delete('cookie');expect((await handleOutreach(req,f.env,path)).status).toBe(401);
 f.sqlite.exec("INSERT INTO mmt_users(id,username,first_name,last_name,email,must_change_password,permissions_json,registered_at,updated_at) VALUES('limited','limited','Limited','User','limited@example.test',0,'{\"contacts\":\"read\"}','now','now'); UPDATE admin_sessions SET user_id='limited'");
 expect((await f.call()).status).toBe(200);expect((await f.call('',record())).status).toBe(403);
});
it('creates a new ministry and selected person, then retains workflow and history after promotion',async()=>{
 const f=await setup(),r=await f.call('',{...record(),response:'positive',ownerId:'primary'}),p=r.data.prospect;
 const promoted=await f.call('/'+p.id+'/convert',{revision:1,people:[{id:p.people[0].id}]});expect(promoted.status,promoted.data.error).toBe(200);
 expect(f.sqlite.prepare('SELECT count(*) n FROM ministries').get()?.n).toBe(1);expect(f.sqlite.prepare('SELECT count(*) n FROM people').get()?.n).toBe(1);
 expect(f.sqlite.prepare('SELECT contact_type FROM contact_types').get()?.contact_type).toBe('ministry_contact');
 const workflow=await f.call('/'+p.id+'/workflow',{revision:2,stage:'meeting_scheduled',response:'positive',ownerId:'primary',nextAction:'Coffee at 10 a.m.',dueDate:'2026-11-20'});expect(workflow.status,workflow.data.error).toBe(200);expect(workflow.data.prospect).toMatchObject({stage:'meeting_scheduled',next_action:'Coffee at 10 a.m.',owner_id:'primary'});expect(workflow.data.prospect.people[0].person_id).toBeTruthy();expect(workflow.data.prospect.activities).toHaveLength(1);
 expect((await f.call('/'+p.id+'/workflow',{revision:2,stage:'active_partner'})).status).toBe(409);
});
it('requires an explicit choice for ambiguous matching contacts without creating duplicates',async()=>{
 const f=await setup();f.sqlite.exec("INSERT INTO people(id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,created_at,updated_at) VALUES('alex-1','Alex','Example','alex','example','one@example.test','one@example.test','now','now'),('alex-2','Alex','Example','alex','example','two@example.test','two@example.test','now','now')");
 const p=(await f.call('',{...record(),response:'positive'})).data.prospect;
 expect((await f.call('/'+p.id+'/convert',{revision:1,people:[{id:p.people[0].id}]})).status).toBe(409);
 expect(f.sqlite.prepare('SELECT count(*) n FROM ministries').get()?.n).toBe(0);
 expect((await f.call('/'+p.id+'/convert',{revision:1,people:[{id:p.people[0].id,personId:'alex-2'}]})).status).toBe(200);
 expect(f.sqlite.prepare('SELECT count(*) n FROM people').get()?.n).toBe(2);
});
