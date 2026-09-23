import {expect,it} from 'vitest';
import {ministryFixture} from './ministry-fixture';
import {handlePlanning,readiness} from '../src/planning';
import {handleTripAdminRequest} from '../src/trip-platform';
async function setup(){const f=await ministryFixture();const plan=(path:string,body?:unknown,method?:string)=>handlePlanning(f.request('/admin/planning'+path,body,method),f.env,'/admin/planning'+path);const call=(path:string,body?:unknown)=>handleTripAdminRequest(f.request(path,body),f.env,path);const r=await call('/admin/trips',{title:'Planning test',location:'Test',startDate:'2026-10-01',endDate:'2026-10-03'});expect(r.status).toBe(201);const {id}=await r.json() as any;return {...f,plan,call,id};}
it('creates linked tasks, validates dates and owners, and rejects stale edits',async()=>{
 const f=await setup();const b={title:'Book lodging',tripId:f.id,dueDate:'2026-09-30',notes:'Confirm rooms'};
 expect((await f.plan('/tasks',{...b,dueDate:'2026-02-31'})).status).toBe(422);
 expect((await f.plan('/tasks',{...b,ownerId:'missing'})).status).toBe(422);
 const r=await f.plan('/tasks',b);expect(r.status).toBe(201);const {id}=await r.json() as any;
 const d=await (await f.plan('/dashboard')).json() as any;expect(d.tasks[0]).toMatchObject({id,title:'Book lodging',trip_id:f.id,revision:1});
 expect((await f.plan('/tasks',{...b,id,revision:1,status:'completed'})).status).toBe(200);
 expect((await f.plan('/tasks',{...b,id,revision:1,status:'open'})).status).toBe(409);
});
it('supports reviewed no-budget trips and invalidates reviews after changes',async()=>{
 const f=await setup(),path='/trips/'+f.id+'/readiness';let d=await readiness(f.env,f.id);const budget=d.sections.find(s=>s.section==='budget')!;
 expect((await f.plan(path,{section:'budget',status:'not_applicable',fingerprint:budget.fingerprint,note:'No financial arrangements for this trip.'})).status).toBe(200);
 d=await readiness(f.env,f.id);expect(d.sections.find(s=>s.section==='budget')?.state).toBe('not_applicable');
 f.sqlite.prepare('UPDATE trip_cost_items SET estimated_total=100 WHERE trip_id=?').run(f.id);
 d=await readiness(f.env,f.id);expect(d.sections.find(s=>s.section==='budget')?.state).toBe('needs_review');
 expect((await f.plan(path,{section:'budget',status:'not_applicable',fingerprint:budget.fingerprint,note:'None'})).status).toBe(409);
 expect(d.sections.find(s=>s.section==='content')?.issues.length).toBeGreaterThan(0);
});
it('copies selected template drafts to new dates without financial or private data',async()=>{
 const f=await setup();const c=await f.call('/admin/trips/'+f.id+'/content',{contentType:'devotional',title:'Serve',content:'A reusable lesson',eventDate:'2026-10-02',visibility:'travelers',publicationStatus:'published'});const {id:contentId}=await c.json() as any;
 const privateC=await f.call('/admin/trips/'+f.id+'/content',{contentType:'instruction',title:'Private',content:'Do not copy',visibility:'admin'});const {id:privateId}=await privateC.json() as any;
 const t=await f.plan('/templates',{title:'Service trip',tripId:f.id,contentIds:[contentId,privateId],includeBudget:true});expect(t.status).toBe(201);const {id:templateId}=await t.json() as any;
 const r=await f.call('/admin/trips',{title:'New journey',location:'Elsewhere',startDate:'2027-02-01',endDate:'2027-02-03',templateId});expect(r.status).toBe(201);const {id}=await r.json() as any;
 const content=f.sqlite.prepare('SELECT * FROM trip_content WHERE trip_id=?').all(id);expect(content).toHaveLength(1);expect(content[0]).toMatchObject({event_date:'2027-02-02',publication_status:'draft',visibility:'travelers'});
 const costs=f.sqlite.prepare('SELECT * FROM trip_cost_items WHERE trip_id=?').all(id);expect(costs.length).toBeGreaterThan(0);expect(costs.every(c=>c.estimated_total===0&&c.actual_total===0&&c.needs_estimate===1)).toBe(true);
 for(const table of ['trip_members','trip_payments','trip_accounts','trip_memories'])expect(f.sqlite.prepare(`SELECT count(*) n FROM ${table} WHERE trip_id=?`).get(id)?.n).toBe(0);
 expect((await f.call('/admin/trips',{title:'Too short',location:'Test',startDate:'2027-02-01',endDate:'2027-02-01',templateId})).status).toBe(422);
});
it('requires authentication and CSRF for planning writes',async()=>{const f=await setup();const path='/admin/planning/tasks';expect((await handlePlanning(new Request('http://localhost:4188/api/interest'+path,{method:'POST',headers:{cookie:'hs_admin_session='+f.token,'content-type':'application/json'},body:JSON.stringify({title:'No CSRF'})}),f.env,path)).status).toBe(403);expect((await handlePlanning(new Request('http://localhost:4188/api/interest/admin/planning/dashboard'),f.env,'/admin/planning/dashboard')).status).toBe(401);});
