import {expect,it} from 'vitest';
import {ministryFixture} from './ministry-fixture';
import {handleTripAdminRequest,handleTripPublicRequest} from '../src/trip-platform';
async function setup(){
 const f=await ministryFixture();
 const call=(path:string,body?:unknown,method?:string)=>handleTripAdminRequest(f.request(path,body,method),f.env,path.split('?')[0]);
 const {id}=await (await call('/admin/trips',{title:'Memory test',location:'Test destination',startDate:'2025-01-09',endDate:'2025-01-14'})).json() as any;
 f.sqlite.prepare("UPDATE trips SET status='completed',portal_enabled=1 WHERE id=?").run(id);
 const destination=f.sqlite.prepare("SELECT id FROM destinations WHERE status='published' LIMIT 1").get()!;
 const base=`/admin/trips/${id}/memories`;
 const publicCall=(p:string,cookie='')=>handleTripPublicRequest(new Request('http://localhost:4188/api/interest'+p,{headers:{cookie}}),f.env,p.split('?')[0]);
 const trip=f.sqlite.prepare('SELECT slug FROM trips WHERE id=?').get(id)!;
 const publicPath='/public/trip-stories/'+trip.slug;
 const note=async(visible=true)=>{const r=await call(base,{title:'Reflection',content:'A day of service',event_date:'2025-01-10',portal_visible:visible});expect(r.status).toBe(201);return (await r.json() as any).memory;};
 const photo=async()=>{const form=new FormData();form.set('file',new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64')],'photo.png',{type:'image/png'}));form.set('title','Together');form.set('alt_text','Our group together');form.set('portal_visible','true');const r=await call(base,form);expect(r.status).toBe(201);return (await r.json() as any).memory;};
 const draft=(memory_ids:string[],content_ids:string[]=[],revision=0)=>call(base+'/publication/draft',{revision,destination_id:destination.id,title:'Our trip',summary:'We served together.',story:'A meaningful journey.',memory_ids,content_ids});
 const cookieToken='b'.repeat(48),hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(cookieToken))).toString('base64url');
 f.sqlite.prepare('INSERT INTO trip_portal_sessions(id,trip_id,token_hash,expires_at,last_seen_at,created_at) VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),id,hash,'2099-01-01','2026-01-01','2026-01-01');
 return {...f,call,id,base,publicCall,publicPath,note,photo,draft,cookie:'hs_trip_portal_session='+cookieToken};
}
it('keeps notes and photos private until explicitly selected, previewed, and published',async()=>{
 const f=await setup(),note=await f.note(),privateNote=await f.note(false),photo=await f.photo();
 expect((await f.publicCall(f.publicPath)).status).toBe(404);
 expect((await f.publicCall(f.publicPath+'/photos/'+photo.id)).status).toBe(404);
 const session=await (await f.publicCall('/portal/session',f.cookie)).json() as any;
 expect(session.memories.map((m:any)=>m.id)).toEqual(expect.arrayContaining([note.id,photo.id]));expect(session.memories.some((m:any)=>m.id===privateNote.id)).toBe(false);
 expect(JSON.stringify(session.memories)).not.toContain('object_key');
 expect((await f.publicCall(`/portal/trips/${f.id}/photos/${photo.id}`,f.cookie)).status).toBe(200);
 expect((await f.publicCall(`/portal/trips/${crypto.randomUUID()}/photos/${photo.id}`,f.cookie)).status).toBe(404);
 expect((await f.publicCall(`/portal/trips/${f.id}/photos/${photo.id}`)).status).toBe(401);
 expect((await f.draft([note.id,photo.id])).status).toBe(200);
 expect((await f.publicCall(f.publicPath)).status).toBe(404);
 expect((await f.call(f.base+'/publication/publish',{revision:1})).status).toBe(200);
 const published=await (await f.publicCall(f.publicPath)).json() as any;
 expect(published.story.memories).toHaveLength(2);expect(JSON.stringify(published)).not.toMatch(/object_key|portal_visible|budget|email|token_hash/);
 const image=await f.publicCall(f.publicPath+'/photos/'+photo.id);expect(image.status).toBe(200);expect(image.headers.get('content-type')).toBe('image/png');
 expect((await f.publicCall(f.publicPath+'/photos/'+privateNote.id)).status).toBe(404);
 expect((await (await f.publicCall('/public/trip-stories')).json() as any).stories).toHaveLength(1);
 expect((await (await f.publicCall('/public/trip-stories?destination=missing')).json() as any).stories).toHaveLength(0);
});
it('preserves reviewed snapshots across edits and removals; supports update and unpublish',async()=>{
 const f=await setup(),n=await f.note(),p=await f.photo();const contentPath=`/admin/trips/${f.id}/content`;
 const content={contentType:'devotional',title:'Serve together',content:'Scripture: John 13:1–17\n\nOriginal devotional',visibility:'travelers',publicationStatus:'published'};
 const saved=await f.call(contentPath,content);expect(saved.status).toBe(201);const {id:studyId}=await saved.json() as any;
 await f.draft([n.id,p.id],[studyId]);await f.call(f.base+'/publication/publish',{revision:1});
 expect((await f.call(f.base+'/'+n.id,{title:'Edited',content:'Private new wording',revision:1},'PUT')).status).toBe(200);
 expect((await f.call(f.base+'/'+p.id,{revision:1},'DELETE')).status).toBe(200);
 expect((await f.publicCall(`/portal/trips/${f.id}/photos/${p.id}`,f.cookie)).status).toBe(404);
 expect((await f.publicCall(f.publicPath+'/photos/'+p.id)).status).toBe(200);
 await f.call(contentPath,{...content,id:studyId,content:'Later private edits'});let s=await (await f.publicCall(f.publicPath)).json() as any;expect(s.story.content[0].content).toContain('Original devotional');expect(s.story.memories.find((m:any)=>m.id===n.id).content).toBe('A day of service');
 expect((await f.draft([n.id],[],2)).status).toBe(200);
 s=await (await f.publicCall(f.publicPath)).json() as any;expect(s.story.memories).toHaveLength(2);
 expect((await f.call(f.base+'/publication/publish',{revision:2})).status).toBe(409);
 expect((await f.call(f.base+'/publication/publish',{revision:3})).status).toBe(200);
 s=await (await f.publicCall(f.publicPath)).json() as any;expect(s.story.memories[0].content).toBe('Private new wording');
 expect((await f.publicCall(f.publicPath+'/photos/'+p.id)).status).toBe(404);
 expect((await f.call(f.base+'/'+p.id+'/restore',{revision:2})).status).toBe(200);
 expect((await f.call(f.base+'/publication/unpublish',{revision:4})).status).toBe(200);expect((await f.publicCall(f.publicPath)).status).toBe(404);
});
it('rejects unavailable selections, future trips, invalid files, stale edits, and unauthorized writes',async()=>{
 const f=await setup(),n=await f.note();
 expect((await f.draft([crypto.randomUUID()])).status).toBe(422);
 const contentPath=`/admin/trips/${f.id}/content`;
 const {id:contentId}=await (await f.call(contentPath,{contentType:'devotional',title:'Private',content:'Private content',visibility:'admin',publicationStatus:'published'})).json() as any;
 expect((await f.draft([], [contentId])).status).toBe(422);
 await f.draft([n.id]);f.sqlite.prepare("UPDATE trips SET status='draft',end_date='2099-01-01' WHERE id=?").run(f.id);
 expect((await f.call(f.base+'/publication/publish',{revision:1})).status).toBe(422);
 expect((await f.call(f.base+'/'+n.id,{revision:9},'DELETE')).status).toBe(409);
 const form=new FormData();form.set('file',new File(['<svg onload="alert(1)"></svg>'],'bad.png',{type:'image/png'}));expect((await f.call(f.base,form)).status).toBe(422);
 const anon=f.request(f.base);anon.headers.delete('cookie');expect((await handleTripAdminRequest(anon,f.env,f.base)).status).toBe(401);
 const csrf=f.request(f.base,{title:'Fail',content:'No'});csrf.headers.delete('x-csrf-token');expect((await handleTripAdminRequest(csrf,f.env,f.base)).status).toBe(403);
 f.sqlite.exec(`INSERT INTO mmt_users(id,username,first_name,last_name,email,phone,country,is_admin,permissions_json,status,must_change_password,registered_at,updated_at) VALUES('reader','reader','Read','Only','reader@example.test','','US',0,'{"trips":"read"}','active',0,'2026','2026'); UPDATE admin_sessions SET user_id='reader'`);
 expect((await f.call(f.base)).status).toBe(200);expect((await f.call(f.base,{title:'No',content:'No'})).status).toBe(403);
});
it('permanently deletes only removed, confirmed items and their stored image bytes',async()=>{
 const f=await setup(),n=await f.note(),p=await f.photo();const key=String(f.sqlite.prepare('SELECT object_key FROM trip_memories WHERE id=?').get(p.id)!.object_key);
 expect((await f.call(f.base+'/'+n.id+'/permanent',{revision:1,confirm:true},'DELETE')).status).toBe(409);
 for(const m of [n,p]){
  await f.call(f.base+'/'+m.id,{revision:1},'DELETE');
  expect((await f.call(f.base+'/'+m.id+'/permanent',{revision:2},'DELETE')).status).toBe(422);
  expect((await f.call(f.base+'/'+m.id+'/permanent',{revision:1,confirm:true},'DELETE')).status).toBe(409);
  expect((await f.call(f.base+'/'+m.id+'/permanent',{revision:2,confirm:true},'DELETE')).status).toBe(200);
  expect(f.sqlite.prepare('SELECT id FROM trip_memories WHERE id=?').get(m.id)).toBeUndefined();
  expect((await f.call(f.base+'/'+m.id+'/restore',{revision:2})).status).toBe(404);
 }
 expect(f.files.has(key)).toBe(false);
 expect(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_events WHERE event_type='permanently_deleted'").get()!.n).toBe(2);
});
it('protects draft and public story references before allowing permanent deletion',async()=>{
 const f=await setup(),n=await f.note();await f.draft([n.id]);await f.call(f.base+'/'+n.id,{revision:1},'DELETE');
 expect((await f.call(f.base+'/'+n.id+'/permanent',{revision:2,confirm:true},'DELETE')).status).toBe(409);
 await f.call(f.base+'/publication/publish',{revision:1});await f.draft([],[],2);
 expect((await f.call(f.base+'/'+n.id+'/permanent',{revision:2,confirm:true},'DELETE')).status).toBe(409);
 await f.call(f.base+'/publication/unpublish',{revision:3});
 expect((await f.call(f.base+'/'+n.id+'/permanent',{revision:2,confirm:true},'DELETE')).status).toBe(200);
 const stale=JSON.stringify({memories:[{id:n.id}]});
 expect(()=>f.sqlite.prepare('UPDATE trip_publications SET draft_json=? WHERE trip_id=?').run(stale,f.id)).toThrow('TRIP_MEMORY_UNAVAILABLE');
});
it('retains a locked retryable item on storage failure and blocks restoration and stale snapshots',async()=>{
 const f=await setup(),p=await f.photo();await f.call(f.base+'/'+p.id,{revision:1},'DELETE');const original=f.env.RECEIPTS.delete;
 f.env.RECEIPTS.delete=async()=>{throw Error('Storage unavailable');};
 expect((await f.call(f.base+'/'+p.id+'/permanent',{revision:2,confirm:true},'DELETE')).status).toBe(503);
 const pending=f.sqlite.prepare('SELECT * FROM trip_memories WHERE id=?').get(p.id)!;expect(pending.purge_pending).toBe(1);expect(pending.revision).toBe(3);
 expect((await f.call(f.base+'/'+p.id+'/restore',{revision:3})).status).toBe(409);
 expect(()=>f.sqlite.prepare('INSERT INTO trip_publications(trip_id,draft_json,updated_at) VALUES(?,?,?)').run(f.id,JSON.stringify({memories:[{id:p.id}]}),'2026')).toThrow('TRIP_MEMORY_UNAVAILABLE');
 f.env.RECEIPTS.delete=original;
 expect((await f.call(f.base+'/'+p.id+'/permanent',{revision:3,confirm:true},'DELETE')).status).toBe(200);
 expect(f.files.size).toBe(0);
});
it('restricts permanent deletion to administrators with CSRF and the matching trip',async()=>{
 const f=await setup(),n=await f.note();await f.call(f.base+'/'+n.id,{revision:1},'DELETE');const path=f.base+'/'+n.id+'/permanent';
 const csrf=f.request(path,{revision:2,confirm:true},'DELETE');csrf.headers.delete('x-csrf-token');expect((await handleTripAdminRequest(csrf,f.env,path)).status).toBe(403);
 const anonymous=f.request(path,{revision:2,confirm:true},'DELETE');anonymous.headers.delete('cookie');expect((await handleTripAdminRequest(anonymous,f.env,path)).status).toBe(401);
 const {id:other}=await (await f.call('/admin/trips',{title:'Other trip',location:'Elsewhere'})).json() as any;
 expect((await f.call(`/admin/trips/${other}/memories/${n.id}/permanent`,{revision:2,confirm:true},'DELETE')).status).toBe(404);
 f.sqlite.exec(`INSERT INTO mmt_users(id,username,first_name,last_name,email,phone,country,is_admin,permissions_json,status,must_change_password,registered_at,updated_at) VALUES('editor','editor','Trip','Editor','editor@example.test','','US',0,'{"trips":"edit"}','active',0,'2026','2026'); UPDATE admin_sessions SET user_id='editor'`);
 expect((await f.call(path,{revision:2,confirm:true},'DELETE')).status).toBe(403);
 expect(f.sqlite.prepare('SELECT id FROM trip_memories WHERE id=?').get(n.id)).toBeTruthy();
});
