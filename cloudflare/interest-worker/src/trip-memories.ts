import {AdminError,adminJson,authenticate,auditStatement,readAdminJson,type AdminEnv} from './admin';
import {detectReceiptMedia,ReceiptFileError} from './receipt-file';
type Row=Record<string,any>;
const MAX_IMAGE=6*1024*1024;
const MAX_ITEMS=300;
const noStore={'Cache-Control':'no-store'};
function fail(status:number,code:string,message:string):never{throw new AdminError(status,code,message);}
function line(value:unknown,max:number,required=false):string{if(value==null&&!required)return '';if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)||(required&&!value.trim()))fail(422,'INVALID_CONTENT','Complete the required fields and stay within the indicated text limits.');return value.trim();}
function date(value:unknown){if(!value)return null;const s=line(value,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)fail(422,'INVALID_DATE','Choose a valid date.');return s;}
async function trip(env:AdminEnv,id:string){const row=await env.DB.prepare('SELECT id,slug,title,location,start_date,end_date,status,opportunity_id FROM trips WHERE id=?').bind(id).first<Row>();if(!row)fail(404,'NOT_FOUND','Trip not found.');return row;}
function imageUrl(id:string,tripId:string,mode:string,slug?:string){return mode==='public'?`/api/interest/public/trip-stories/${slug}/photos/${id}`:mode==='portal'?`/api/interest/portal/trips/${tripId}/photos/${id}`:`/api/interest/admin/trips/${tripId}/memories/${id}/image`;}
function mapped(row:Row,mode='admin',slug?:string){const {object_key,media_type,byte_size,...safe}=row;return {...safe,...(row.kind==='photo'?{image_url:imageUrl(row.id,row.trip_id,mode,slug)}:{})};}
async function item(env:AdminEnv,tripId:string,id:string){const row=await env.DB.prepare('SELECT * FROM trip_memories WHERE trip_id=? AND id=?').bind(tripId,id).first<Row>();if(!row)fail(404,'NOT_FOUND','Trip memory not found.');return row;}
async function photoResponse(env:AdminEnv,row:Row){if(row.kind!=='photo'||!row.object_key)fail(404,'NOT_FOUND','Photo not found.');const object=await env.RECEIPTS.get(row.object_key);if(!object)fail(404,'NOT_FOUND','Photo not found.');return new Response(object.body,{headers:{...noStore,'Content-Type':row.media_type,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}});}
async function photoForm(request:Request){if(!request.body)fail(422,'NO_PHOTO','Choose a photo.');const reader=request.body.getReader(),parts:Uint8Array[]=[];let size=0;while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>MAX_IMAGE+65536){await reader.cancel();fail(413,'TOO_LARGE','Choose a photo up to 6 MB.');}parts.push(chunk.value);}const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();}
async function upload(request:Request,env:AdminEnv,tripId:string){
 const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM trip_memories WHERE trip_id=? AND deleted_at IS NULL').bind(tripId).first<Row>();if(Number(count?.n)>=MAX_ITEMS)fail(422,'LIMIT','This trip already has 300 memories.');
 const form=await photoForm(request),file=form.get('file');if(!(file instanceof File)||!file.size||file.size>MAX_IMAGE)fail(422,'INVALID_IMAGE','Choose a JPEG, PNG, or WebP photo up to 6 MB.');
 const bytes=new Uint8Array(await file.arrayBuffer());let media;try{media=detectReceiptMedia(bytes);}catch(e){if(e instanceof ReceiptFileError)fail(422,'INVALID_IMAGE','Choose a JPEG, PNG, or WebP photo.');throw e;}if(!['image/jpeg','image/png','image/webp'].includes(media.mediaType))fail(422,'INVALID_IMAGE','Choose a JPEG, PNG, or WebP photo.');
 const id=crypto.randomUUID(),key=`trip-memories/${tripId}/${id}.${media.extension}`,now=new Date().toISOString();
 const values=[id,tripId,line(form.get('title'),180,true),line(form.get('caption'),1000),line(form.get('alt_text'),300,true),line(form.get('credit'),180),date(form.get('event_date')),form.get('portal_visible')==='true'?1:0,key,media.mediaType,file.size,now];
 await env.RECEIPTS.put(key,bytes,{httpMetadata:{contentType:media.mediaType}});
 try{await env.DB.batch([env.DB.prepare("INSERT INTO trip_memories(id,trip_id,kind,title,caption,alt_text,credit,event_date,portal_visible,object_key,media_type,byte_size,created_at,updated_at) VALUES(?1,?2,'photo',?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?12)").bind(...values),auditStatement(env,'trip_memory',id,'photo_added',{tripId})]);}catch(e){await env.RECEIPTS.delete(key);throw e;}
 return adminJson({memory:mapped(await item(env,tripId,id))},201,noStore);
}
function ids(value:unknown):string[]{if(!Array.isArray(value)||value.length>MAX_ITEMS||value.some(id=>typeof id!=='string')||new Set(value).size!==value.length)fail(422,'INVALID_SELECTION','Choose valid, unique items for the public story.');return value as string[];}
function safeSnapshot(snapshot:Row,mode:string,tripId:string,slug:string){return {...snapshot,memories:snapshot.memories.map((m:Row)=>mapped({...m,trip_id:tripId},mode,slug))};}
async function publication(env:AdminEnv,tripId:string){return env.DB.prepare('SELECT * FROM trip_publications WHERE trip_id=?').bind(tripId).first<Row>();}
function revision(body:Row,row:Row|null){if(!Number.isInteger(body.revision)||body.revision!==Number(row?.revision||0))fail(409,'STALE_EDIT','This trip story changed. Refresh before saving or publishing.');}
async function buildDraft(request:Request,env:AdminEnv,t:Row){
 const body=await readAdminJson(request),current=await publication(env,t.id);revision(body,current);
 const destination=await env.DB.prepare("SELECT id,slug,title FROM destinations WHERE id=? AND status='published'").bind(line(body.destination_id,100,true)).first<Row>();if(!destination)fail(422,'DESTINATION_REQUIRED','Choose a published destination for this trip story.');
 const contentIds=ids(body.content_ids),memoryIds=ids(body.memory_ids);
 const [contents,memories]=await Promise.all([env.DB.prepare("SELECT id,content_type,title,content,event_date,event_time,location,link_url,sort_order FROM trip_content WHERE trip_id=? AND visibility IN ('public','travelers') AND publication_status='published' ORDER BY event_date,sort_order,title").bind(t.id).all<Row>(),env.DB.prepare('SELECT * FROM trip_memories WHERE trip_id=? AND deleted_at IS NULL ORDER BY event_date,created_at,id').bind(t.id).all<Row>()]);
 const chosenContent=contents.results.filter(c=>contentIds.includes(c.id)),chosenMemories=memories.results.filter(m=>memoryIds.includes(m.id));if(chosenContent.length!==contentIds.length||chosenMemories.length!==memoryIds.length)fail(422,'INVALID_SELECTION','One of the selected items is unavailable or is admin-only. Refresh the collection.');
 const snapshot={title:line(body.title,180,true),summary:line(body.summary,2000,true),story:line(body.story,20000),destination,location:t.location,start_date:t.start_date,end_date:t.end_date,content:chosenContent,memories:chosenMemories.map(m=>({id:m.id,kind:m.kind,title:m.title,content:m.content,caption:m.caption,alt_text:m.alt_text,credit:m.credit,event_date:m.event_date,object_key:m.object_key,media_type:m.media_type}))};
 const json=JSON.stringify(snapshot);if(new TextEncoder().encode(json).length>1500000)fail(422,'TOO_LARGE','Choose fewer items for this publication.');
 const now=new Date().toISOString();const statement=current?env.DB.prepare('UPDATE trip_publications SET draft_json=?,revision=revision+1,updated_at=? WHERE trip_id=? AND revision=?').bind(json,now,t.id,body.revision):env.DB.prepare('INSERT INTO trip_publications(trip_id,draft_json,revision,updated_at) VALUES(?,?,1,?) ON CONFLICT(trip_id) DO NOTHING').bind(t.id,json,now);
 const result=await env.DB.batch([statement,auditStatement(env,'trip_publication',t.id,'draft_saved',{})]);if(!result[0].meta.changes)fail(409,'STALE_EDIT','This story changed. Refresh and try again.');return adminJson({revision:Number(body.revision)+1,snapshot:safeSnapshot(snapshot,'admin',t.id,t.slug)},200,noStore);
}
async function publish(request:Request,env:AdminEnv,t:Row,remove=false){const body=await readAdminJson(request),row=await publication(env,t.id);revision(body,row);if(!row)fail(422,'NO_DRAFT','Prepare and preview the story first.');
 if(!remove){if(t.status!=='completed'||!t.end_date||t.end_date>new Date().toISOString().slice(0,10))fail(422,'NOT_COMPLETED','Publish after the trip end date and mark the trip Completed first.');if(!row.draft_json)fail(422,'NO_DRAFT','Prepare and preview the story first.');const draft=JSON.parse(row.draft_json);const destination=await env.DB.prepare("SELECT id FROM destinations WHERE id=? AND status='published'").bind(draft.destination.id).first();if(!destination)fail(422,'DESTINATION_REQUIRED','Choose a published destination before publishing.');}
 const now=new Date().toISOString(),destinationId=remove?row.destination_id:JSON.parse(row.draft_json).destination.id;
 const result=await env.DB.batch([env.DB.prepare('UPDATE trip_publications SET published_json=?,destination_id=?,published_at=?,revision=revision+1,updated_at=? WHERE trip_id=? AND revision=?').bind(remove?null:row.draft_json,destinationId,remove?null:now,now,t.id,body.revision),auditStatement(env,'trip_publication',t.id,remove?'unpublished':'published',{})]);if(!result[0].meta.changes)fail(409,'STALE_EDIT','The story changed. Refresh and try again.');return adminJson({ok:true,revision:Number(body.revision)+1,url:`/past-trips/story/?trip=${t.slug}`},200,noStore);
}
export async function handleMemoriesAdmin(request:Request,env:AdminEnv,tripId:string,id?:string,action?:string):Promise<Response>{
 await authenticate(request,env,request.method!=='GET');const t=await trip(env,tripId);
 if(id==='publication'){
  if(request.method==='POST'&&action==='draft')return buildDraft(request,env,t);
  if(request.method==='POST'&&action==='publish')return publish(request,env,t);
  if(request.method==='POST'&&action==='unpublish')return publish(request,env,t,true);
  fail(404,'NOT_FOUND','Not found.');
 }
 if(!id&&request.method==='GET'){
  const [memories,destinations,pub]=await Promise.all([env.DB.prepare('SELECT * FROM trip_memories WHERE trip_id=? ORDER BY event_date,created_at,id').bind(tripId).all<Row>(),env.DB.prepare("SELECT id,slug,title FROM destinations WHERE status='published' ORDER BY title").all(),publication(env,tripId)]);
  return adminJson({memories:memories.results.map(m=>mapped(m)),destinations:destinations.results,publication:pub?{revision:pub.revision,published_at:pub.published_at,draft:pub.draft_json?safeSnapshot(JSON.parse(pub.draft_json),'admin',tripId,t.slug):null}:null},200,noStore);
 }
 if(!id&&request.method==='POST'){
  if(request.headers.get('content-type')?.startsWith('multipart/form-data'))return upload(request,env,tripId);
  const body=await readAdminJson(request),newId=crypto.randomUUID(),now=new Date().toISOString();
  const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM trip_memories WHERE trip_id=? AND deleted_at IS NULL').bind(tripId).first<Row>();if(Number(count?.n)>=MAX_ITEMS)fail(422,'LIMIT','This trip already has 300 memories.');
  await env.DB.batch([env.DB.prepare("INSERT INTO trip_memories(id,trip_id,kind,title,content,event_date,credit,portal_visible,created_at,updated_at) VALUES(?1,?2,'note',?3,?4,?5,?6,?7,?8,?8)").bind(newId,tripId,line(body.title,180,true),line(body.content,12000,true),date(body.event_date),line(body.credit,180),body.portal_visible===true?1:0,now),auditStatement(env,'trip_memory',newId,'note_added',{tripId})]);return adminJson({memory:mapped(await item(env,tripId,newId))},201,noStore);
 }
 if(!id)fail(404,'NOT_FOUND','Not found.');const row=await item(env,tripId,id);
 if(request.method==='GET'&&action==='image')return photoResponse(env,row);
 const body=await readAdminJson(request);revision(body,row);if(action==='restore'&&row.deleted_at){const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM trip_memories WHERE trip_id=? AND deleted_at IS NULL').bind(tripId).first<Row>();if(Number(count?.n)>=MAX_ITEMS)fail(422,'LIMIT','This trip already has 300 memories.');}const now=new Date().toISOString();let statement;
 if(request.method==='DELETE'||request.method==='POST'&&action==='restore')statement=env.DB.prepare('UPDATE trip_memories SET deleted_at=?,revision=revision+1,updated_at=? WHERE id=? AND trip_id=? AND revision=?').bind(request.method==='DELETE'?now:null,now,id,tripId,body.revision);
 else if(request.method==='PUT'&&!row.deleted_at)statement=env.DB.prepare('UPDATE trip_memories SET title=?,content=?,caption=?,alt_text=?,credit=?,event_date=?,portal_visible=?,revision=revision+1,updated_at=? WHERE id=? AND trip_id=? AND revision=?').bind(line(body.title,180,true),line(body.content,12000,row.kind==='note'),line(body.caption,1000),line(body.alt_text,300,row.kind==='photo'),line(body.credit,180),date(body.event_date),body.portal_visible===true?1:0,now,id,tripId,body.revision);
 else fail(404,'NOT_FOUND','Not found.');
 const result=await env.DB.batch([statement,auditStatement(env,'trip_memory',id,request.method==='DELETE'?'removed':action==='restore'?'restored':'edited',{tripId})]);if(!result[0].meta.changes)fail(409,'STALE_EDIT','This memory changed. Refresh and try again.');return adminJson({ok:true},200,noStore);
}
export async function portalMemories(env:AdminEnv,tripId:string){const rows=await env.DB.prepare('SELECT * FROM trip_memories WHERE trip_id=? AND portal_visible=1 AND deleted_at IS NULL ORDER BY event_date,created_at,id').bind(tripId).all<Row>();return rows.results.map(m=>mapped(m,'portal'));}
export async function portalPhoto(env:AdminEnv,tripId:string,id:string){const row=await item(env,tripId,id);if(!row.portal_visible||row.deleted_at)fail(404,'NOT_FOUND','Photo not found.');return photoResponse(env,row);}
export async function handleTripStories(request:Request,env:AdminEnv,path:string){
 const match=path.match(/^\/public\/trip-stories(?:\/([a-z0-9-]+)(?:\/photos\/([0-9a-f-]{36}))?)?$/);if(!match||request.method!=='GET')fail(404,'NOT_FOUND','Not found.');
 if(!match[1]){
  const destination=new URL(request.url).searchParams.get('destination');
  const rows=await env.DB.prepare(`SELECT t.id,t.slug,json_extract(p.published_json,'$.title') AS title,json_extract(p.published_json,'$.summary') AS summary,json_extract(p.published_json,'$.destination') AS destination,json_extract(p.published_json,'$.start_date') AS start_date,json_extract(p.published_json,'$.end_date') AS end_date,
   (SELECT value FROM json_each(p.published_json,'$.memories') WHERE json_extract(value,'$.kind')='photo' LIMIT 1) AS cover
   FROM trip_publications p JOIN trips t ON t.id=p.trip_id JOIN destinations d ON d.id=p.destination_id
   WHERE p.published_json IS NOT NULL AND d.status='published' AND (? IS NULL OR d.slug=?) ORDER BY p.published_at DESC`).bind(destination,destination).all<Row>();
  return adminJson({stories:rows.results.map(({id,cover,destination,...row})=>{const photo=cover?JSON.parse(cover):null;return {...row,destination:JSON.parse(destination),cover:photo?{url:imageUrl(photo.id,id,'public',row.slug),alt:photo.alt_text}:null};})},200,noStore);
 }
 const rows=await env.DB.prepare("SELECT p.published_json,p.published_at,t.id,t.slug FROM trip_publications p JOIN trips t ON t.id=p.trip_id JOIN destinations d ON d.id=p.destination_id WHERE p.published_json IS NOT NULL AND d.status='published' AND t.slug=?").bind(match[1]).all<Row>();
 const row=rows.results[0];if(!row)fail(404,'NOT_FOUND','This trip story is not published.');const snapshot=JSON.parse(row.published_json);
 if(match[2]){const photo=snapshot.memories.find((m:Row)=>m.id===match[2]&&m.kind==='photo');if(!photo)fail(404,'NOT_FOUND','Photo not found.');return photoResponse(env,photo);}
 return adminJson({story:safeSnapshot(snapshot,'public',row.id,row.slug),published_at:row.published_at},200,noStore);
}
