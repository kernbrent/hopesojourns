import {afterEach,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {ministryFixture} from './ministry-fixture';
import {handleTripPublicRequest} from '../src/trip-platform';
const sql=readFileSync(new URL('../migrations/0069_mexico_host_briefing.sql',import.meta.url),'utf8');
const fixtures:Awaited<ReturnType<typeof ministryFixture>>[]=[];
const ids=['0d061718-59f9-48a8-9c33-da98bd5d03cb','94da964d-07d0-498c-bad0-a39153f86191','1ae73842-e4cf-459b-9821-daa4845d5e21','46ef7eb7-0e9d-44d1-b224-2e6c10e08354','be4235be-cf42-4ae9-8905-e25850b5f0c4','a18fc0dc-7db4-4b4a-bfd5-60fcf153abd2'];
async function setup(){
 const f=await ministryFixture('0068_athens_july_2027_dates.sql');fixtures.push(f);
 f.sqlite.exec("INSERT INTO trips(id,opportunity_id,code,slug,title,location,start_date,end_date,status,public_enabled,portal_enabled,created_at,updated_at) VALUES('mexico-local','trip-mexico-city','MEXICO-LOCAL','mexico-january-2027-8385c082','Mexico January 2027','Mexico City, Mexico','2027-01-09','2027-01-14','recruiting',1,1,'old','old'),('other-trip','trip-athens','OTHER','unrelated','Unrelated trip','Athens','2027-01-09','2027-01-14','recruiting',0,0,'old','old');");
 ids.forEach((id,index)=>f.sqlite.prepare("INSERT INTO trip_content(id,trip_id,content_type,title,content,event_date,visibility,publication_status,created_at,updated_at) VALUES(?,'mexico-local','itinerary',?,'Outdated outline',?,'travelers','published','old','old')").run(id,`Day ${index+1} itinerary`,`2027-01-${String(index+9).padStart(2,'0')}`));
 f.sqlite.exec("INSERT INTO trip_content(id,trip_id,content_type,title,content,visibility,publication_status,created_at,updated_at) VALUES('packing','mexico-local','resource','Packing list','Keep my packing list','travelers','published','old','old'),('devotional','mexico-local','devotional','A study','Preserve devotional text','travelers','draft','old','old'),('admin-note','mexico-local','instruction','Leader note','Private leader planning','admin','published','old','old'),('other-content','other-trip','itinerary','Another plan','Do not alter','travelers','published','old','old');");
 return f;
}
afterEach(()=>fixtures.splice(0).forEach(f=>f.sqlite.close()));
it('corrects six source-derived days, adds the ministry briefing, and preserves unrelated/private records and access settings',async()=>{
 const f=await setup();f.sqlite.exec(sql);
 const rows=f.sqlite.prepare("SELECT * FROM trip_content WHERE trip_id='mexico-local' ORDER BY event_date").all() as any[];
 expect(rows.filter(r=>r.content_type==='itinerary')).toHaveLength(6);
 expect(rows.filter(r=>r.content_type==='itinerary').every(r=>r.content.includes('PROPOSED ITINERARY')&&r.content.includes('before and during the journey'))).toBe(true);
 expect(rows.find(r=>r.id===ids[0]).content).toContain('23:00');
 expect(rows.find(r=>r.id===ids[1]).content).toContain('Outreach activity');
 expect(rows.find(r=>r.id===ids[2]).content).toContain('13:00–15:00');
 expect(rows.find(r=>r.id===ids[2]).content).toContain('awaiting host confirmation');
 expect(rows.find(r=>r.id===ids[3]).content.match(/10:00–12:00/g)).toHaveLength(1);
 expect(rows.find(r=>r.id===ids[4]).content).toContain('Outreach activity');
 expect(rows.find(r=>r.id===ids[5]).content).toContain('booked departure flight');
 expect(rows.find(r=>r.id==='packing')).toMatchObject({content:'Keep my packing list',visibility:'travelers',updated_at:'old'});
 expect(rows.find(r=>r.id==='devotional')).toMatchObject({content:'Preserve devotional text',publication_status:'draft',updated_at:'old'});
 expect(f.sqlite.prepare("SELECT content FROM trip_content WHERE id='other-content'").get()).toMatchObject({content:'Do not alter'});
 expect(f.sqlite.prepare("SELECT public_enabled,portal_enabled FROM trips WHERE id='other-trip'").get()).toMatchObject({public_enabled:0,portal_enabled:0});
 const before=f.sqlite.prepare('SELECT total_changes() AS n').get() as any;f.sqlite.exec(sql);
 expect(f.sqlite.prepare('SELECT total_changes() AS n').get()).toMatchObject(before);
});
it('shows the updated itinerary and briefing publicly while keeping traveler-only and admin-only content private',async()=>{
 const f=await setup();f.sqlite.exec(sql);
 const response=await handleTripPublicRequest(new Request('https://test.hopesojourns.com/api/interest/public/trips/mexico-january-2027-8385c082'),f.env,'/public/trips/mexico-january-2027-8385c082');
 expect(response.status).toBe(200);const data=await response.json() as any;
 expect(data.content.filter((r:any)=>r.content_type==='itinerary')).toHaveLength(6);
 expect(data.content.some((r:any)=>r.link_url==='/trips/mexico-city/gods-kitchen/')).toBe(true);
 expect(JSON.stringify(data)).not.toMatch(/Keep my packing|Private leader|Preserve devotional/);
});
it('does not enable an environment’s unpublished trip or traveler portal',async()=>{
 const f=await setup();f.sqlite.exec("UPDATE trips SET public_enabled=0,portal_enabled=0 WHERE id='mexico-local'");f.sqlite.exec(sql);
 expect(f.sqlite.prepare("SELECT public_enabled,portal_enabled FROM trips WHERE id='mexico-local'").get()).toMatchObject({public_enabled:0,portal_enabled:0});
 const response=await handleTripPublicRequest(new Request('https://test.hopesojourns.com/api/interest/public/trips/mexico-january-2027-8385c082'),f.env,'/public/trips/mexico-january-2027-8385c082');expect(response.status).toBe(404);
});
