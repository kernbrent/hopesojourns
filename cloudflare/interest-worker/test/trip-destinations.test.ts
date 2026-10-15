import {afterEach,expect,it} from 'vitest';
import {ministryFixture} from './ministry-fixture';
import {handleTripAdminRequest,handleTripPublicRequest} from '../src/trip-platform';
import {handleDestinations} from '../src/destinations';
const fixtures:Awaited<ReturnType<typeof ministryFixture>>[]=[];
afterEach(()=>fixtures.splice(0).forEach(f=>f.sqlite.close()));
async function setup(){
 const f=await ministryFixture();fixtures.push(f);
 const call=(path:string,body?:unknown,method?:string)=>handleTripAdminRequest(f.request(path,body,method),f.env,path);
 const input={title:'Two destinations',location:'Athens and Kenya',opportunityId:'trip-athens',startDate:'2025-01-01',endDate:'2025-01-02',status:'traveling',publicEnabled:true};
 const response=await call('/admin/trips',input);expect(response.status).toBe(201);const {id}=await response.json() as any;
 const slug=f.sqlite.prepare('SELECT slug FROM trips WHERE id=?').get(id)!.slug;
 const link=(destination='trip-kenya')=>f.sqlite.prepare('INSERT INTO trip_destinations(trip_id,destination_id,created_at) VALUES(?,?,?)').run(id,destination,'2026-10-15');
 const publicCall=(path:string)=>handleTripPublicRequest(new Request('http://localhost:4188/api/interest'+path),f.env,path.split('?')[0]);
 const destination=async(slug?:string)=>await (await handleDestinations(f.request('/public/destinations'+(slug?'/'+slug:'')),f.env,'/public/destinations'+(slug?'/'+slug:''))).json() as any;
 return {...f,id,slug,call,link,publicCall,destination};
}
it('lists one shared trip under the primary and additional destination without duplicates',async()=>{
 const f=await setup();f.link();f.link('trip-athens');
 const list=await f.destination();
 for(const slug of ['athens','kenya']){
  expect(list.destinations.find((d:any)=>d.slug===slug).departures.map((t:any)=>t.slug)).toEqual([f.slug]);
  expect((await f.destination(slug)).departures.map((t:any)=>t.slug)).toEqual([f.slug]);
 }
 for(const opportunity of ['trip-athens','trip-kenya','kenya']){
  const result=await (await f.publicCall('/public/trips?opportunity='+opportunity)).json() as any;
  expect(result.trips.map((t:any)=>t.id)).toEqual([f.id]);
 }
 expect((await (await f.publicCall('/public/trips?opportunity=trip-nice')).json() as any).trips).toEqual([]);
 expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM trips').get()!.n).toBe(1);
});
it('preserves trip privacy and excludes hidden additional destinations',async()=>{
 const f=await setup();f.link();
 f.sqlite.prepare("UPDATE destinations SET status='archived' WHERE id='trip-kenya'").run();
 expect((await (await f.publicCall('/public/trips?opportunity=trip-kenya')).json() as any).trips).toEqual([]);
 for(const status of ['draft','canceled','archived']){
  f.sqlite.prepare('UPDATE trips SET status=? WHERE id=?').run(status,f.id);
  expect((await f.destination('athens')).departures).toEqual([]);
  expect((await (await f.publicCall('/public/trips?opportunity=trip-athens')).json() as any).trips).toEqual([]);
 }
 f.sqlite.prepare("UPDATE trips SET status='traveling',public_enabled=0 WHERE id=?").run(f.id);
 expect((await f.destination('athens')).departures).toEqual([]);
});
it('lists a published story once under either linked destination, retaining one snapshot',async()=>{
 const f=await setup();f.link();f.link('trip-athens');
 const base='/admin/trips/'+f.id+'/memories';
 const note=await (await f.call(base,{title:'Shared summary',content:'Our journey',portal_visible:true,public_visible:true})).json() as any;
 const draft=await f.call(base+'/publication/draft',{revision:0,destination_id:'trip-athens',title:'Two destinations',summary:'England and Greece',story:'Our journey',content_ids:[],memory_ids:[note.memory.id]});expect(draft.status).toBe(200);
 expect((await f.call(base+'/publication/publish',{revision:1})).status).toBe(422);
 f.sqlite.prepare("UPDATE trips SET status='completed' WHERE id=?").run(f.id);
 expect((await f.call(base+'/publication/publish',{revision:1})).status).toBe(200);
 for(const suffix of ['','?destination=athens','?destination=kenya']){
  const result=await (await f.publicCall('/public/trip-stories'+suffix)).json() as any;
  expect(result.stories.map((s:any)=>s.slug)).toEqual([f.slug]);
 }
 expect((await (await f.publicCall('/public/trip-stories?destination=nice')).json() as any).stories).toEqual([]);
 f.sqlite.prepare("UPDATE destinations SET status='archived' WHERE id='trip-kenya'").run();
 expect((await (await f.publicCall('/public/trip-stories?destination=kenya')).json() as any).stories).toEqual([]);
 expect((await f.publicCall('/public/trip-stories/'+f.slug)).status).toBe(200);
 expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM trip_publications').get()!.n).toBe(1);
});
