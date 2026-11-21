import {afterEach,expect,it} from 'vitest';
import {ministryFixture} from './ministry-fixture';
import {handleDiscovery,validateDiscovery} from '../src/discovery';
const fixtures:Awaited<ReturnType<typeof ministryFixture>>[]=[];
afterEach(()=>fixtures.splice(0).forEach(f=>f.sqlite.close()));
const answers={path:'mission',motivation:'relationships',gifts:'hospitality',company:'church',timing:'year',concern:'cost'};
async function setup(){const f=await ministryFixture();fixtures.push(f);const call=async(path:string,body?:unknown,anonymous=false)=>{const req=f.request(path,body);if(anonymous)req.headers.delete('cookie');const r=await handleDiscovery(req,f.env,path.split('?')[0]);return {status:r.status,data:await r.json() as any};};return {...f,call};}
const payload=()=>({id:crypto.randomUUID(),answers,consent:true,consentVersion:'2026-11-20'});
it('stores consented anonymous interviews idempotently and ignores client identity fields',async()=>{
 const f=await setup(),b={...payload(),personId:'primary',email:'someone@example.test'};
 expect((await f.call('/public/discovery',b,true)).status).toBe(201);
 expect((await f.call('/public/discovery',b,true)).status).toBe(201);
 expect(f.sqlite.prepare('SELECT count(*) n FROM discovery_interviews').get()?.n).toBe(1);
 const row=f.sqlite.prepare('SELECT * FROM discovery_interviews').get()!;expect(row.person_id).toBeNull();expect(row.identity_source).toBe('anonymous');expect(row.answers_json).not.toContain('email');
});
it('rejects missing consent, invalid choices and oversized payloads without storing answers',async()=>{
 const f=await setup();expect((await f.call('/public/discovery',{...payload(),consent:false},true)).status).toBe(422);
 expect((await f.call('/public/discovery',{...payload(),answers:{...answers,gifts:'<script>'}},true)).status).toBe(422);
 expect(()=>validateDiscovery({path:'mission'})).toThrow();
 expect((await f.call('/public/discovery',{...payload(),extra:'x'.repeat(9000)},true)).status).toBe(413);
 expect(f.sqlite.prepare('SELECT count(*) n FROM discovery_interviews').get()?.n).toBe(0);
});
it('requires authentication, contact permissions and CSRF for associations',async()=>{
 const f=await setup(),b=payload();await f.call('/public/discovery',b,true);
 expect((await f.call('/admin/discovery',undefined,true)).status).toBe(401);
 const req=f.request('/admin/discovery/'+b.id+'/link',{personId:null});req.headers.delete('x-csrf-token');expect((await handleDiscovery(req,f.env,'/admin/discovery/'+b.id+'/link')).status).toBe(403);
 f.sqlite.exec("INSERT INTO mmt_users(id,username,first_name,last_name,email,must_change_password,registered_at,updated_at) VALUES('limited','limited','Limited','User','limited@example.test',0,'now','now'); UPDATE admin_sessions SET user_id='limited'; UPDATE mmt_users SET is_admin=0,is_org_admin=0,permissions_json='{\"contacts\":\"read\"}' WHERE id='limited'");
 expect((await f.call('/admin/discovery')).status).toBe(200);expect((await f.call('/admin/discovery/'+b.id+'/link',{personId:null})).status).toBe(403);
 f.sqlite.exec("UPDATE mmt_users SET permissions_json='{}' WHERE id='limited'");expect((await f.call('/admin/discovery')).status).toBe(403);
});
it('links only the verified account contact and joins current demographics for staff',async()=>{
 const f=await setup();f.sqlite.exec("INSERT INTO people(id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,created_at,updated_at) VALUES('known','Alex','Example','alex','example','alex@example.test','alex@example.test','now','now'); UPDATE mmt_users SET hs_person_id='known' WHERE id='primary'; INSERT INTO traveler_profiles(person_id,details_json,revision,updated_at) VALUES('known','{\"ageRange\":\"41+\",\"occupation\":\"Teacher\"}',0,'now')");
 const b=payload();expect((await f.call('/admin/discovery-self',b)).status).toBe(201);
 const d=await f.call('/admin/discovery');expect(d.status).toBe(200);expect(d.data.records[0]).toMatchObject({person_id:'known',identity_source:'account',age_range:'41+',occupation:'Teacher'});expect(d.data.distribution).toContainEqual({question:'path',answer:'mission',total:1});
 expect((await f.call('/admin/discovery/'+b.id+'/link',{personId:null})).status).toBe(200);expect(f.sqlite.prepare('SELECT count(*) n FROM audit_events WHERE entity_type=\'discovery\'').get()?.n).toBe(1);
 expect((await f.call('/admin/discovery/'+b.id+'/link',{personId:'missing'})).status).toBe(422);
 expect((await f.call('/admin/discovery/'+b.id+'/link',{personId:'known'})).status).toBe(200);
 expect((await f.call('/admin/discovery/contacts?q=Alex')).data.contacts).toHaveLength(1);
});
it('limits anonymous saves and does not expose interview records publicly',async()=>{
 const f=await setup();for(let i=0;i<30;i++)expect((await f.call('/public/discovery',payload(),true)).status).toBe(201);
 expect((await f.call('/public/discovery',payload(),true)).status).toBe(429);expect((await f.call('/public/discovery',undefined,true)).status).toBe(404);
});
