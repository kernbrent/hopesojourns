export async function handleWrittenPrayers(request,db,auth,url,h) {
 const {json,body,text,requireValue,rateLimit}=h,path=url.pathname,method=request.method;
 if(!/^\/api\/written-prayers(?:\/|$)/.test(path))return null;
 const full=auth.access_level!=='provisional',admin=auth.role==='admin';
 const readWhere="(w.status='published' OR ?='admin' OR (w.author_id=? AND ?='full'))",readArgs=[auth.role,auth.id,auth.access_level||'full'];
 if(path==='/api/written-prayers'&&method==='GET') {
  const q=(url.searchParams.get('q')||'').trim(),tag=(url.searchParams.get('tag')||'').trim().replace(/^#/,'').toLowerCase(),offset=Number(url.searchParams.get('offset')||0);
  requireValue(q.length<=200&&tag.length<=60&&Number.isSafeInteger(offset)&&offset>=0&&offset<=1000000,'Invalid search.');
  const where=`${readWhere} AND instr(lower(w.title||' '||w.body||' '||w.tags),lower(?))>0 AND (?='' OR EXISTS(SELECT 1 FROM json_each(w.tags) WHERE value=?))`;
  const rows=(await db.prepare(`SELECT w.*,u.name author_name FROM written_prayers w JOIN users u ON u.id=w.author_id WHERE ${where} ORDER BY w.created_at DESC,w.id LIMIT 21 OFFSET ?`).bind(...readArgs,q,tag,tag,offset).all()).results;
  const tags=(await db.prepare(`SELECT DISTINCT j.value tag FROM written_prayers w,json_each(w.tags) j WHERE ${readWhere} ORDER BY tag`).bind(...readArgs).all()).results.map(r=>r.tag);
  return json({items:rows.slice(0,20).map(r=>({...r,tags:JSON.parse(r.tags)})),more:rows.length>20,tags});
 }
 const match=/^\/api\/written-prayers\/([^/]+)(\/history)?$/.exec(path);
 const existing=match&&await db.prepare(`SELECT w.*,u.name author_name FROM written_prayers w JOIN users u ON u.id=w.author_id WHERE w.id=? AND ${readWhere}`).bind(match[1],...readArgs).first();
 if(match)requireValue(existing,'Written prayer unavailable.',404);
 if(match&&method==='GET') {
  if(match[2])return json((await db.prepare('SELECT v.*,u.name editor_name FROM written_prayer_versions v JOIN users u ON u.id=v.editor_id WHERE prayer_id=? ORDER BY revision DESC').bind(existing.id).all()).results.filter(v=>v.status==='published'||admin||full&&existing.author_id===auth.id).map(v=>({...v,tags:JSON.parse(v.tags)})));
  return json({...existing,tags:JSON.parse(existing.tags)});
 }
 if(method!=='POST'||match?.[2]||(!match&&path!=='/api/written-prayers'))return null;
 requireValue(full,'Full membership is required to write prayers.',403);
 requireValue(!existing||existing.author_id===auth.id||admin,'Only the author or an admin can edit this written prayer.',403);
 const data=await body(request),title=text(data.title,180,'Title'),content=text(data.body,12000,'Prayer text');
 requireValue(Array.isArray(data.tags)&&data.tags.length<=20,'Use up to 20 tags.');
 const tags=JSON.stringify([...new Set(data.tags.map(t=>text(t,61,'Tag').replace(/^#/,'').toLowerCase()).map(t=>text(t,60,'Tag')))]);
 requireValue(['published','hidden'].includes(data.status),'Choose Published or Hidden.');
 if(existing)requireValue(Number.isSafeInteger(data.revision)&&data.revision>0,'Invalid revision.');
 const reason=admin&&existing&&existing.author_id!==auth.id?text(data.reason,500,'Moderation reason'):'Written prayer saved';
 await rateLimit(db,`written-prayer:${auth.id}`,60);
 const id=existing?.id||crypto.randomUUID(),op=crypto.randomUUID(),time=Date.now();
 const result=await db.batch([
  db.prepare(`INSERT INTO admin_audit SELECT ?,?,?, 'written-prayer',?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND role=? AND access_level='full' AND status='active') ${existing?'AND EXISTS(SELECT 1 FROM written_prayers WHERE id=? AND revision=?)':''}`).bind(op,auth.id,existing?'edit':'create',id,reason,time,auth.id,auth.role,...(existing?[id,data.revision]:[])),
  existing?db.prepare('UPDATE written_prayers SET title=?,body=?,tags=?,status=?,updated_at=?,revision=revision+1 WHERE id=? AND EXISTS(SELECT 1 FROM admin_audit WHERE id=?)').bind(title,content,tags,data.status,time,id,op):
   db.prepare('INSERT INTO written_prayers SELECT ?,?,?,?,?,?,1,?,? WHERE EXISTS(SELECT 1 FROM admin_audit WHERE id=?)').bind(id,auth.id,title,content,tags,data.status,time,time,op),
  db.prepare('INSERT INTO written_prayer_versions SELECT id,revision,title,body,tags,status,?,? FROM written_prayers WHERE id=? AND EXISTS(SELECT 1 FROM admin_audit WHERE id=?)').bind(auth.id,time,id,op)
 ]);
 requireValue(result[0].meta.changes===1,'This written prayer or your access changed. Refresh before saving.',409);
 return json({id,ok:true},existing?200:201);
}
