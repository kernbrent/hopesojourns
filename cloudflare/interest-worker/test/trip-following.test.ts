import {afterEach,expect,it} from 'vitest';
import {ministryFixture} from './ministry-fixture';
import {startDueTrips,tripDay} from '../src/trip-progress';
import {handleTripAdminRequest,handleTripPublicRequest} from '../src/trip-platform';
import {handleDestinations} from '../src/destinations';
const fixtures:Awaited<ReturnType<typeof ministryFixture>>[]=[];
afterEach(()=>fixtures.splice(0).forEach(f=>f.sqlite.close()));
async function setup(){
 const f=await ministryFixture();fixtures.push(f);
 const call=(path:string,body?:unknown,method?:string)=>handleTripAdminRequest(f.request(path,body,method),f.env,path);
 const publicCall=(path:string)=>handleTripPublicRequest(new Request('http://localhost:4188/api/interest'+path),f.env,path);
 const input={code:'ENGLAND',slug:'england-follow-along',title:'England follow-along',location:'England',startDate:'2026-10-10',endDate:'2026-10-18',opportunityId:'trip-athens',status:'confirmed',publicEnabled:false};
 const created=await (await call('/admin/trips',input)).json() as any;
 return {...f,call,publicCall,input,id:created.id,slug:created.slug||f.sqlite.prepare('SELECT slug FROM trips WHERE id=?').get(created.id)!.slug};
}
it('manual Traveling opens the public page without changing financial records or exposing credentials',async()=>{
 const f=await setup();const before=f.sqlite.prepare('SELECT COUNT(*) AS n FROM ledger_entries').get();
 expect((await f.call('/admin/trips/'+f.id,{...f.input,status:'traveling',publicEnabled:false,portalEnabled:false},'PUT')).status).toBe(200);
 expect(f.sqlite.prepare('SELECT status,public_enabled,portal_enabled FROM trips WHERE id=?').get(f.id)).toMatchObject({status:'traveling',public_enabled:1,portal_enabled:1});
 const page=await (await f.publicCall('/public/trips/'+f.slug)).json() as any;expect(page.trip.status).toBe('traveling');expect(page.trip.portal_available).toBe(0);
 expect(JSON.stringify(page)).not.toMatch(/financialOverview|planned_cost|portal_password|token_hash|object_key/);
 expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM ledger_entries').get()).toEqual(before);
});
it('starts only due eligible trips in Central time, audits once, and enables configured traveler access',async()=>{
 const f=await setup();
 const add=async(status:string,startDate:string,endDate:string|null)=>{const suffix=crypto.randomUUID();const r=await (await f.call('/admin/trips',{...f.input,code:suffix,slug:'test-'+suffix,title:status+startDate+suffix,status,startDate,endDate})).json() as any;return r.id;};
 const eligible=[f.id,await add('recruiting','2026-10-09','2026-10-18'),await add('full','2026-10-10',null)];
 const excluded=[await add('draft','2026-10-10','2026-10-18'),await add('canceled','2026-10-10','2026-10-18'),await add('completed','2026-10-10','2026-10-18'),await add('confirmed','2026-10-11','2026-10-18'),await add('confirmed','2026-10-01','2026-10-08'),await add('confirmed','2025-10-01',null)];
 f.sqlite.prepare("UPDATE trips SET portal_login_id='READY',portal_password_hash='private-hash',portal_password_salt='private-salt',portal_password_iterations=100000 WHERE id=?").run(f.id);
 expect(tripDay(new Date('2026-10-10T04:59:59Z'))).toBe('2026-10-09');
 await startDueTrips(f.env,new Date('2026-10-10T04:59:59Z'));expect(f.sqlite.prepare('SELECT status FROM trips WHERE id=?').get(f.id)!.status).toBe('confirmed');
 await startDueTrips(f.env,new Date('2026-10-10T05:00:00Z'));
 for(const id of eligible)expect(f.sqlite.prepare('SELECT status,public_enabled FROM trips WHERE id=?').get(id)).toMatchObject({status:'traveling',public_enabled:1});
 for(const id of excluded)expect(f.sqlite.prepare('SELECT status FROM trips WHERE id=?').get(id)!.status).not.toBe('traveling');
 expect(f.sqlite.prepare('SELECT portal_enabled FROM trips WHERE id=?').get(f.id)!.portal_enabled).toBe(1);
 await startDueTrips(f.env,new Date('2026-10-10T06:00:00Z'));
 expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE entity_id=? AND event_type='automatically_started'").get(f.id)!.n).toBe(1);
});
it('publishes only selected live memories and public updates, protects media, and lists active destination trips',async()=>{
 const f=await setup();await f.call('/admin/trips/'+f.id,{...f.input,status:'traveling'},'PUT');
 const content='/admin/trips/'+f.id+'/content';
 for(const [visibility,title] of [['public','Public update'],['travelers','Traveler-only update'],['admin','Private note']])await f.call(content,{contentType:'update',title,content:title,eventDate:'2026-10-10',visibility,publicationStatus:'published'});
 await f.call(content,{contentType:'update',title:'Draft update',content:'Draft',visibility:'public',publicationStatus:'draft'});
 const base='/admin/trips/'+f.id+'/memories';
 await f.call(base,{title:'Private memory',content:'Private',portal_visible:true});
 await f.call(base,{title:'Public journal',content:'Serving today',public_visible:true,portal_visible:false});
 const form=new FormData();form.set('file',new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64')],'photo.png',{type:'image/png'}));form.set('title','Public photo');form.set('alt_text','Our team');form.set('public_visible','true');
 const photo=await (await f.call(base,form)).json() as any;
 const page=await (await f.publicCall('/public/trips/'+f.slug)).json() as any;
 expect(page.content.map((c:any)=>c.title)).toEqual(['Public update']);expect(page.memories.map((m:any)=>m.title)).toEqual(expect.arrayContaining(['Public journal','Public photo']));expect(page.memories).toHaveLength(2);
 expect(JSON.stringify(page)).not.toMatch(/Private memory|Traveler-only update|Draft update|object_key|portal_visible|financialOverview|planned_cost|token_hash|portal_password/);
 const mediaPath='/public/trips/'+f.slug+'/photos/'+photo.memory.id;
 expect((await f.publicCall(mediaPath)).status).toBe(200);
 expect((await f.publicCall('/public/trips/other-trip/photos/'+photo.memory.id)).status).toBe(404);
 const destinations=await (await handleDestinations(f.request('/public/destinations'),f.env,'/public/destinations')).json() as any;
 expect(destinations.destinations.find((d:any)=>d.id==='trip-athens').departures[0].slug).toBe(f.slug);
 await f.call(base+'/'+photo.memory.id,{...photo.memory,revision:photo.memory.revision,public_visible:false},'PUT');expect((await f.publicCall(mediaPath)).status).toBe(404);
 f.sqlite.prepare("UPDATE trips SET status='confirmed' WHERE id=?").run(f.id);const upcoming=await (await f.publicCall('/public/trips/'+f.slug)).json() as any;expect(upcoming.memories).toEqual([]);expect(upcoming.content).toEqual([]);
});
