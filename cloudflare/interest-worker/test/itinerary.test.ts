import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {ministryFixture} from './ministry-fixture';
import {handleTripAdminRequest,handleTripPublicRequest} from '../src/trip-platform';

async function setup(through?:string){const f=await ministryFixture(through);f.env.ADMIN_SESSION_SECRET='test-only-itinerary-secret';const r=await handleTripAdminRequest(f.request('/admin/trips',{title:'Itinerary test',location:'England',status:'draft'}),f.env,'/admin/trips');const {id}=await r.json() as any;const call=(suffix:string,body?:object)=>handleTripAdminRequest(f.request(`/admin/trips/${id}${suffix}`,body),f.env,`/admin/trips/${id}${suffix}`);return {...f,id,call};}
const daily={contentType:'itinerary',itineraryCategory:'daily',title:'Our day',eventDate:'2026-10-10',visibility:'travelers',publicationStatus:'published'};
it('migrates existing travel, daily plans and devotional content without replacing records',async()=>{
 const f=await setup('0040_trip_travel.sql');
 for(const [id,type,kind] of [['old-flight','itinerary','travel'],['old-day','itinerary','activity'],['old-study','devotional','activity']])f.sqlite.prepare(`INSERT INTO trip_content(id,trip_id,content_type,itinerary_kind,title,content,event_date,location,visibility,publication_status,sort_order,created_at,updated_at,arrival_location,service_number) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,f.id,type,kind,id,'Original notes','2026-10-10','DFW','travelers','published',4,'original','original','LHR','AA50');
 f.sqlite.exec(readFileSync(new URL('../migrations/0041_itinerary_categories.sql',import.meta.url),'utf8'));
 const rows=f.sqlite.prepare("SELECT * FROM trip_content WHERE id LIKE 'old-%' ORDER BY id").all() as any[];
 expect(rows).toHaveLength(3);expect(rows.find(r=>r.id==='old-flight')).toMatchObject({itinerary_category:'transportation',arrival_location:'LHR',service_number:'AA50',updated_at:'original'});
 expect(rows.find(r=>r.id==='old-day')).toMatchObject({itinerary_category:'daily',content:'Original notes'});expect(rows.find(r=>r.id==='old-study').content_type).toBe('devotional');
});
it('allows a quick daily plan, validates date ranges and retains new fields on legacy edits',async()=>{
 const f=await setup();const r=await f.call('/content',{...daily,itineraryCategory:'lodging',endDate:'2026-10-12',itineraryTags:['meal'],itineraryDetails:{venue:'Hotel',address:'Main Street'},itineraryPrivate:{reservation:'PRIVATE123'}});expect(r.status).toBe(201);const {id}=await r.json() as any;
 expect((await f.call('/content',{...daily,id,itineraryCategory:undefined,title:'Updated title'})).status).toBe(200);
 const row=f.sqlite.prepare('SELECT * FROM trip_content WHERE id=?').get(id) as any;
 expect(row.itinerary_category).toBe('lodging');expect(JSON.parse(row.itinerary_private).reservation).toBe('PRIVATE123');expect(row.end_date).toBe('2026-10-12');
 expect((await f.call('/content',{...daily,endDate:'2026-10-09'})).status).toBe(422);
 expect((await f.call('/content',{...daily,itineraryTags:['invalid']})).status).toBe(422);
 expect((await f.call('/content',{...daily,eventDate:''})).status).toBe(422);
 expect((await f.call('/content',daily)).status).toBe(201);
});
it('keeps private booking fields out of the traveler response and honors publication controls',async()=>{
 const f=await setup();await f.call('/content',{...daily,itineraryCategory:'lodging',endDate:'2026-10-12',itineraryDetails:{venue:'Visible Hotel'},itineraryPrivate:{reservation:'SECRET-BOOKING',notes:'PRIVATE-NOTE'}});
 await f.call('/content',{...daily,title:'Secret plan',visibility:'admin'});await f.call('/content',{...daily,title:'Draft plan',publicationStatus:'draft'});
 await f.call('/portal-credential',{loginId:'ITINERARY-TEST',password:'Itinerary test password'});
 const login=await handleTripPublicRequest(f.request('/portal/login',{loginId:'ITINERARY-TEST',password:'Itinerary test password'}),f.env,'/portal/login');const req=f.request('/portal/session');req.headers.set('cookie',login.headers.get('set-cookie')!.split(';')[0]);
 const r=await handleTripPublicRequest(req,f.env,'/portal/session');const body=await r.text();expect(body).not.toContain('SECRET-BOOKING');expect(body).not.toContain('PRIVATE-NOTE');expect(body).not.toContain('Secret plan');expect(body).not.toContain('Draft plan');expect(JSON.parse(body).content[0]).toMatchObject({itinerary_category:'lodging',end_date:'2026-10-12'});
});
it('looks up ministries and blocks normalized name duplicates; requires review for shared contact details',async()=>{
 const f=await setup();const first=await f.call('/itinerary-ministries',{name:'Hope Kitchen',city:'London',email:'office@example.org',phone:'+1 (972) 555-1234',website:'https://www.example.org'});expect(first.status).toBe(201);const {id}=await first.json() as any;
 const same=await (await f.call('/itinerary-ministries',{name:'HOPE-KITCHEN'})).json() as any;expect(same.blocked).toBe(true);expect(same.matches[0].id).toBe(id);
 for(const field of [{email:'OFFICE@example.org'},{phone:'9725551234'},{website:'https://example.org/branch'}]){const r=await(await f.call('/itinerary-ministries',{name:'Separate Branch',...field})).json() as any;expect(r.matches[0].id).toBe(id);expect(r.reviewToken).toBeTruthy();}
 const body={name:'Separate Branch',email:'office@example.org'};const review=await(await f.call('/itinerary-ministries',body)).json() as any;
 expect((await f.call('/itinerary-ministries',{...body,reviewToken:review.reviewToken})).status).toBe(201);
 const lookup=await(await f.call('/itinerary-ministries')).json() as any;expect(lookup.ministries).toHaveLength(2);
 expect((await f.call('/content',{...daily,itineraryCategory:'ministry',ministryId:id})).status).toBe(201);
});
it('groups lodging across days, tags daily overviews and includes devotionals in worship',()=>{
 const context:any={window:{}};vm.runInNewContext(readFileSync(new URL('../../../journey/itinerary.js',import.meta.url),'utf8'),context);const I=context.window.HSItinerary;
 expect([...I.dates({content_type:'itinerary',itinerary_category:'lodging',event_date:'2026-10-10',end_date:'2026-10-12'})]).toEqual(['2026-10-10','2026-10-11','2026-10-12']);
 expect([...I.sections({content_type:'devotional'})]).toEqual(['worship']);expect([...I.sections({content_type:'itinerary',itinerary_category:'daily',itinerary_tags:'["lodging","transportation"]'})]).toEqual(['daily','lodging','transportation']);
});
import {readSpreadsheet} from '../src/spreadsheet-reader';
import {buildTripWorkbook} from '../src/trip-xlsx';
import {handlePlanning} from '../src/planning';
it('round trips category details and private bookings through the admin workbook',async()=>{
 const f=await setup();const {id}=await(await f.call('/content',{...daily,itineraryCategory:'lodging',endDate:'2026-10-12',itineraryTags:['meal'],itineraryDetails:{venue:'Original Hotel'},itineraryPrivate:{reservation:'KEEP-PRIVATE'}})).json() as any;
 const sheets=readSpreadsheet('trip.xlsx',new Uint8Array(await(await f.call('/export')).arrayBuffer()));const sheet=sheets.find(s=>s.name==='Content')!;const headers=sheet.rows.find(r=>r.cells.includes('Content Type'))!.cells.map(String);const row=sheet.rows.find(r=>r.cells.includes(id))!;
 expect(row.cells[headers.indexOf('Itinerary Category')]).toBe('lodging');row.cells[headers.indexOf('Itinerary Details')]='{"venue":"Updated Hotel"}';
 const form=new FormData();form.set('file',new File([new Uint8Array(buildTripWorkbook([{name:'Content',purpose:'Round trip',headers,rows:[row.cells]}]))],'trip.xlsx'));form.set('commit','true');
 const path=`/admin/trips/${f.id}/import`;const response=await handleTripAdminRequest(f.request(path,form),f.env,path);expect(response.status).toBe(200);
 const saved=f.sqlite.prepare('SELECT * FROM trip_content WHERE id=?').get(id) as any;expect(JSON.parse(saved.itinerary_details).venue).toBe('Updated Hotel');expect(JSON.parse(saved.itinerary_private).reservation).toBe('KEEP-PRIVATE');expect(saved.end_date).toBe('2026-10-12');expect(JSON.parse(saved.itinerary_tags)).toEqual(['meal']);
});
it('retains template categories and tags without copying private booking details',async()=>{
 const f=await setup();const {id}=await(await f.call('/content',{...daily,itineraryCategory:'lodging',itineraryTags:['meal'],itineraryPrivate:{reservation:'DO-NOT-COPY'}})).json() as any;
 const path='/admin/planning/templates';const response=await handlePlanning(f.request(path,{title:'Category template',tripId:f.id,contentIds:[id]}),f.env,path);expect(response.status).toBe(201);const {id:templateId}=await response.json() as any;
 const created=await handleTripAdminRequest(f.request('/admin/trips',{title:'Copied trip',location:'Test',templateId}),f.env,'/admin/trips');expect(created.status).toBe(201);const {id:newId}=await created.json() as any;
 expect(f.sqlite.prepare('SELECT itinerary_category,itinerary_tags,itinerary_private,ministry_id FROM trip_content WHERE trip_id=?').get(newId)).toMatchObject({itinerary_category:'lodging',itinerary_tags:'["meal"]',itinerary_private:'{}',ministry_id:null});
});
it('invalidates duplicate review when candidate details or catalog change',async()=>{
 const f=await setup();await f.call('/itinerary-ministries',{name:'Original',email:'shared@example.org'});const b={name:'New Branch',email:'shared@example.org'};
 const review=await(await f.call('/itinerary-ministries',b)).json() as any;
 const changed=await(await f.call('/itinerary-ministries',{...b,name:'Different Branch',reviewToken:review.reviewToken})).json() as any;expect(changed.id).toBeUndefined();expect(changed.reviewToken).not.toBe(review.reviewToken);
 await f.call('/itinerary-ministries',{name:'Another ministry'});const stale=await(await f.call('/itinerary-ministries',{...b,reviewToken:review.reviewToken})).json() as any;expect(stale.id).toBeUndefined();
});
