import { AdminError, adminJson, authenticate, auditStatement, readAdminJson, type AdminEnv } from "./admin";

type Master = {id:string; title:string; content:string; link_url:string|null; updated_at:string; deleted_at:string|null};
function field(value:unknown, label:string, max:number):string {
 if(typeof value!=="string" || !value.trim() || value.trim().length>max) throw new AdminError(422,"INVALID_FIELD",`${label} is required and must be no longer than ${max} characters.`);
 return value.trim();
}
function optional(value:unknown,label:string,max:number):string { return value===undefined || value===null || value==="" ? "" : field(value,label,max); }
export function devotionalLink(value:unknown):string|null {
 if(value===undefined || value===null || value==='') return null;
 const link=field(value,'Link',2000);
 try { if(new URL(link).protocol==='https:') return link; } catch { /* Validation below. */ }
 throw new AdminError(422,'INVALID_FIELD','Use a secure https:// link.');
}
export function masterStatement(env:AdminEnv,id:string,title:string,content:string,link:string|null,now:string,scripture = content.match(/^Scripture:[ \t]*(.+)$/im)?.[1] ?? "",topics = "") {
 return env.DB.prepare('INSERT INTO devotional_library(id,title,content,link_url,created_at,updated_at,scripture,topics) VALUES(?1,?2,?3,?4,?5,?5,?6,?7)').bind(id,title,content,link,now,scripture,topics);
}
export async function requireDevotional(env:AdminEnv,id:unknown):Promise<Master> {
 if(typeof id!=='string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new AdminError(422,'INVALID_FIELD','Choose a devotional from the library.');
 const item=await env.DB.prepare('SELECT * FROM devotional_library WHERE id=?1 AND deleted_at IS NULL').bind(id).first<Master>();
 if(!item) throw new AdminError(404,'DEVOTIONAL_NOT_FOUND','This devotional is no longer available in the library.');
 return item;
}
export async function handleDevotionalLibrary(request:Request,env:AdminEnv,path:string):Promise<Response> {
 await authenticate(request,env,request.method!=='GET');
 const base='/admin/trip-platform/devotionals';
 if(path===base && request.method==='GET') {
  const deleted=new URL(request.url).searchParams.get('deleted')==='true';
  const result=await env.DB.prepare(`SELECT d.*, (SELECT COUNT(*) FROM devotional_usage u WHERE u.devotional_id=d.id) AS usage_count
   FROM devotional_library d WHERE ${deleted?'d.deleted_at IS NOT NULL':'d.deleted_at IS NULL'} ORDER BY d.title COLLATE NOCASE,d.id`).all();
  return adminJson({items:result.results});
 }
 if(path===base && request.method==='POST') {
  const body=await readAdminJson(request), id=crypto.randomUUID(), now=new Date().toISOString();
  const title=field(body.title,'Title',180),content=field(body.content,'Content',12000),link=devotionalLink(body.linkUrl);
  await env.DB.batch([masterStatement(env,id,title,content,link,now,optional(body.scripture,"Scripture",500),optional(body.topics,"Topics",500)),auditStatement(env,'devotional',id,'created',{title})]);
  return adminJson({id},201);
 }
 const match=path.match(/^\/admin\/trip-platform\/devotionals\/([0-9a-f-]{36})(\/restore)?$/i);
 if(!match) throw new AdminError(404,'NOT_FOUND','Not found.');
 const id=match[1];
 const item=await env.DB.prepare('SELECT * FROM devotional_library WHERE id=?1').bind(id).first<Master>();
 if(!item) throw new AdminError(404,'DEVOTIONAL_NOT_FOUND','That devotional could not be found.');
 if(request.method==='GET' && !match[2]) {
  const uses=await env.DB.prepare(`SELECT u.*,COALESCE(t.title,u.trip_title) AS trip_title,COALESCE(t.code,u.trip_code) AS trip_code,
   t.status AS trip_status FROM devotional_usage u LEFT JOIN trips t ON t.id=u.trip_id WHERE u.devotional_id=?1 ORDER BY u.event_date DESC,u.created_at DESC`).bind(id).all();
  return adminJson({item,uses:uses.results});
 }
 const body=await readAdminJson(request);
 if(body.updatedAt!==item.updated_at) throw new AdminError(409,'DEVOTIONAL_CHANGED','This devotional changed in another window. Reopen it before saving.');
 const now=new Date().toISOString();
 let statement, action;
 if(match[2] && request.method==='POST') {
  statement=env.DB.prepare('UPDATE devotional_library SET deleted_at=NULL,updated_at=?1 WHERE id=?2 AND updated_at=?3').bind(now,id,item.updated_at);action='restored';
 } else if(!match[2] && request.method==='DELETE') {
  statement=env.DB.prepare('UPDATE devotional_library SET deleted_at=?1,updated_at=?1 WHERE id=?2 AND updated_at=?3').bind(now,id,item.updated_at);action='deleted';
 } else if(!match[2] && request.method==='PUT' && !item.deleted_at) {
  statement=env.DB.prepare('UPDATE devotional_library SET title=?1,content=?2,link_url=?3,updated_at=?4,scripture=?7,topics=?8 WHERE id=?5 AND updated_at=?6 AND deleted_at IS NULL')
   .bind(field(body.title,'Title',180),field(body.content,'Content',12000),devotionalLink(body.linkUrl),now,id,item.updated_at,optional(body.scripture,"Scripture",500),optional(body.topics,"Topics",500));action='updated';
 } else throw new AdminError(404,'NOT_FOUND','Not found.');
 const [result]=await env.DB.batch([statement,auditStatement(env,'devotional',id,action,{title:item.title})]);
 if(!result.meta.changes) throw new AdminError(409,'DEVOTIONAL_CHANGED','This devotional changed in another window. Reopen it before saving.');
 return adminJson({id});
}
