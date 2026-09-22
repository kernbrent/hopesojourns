import {expect,it} from 'vitest';
import {ministryFixture} from './ministry-fixture';
import {handleTripAdminRequest} from '../src/trip-platform';
const base='/admin/trip-platform/devotionals';
async function setup(){
 const f=await ministryFixture();
 const call=(path:string,body?:unknown,method?:string)=>handleTripAdminRequest(f.request(path,body,method),f.env,path.split('?')[0]);
 const {id:tripId}=await (await call('/admin/trips',{title:'Library test trip',location:'Local test',startDate:'2027-01-09',endDate:'2027-01-14'})).json() as {id:string};
 const {id}=await (await call(base,{title:'Serve humbly',content:'Listen before speaking.',scripture:'John 13:1–17',topics:'Humility, service'})).json() as {id:string};
 const contentPath=`/admin/trips/${tripId}/content`;
 const content={contentType:'devotional',title:'My trip copy',content:'Trip-specific reflection',eventDate:'2027-01-10',visibility:'travelers',publicationStatus:'draft',devotionalId:id};
 const get=async()=>await (await call(`${base}/${id}`)).json() as any;
 return {...f,call,tripId,id,contentPath,content,get};
}
it('imports 13 Greece and 8 FOT masters, retaining both requested references',async()=>{
 const f=await ministryFixture();
 expect(f.sqlite.prepare('SELECT COUNT(*) n FROM devotional_library').get()?.n).toBe(21);
 expect(f.sqlite.prepare('SELECT COUNT(*) n FROM devotional_usage').get()?.n).toBe(13);
 expect(f.sqlite.prepare("SELECT scripture FROM devotional_library WHERE title='When We Become the Least'").get()?.scripture).toBe('Matthew 25:40; 2 Corinthians 12:9–10');
 expect(f.sqlite.prepare('SELECT content FROM devotional_library').all().some(r=>/June \d|October \d|Florida/.test(String(r.content)))).toBe(false);
});
it('keeps master and trip edits independent, tracking date and publishing changes',async()=>{
 const f=await setup();const saved=await f.call(f.contentPath,f.content);expect(saved.status).toBe(201);
 const {id}=await saved.json() as {id:string};let d=await f.get();expect(d.uses).toHaveLength(1);
 expect((await f.call(`${base}/${f.id}`,{title:'Updated master',content:'Master only',updatedAt:d.item.updated_at},'PUT')).status).toBe(200);
 expect(f.sqlite.prepare('SELECT content FROM trip_content WHERE id=?').get(id)?.content).toBe('Trip-specific reflection');
 expect((await f.call(f.contentPath,{...f.content,id,content:'Personalized again',eventDate:'2027-01-11',publicationStatus:'published'})).status).toBe(200);
 d=await f.get();expect(d.item.content).toBe('Master only');expect(d.uses).toHaveLength(1);expect(d.uses[0].event_date).toBe('2027-01-11');expect(d.uses[0].publication_status).toBe('published');
});
it('soft-deletes and restores masters, preserving copies and removed history',async()=>{
 const f=await setup();const {id}=await (await f.call(f.contentPath,f.content)).json() as {id:string};
 let d=await f.get();expect((await f.call(`${base}/${f.id}`,{updatedAt:d.item.updated_at},'DELETE')).status).toBe(200);
 expect((await f.call(f.contentPath,f.content)).status).toBe(404);
 expect((await f.call(f.contentPath,{...f.content,id,content:'Still editable'})).status).toBe(200);
 expect((await (await f.call(base+'?deleted=true')).json() as any).items.some((x:any)=>x.id===f.id)).toBe(true);
 d=await f.get();expect(d.uses).toHaveLength(1);
 expect((await f.call(`${base}/${f.id}/restore`,{updatedAt:d.item.updated_at})).status).toBe(200);
 expect((await f.get()).item.deleted_at).toBeNull();
 expect((await f.call(`${f.contentPath}/${id}`,undefined,'DELETE')).status).toBe(200);
 d=await f.get();expect(d.uses[0].removed_at).toBeTruthy();expect(d.uses[0].content_id).toBeNull();expect(d.uses[0].trip_title).toBe('Library test trip');
});
it('supports trip-only content and optional new masters without duplicate saves',async()=>{
 const f=await setup();const {id}=await (await f.call(f.contentPath,{...f.content,devotionalId:''})).json() as {id:string};
 expect(f.sqlite.prepare('SELECT devotional_id FROM trip_content WHERE id=?').get(id)?.devotional_id).toBeNull();
 expect((await f.call(f.contentPath,{...f.content,id,saveToLibrary:true,content:'Scripture: Psalm 23\n\nNew reflection.'})).status).toBe(200);
 const row=f.sqlite.prepare('SELECT devotional_id FROM trip_content WHERE id=?').get(id)!;
 expect(f.sqlite.prepare('SELECT scripture FROM devotional_library WHERE id=?').get(row.devotional_id)?.scripture).toBe('Psalm 23');
 expect(f.sqlite.prepare('SELECT COUNT(*) n FROM devotional_usage WHERE devotional_id=?').get(row.devotional_id)?.n).toBe(1);
 expect((await f.call(f.contentPath,{...f.content,id,saveToLibrary:true})).status).toBe(422);
});
it('preserves previous lineage when content changes type and becomes a different master',async()=>{
 const f=await setup();const {id}=await (await f.call(f.contentPath,f.content)).json() as {id:string};
 expect((await f.call(f.contentPath,{...f.content,id,contentType:'instruction'})).status).toBe(200);
 const old=await f.get();expect(old.uses[0].removed_at).toBeTruthy();expect(old.uses[0].content_id).toBeNull();
 expect((await f.call(f.contentPath,{...f.content,id,saveToLibrary:true})).status).toBe(200);
 const row=f.sqlite.prepare('SELECT devotional_id FROM trip_content WHERE id=?').get(id)!;expect(row.devotional_id).not.toBe(f.id);
 expect(f.sqlite.prepare('SELECT devotional_id FROM devotional_usage WHERE content_id=?').get(id)?.devotional_id).toBe(row.devotional_id);
});
it('rejects stale updates, unsafe links, invalid content IDs, anonymous access and missing CSRF',async()=>{
 const f=await setup();
 expect((await f.call(`${base}/${f.id}`,{title:'Overwrite',content:'No',updatedAt:'stale'},'PUT')).status).toBe(409);
 expect((await f.call(base,{title:'Unsafe',content:'No',linkUrl:'javascript:alert(1)'})).status).toBe(422);
 const before=f.sqlite.prepare('SELECT COUNT(*) n FROM devotional_library').get()?.n;
 expect((await f.call(f.contentPath,{...f.content,id:crypto.randomUUID(),saveToLibrary:true})).status).toBe(404);
 expect(f.sqlite.prepare('SELECT COUNT(*) n FROM devotional_library').get()?.n).toBe(before);
 const anonymous=f.request(base);anonymous.headers.delete('cookie');expect((await handleTripAdminRequest(anonymous,f.env,base)).status).toBe(401);
 const noCsrf=f.request(base,{title:'Test',content:'Test'});noCsrf.headers.delete('x-csrf-token');expect((await handleTripAdminRequest(noCsrf,f.env,base)).status).toBe(403);
 f.sqlite.exec(`INSERT INTO mmt_users(id,username,first_name,last_name,email,phone,country,is_admin,permissions_json,status,must_change_password,registered_at,updated_at)
 VALUES('reader','reader','Read','Only','reader@example.test','','US',0,'{"trips":"read"}','active',0,'2026','2026'); UPDATE admin_sessions SET user_id='reader'`);
 expect((await f.call(base)).status).toBe(200);expect((await f.call(base,{title:'No',content:'No'})).status).toBe(403);
});

it('fills an existing blank trip day with a linked copy and keeps its original record ID',async()=>{
 const f=await setup();
 const row=f.sqlite.prepare("SELECT id FROM trip_content WHERE trip_id=? AND event_date='2027-01-09' AND content_type='devotional'").get(f.tripId)!;
 expect((await f.call(f.contentPath,{...f.content,id:row.id,eventDate:'2027-01-09'})).status).toBe(200);
 expect(f.sqlite.prepare('SELECT devotional_id FROM trip_content WHERE id=?').get(row.id)?.devotional_id).toBe(f.id);
 expect((await f.get()).uses[0].content_id).toBe(row.id);
});
