import {afterEach,expect,it} from 'vitest';
import {ministryFixture} from './ministry-fixture';
import {handleTripAdminRequest} from '../src/trip-platform';
import {handleAdminRequest} from '../src/admin';
const fixtures:Awaited<ReturnType<typeof ministryFixture>>[]=[];
afterEach(()=>fixtures.splice(0).forEach(f=>f.sqlite.close()));
async function setup(){
 const f=await ministryFixture();fixtures.push(f);
 const call=(p:string,b?:unknown)=>handleTripAdminRequest(f.request(p,b),f.env,p);
 const options=f.sqlite.prepare("SELECT id FROM opportunities WHERE kind='trip' AND active=1 ORDER BY id LIMIT 2").all();
 const opportunity=options[0].id as string;
 const r=await call('/admin/trips',{title:'England departure',location:'England',startDate:'2026-10-10',endDate:'2026-10-17',opportunityId:opportunity});
 expect(r.status,await r.clone().text()).toBe(201);const {id}=await r.json() as any;
 function person(name:string,linked=true,prospect=true){
  const p=crypto.randomUUID();f.sqlite.prepare("INSERT INTO people(id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,created_at,updated_at) VALUES(?,?,'Example',?,'example',?,?,'now','now')").run(p,name,name.toLowerCase(),name+'@example.test',name.toLowerCase()+'@example.test');
  if(linked)f.sqlite.prepare('INSERT INTO contact_trips VALUES(?,?,?)').run(p,opportunity,'now');
  if(prospect)f.sqlite.prepare("INSERT INTO contact_types VALUES(?,'prospective_traveler','now')").run(p);
  return p;
 }
 const confirm=(personId:string)=>call(`/admin/trips/${id}/members`,{personId,role:'traveler',status:'confirmed',fromProspect:true});
 const workspace=async()=>await (await call('/admin/trips/'+id)).json() as any;
 return {...f,call,id,opportunity,options,person,confirm,workspace};
}
it('matches both the contact category and exact journey link and omits inactive or assigned contacts',async()=>{
 const f=await setup(),wanted=f.person('Alice');f.person('NoLink',false);f.person('NoType',true,false);const inactive=f.person('Inactive'),assigned=f.person('Assigned');
 f.sqlite.prepare("UPDATE people SET contact_status='inactive' WHERE id=?").run(inactive);
 await f.call(`/admin/trips/${f.id}/members`,{personId:assigned,role:'leader',status:'confirmed'});
 expect((await f.workspace()).potentialTravelers.map((p:any)=>p.person_id)).toEqual([wanted]);
});
it('promotes once, preserves consent and notes, updates categories and exposes dated membership history',async()=>{
 const f=await setup(),person=f.person('Alice');
 const cost=f.sqlite.prepare('SELECT id FROM trip_cost_items WHERE trip_id=? LIMIT 1').get(f.id)!;
 f.sqlite.prepare('UPDATE trips SET paying_traveler_count=2 WHERE id=?').run(f.id);
 f.sqlite.prepare('UPDATE trip_cost_items SET estimated_total=120,bill_to_traveler=1,needs_estimate=0 WHERE id=?').run(cost.id);
 await f.call(`/admin/trips/${f.id}/members`,{personId:person,role:'traveler',status:'interested',directoryVisible:true,directoryEmailVisible:false,notes:'Keep my notes'});
 expect((await f.confirm(person)).status).toBe(200);expect((await f.confirm(person)).status).toBe(200);
 expect(f.sqlite.prepare('SELECT role,status,directory_visible,directory_email_visible,notes FROM trip_members WHERE trip_id=? AND person_id=?').get(f.id,person)).toMatchObject({role:'traveler',status:'confirmed',directory_visible:1,directory_email_visible:0,notes:'Keep my notes'});
 expect(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_accounts WHERE trip_id=? AND person_id=?').get(f.id,person)?.n).toBe(1);
 expect(f.sqlite.prepare('SELECT contact_type FROM contact_types WHERE person_id=? ORDER BY contact_type').all(person)).toEqual([{contact_type:'traveler'}]);
 expect(f.sqlite.prepare('SELECT amount FROM trip_charges WHERE trip_id=? AND cost_item_id=?').all(f.id,cost.id)).toEqual([{amount:60}]);
 expect((await f.workspace()).potentialTravelers).toEqual([]);
 const path='/admin/people/'+person;const response=await handleAdminRequest(f.request(path),f.env,path);expect(response?.status).toBe(200);
 expect((await response!.json() as any).person.journeyHistory).toContainEqual(expect.objectContaining({id:f.id,start_date:'2026-10-10',end_date:'2026-10-17',member_status:'confirmed'}));
});
it('preserves potential status for other connected journeys and defaults new directory consent to off',async()=>{
 const f=await setup(),person=f.person('Alice');
 f.sqlite.prepare('INSERT INTO contact_trips VALUES(?,?,?)').run(person,f.options[1].id,'now');
 expect((await f.confirm(person)).status).toBe(200);
 expect(f.sqlite.prepare('SELECT contact_type FROM contact_types WHERE person_id=? ORDER BY contact_type').all(person)).toEqual([{contact_type:'prospective_traveler'},{contact_type:'traveler'}]);
 expect(f.sqlite.prepare('SELECT directory_visible,directory_email_visible,directory_phone_visible FROM trip_members WHERE person_id=?').get(person)).toEqual({directory_visible:0,directory_email_visible:0,directory_phone_visible:0});
});
it('rejects stale candidates and requires edit access to both contacts and trips',async()=>{
 const f=await setup(),person=f.person('Alice');f.sqlite.prepare('DELETE FROM contact_trips WHERE person_id=?').run(person);
 expect((await f.confirm(person)).status).toBe(409);
 f.sqlite.prepare('INSERT INTO contact_trips VALUES(?,?,?)').run(person,f.opportunity,'now');
 f.sqlite.exec(`INSERT INTO mmt_users(id,username,first_name,last_name,email,phone,country,is_admin,permissions_json,status,must_change_password,registered_at,updated_at) VALUES('reader','reader','Read','Only','reader@example.test','','US',0,'{"trips":"edit","contacts":"read"}','active',0,'2026','2026'); UPDATE admin_sessions SET user_id='reader'`);
 expect((await f.workspace()).canConfirmPotentialTraveler).toBe(false);expect((await f.confirm(person)).status).toBe(403);
 f.sqlite.exec(`UPDATE mmt_users SET permissions_json='{"contacts":"read"}' WHERE id='reader'`);
 const path='/admin/people/'+person;const response=await handleAdminRequest(f.request(path),f.env,path);
 const data=await response!.json() as any;expect(data.person.journeyHistory).toEqual([]);expect(data.person.canViewJourneyHistory).toBe(false);
});

it('rolls back membership and category promotion if account assignment fails',async()=>{
 const f=await setup(),person=f.person('Alice');
 f.sqlite.exec("CREATE TRIGGER reject_test_account BEFORE INSERT ON trip_accounts BEGIN SELECT RAISE(ABORT,'test account failure'); END");
 expect((await f.confirm(person)).status).toBe(500);
 expect(f.sqlite.prepare('SELECT * FROM trip_members WHERE person_id=?').get(person)).toBeUndefined();
 expect(f.sqlite.prepare('SELECT contact_type FROM contact_types WHERE person_id=?').all(person)).toEqual([{contact_type:'prospective_traveler'}]);
});
