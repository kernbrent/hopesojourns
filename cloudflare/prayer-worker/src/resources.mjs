// The library belongs to this installation. Authentication/CSRF precede this handler.
export async function handleResources(request,db,auth,url,h) {
 const {json,body,text,requireValue}=h,path=url.pathname,method=request.method;
 const admin=path.startsWith('/api/admin/');
 if(admin) requireValue(auth.role==='admin','Portal admins only.',403);
 const root=admin?'/api/admin/resources':'/api/resources';
 const categoryRoot=admin?'/api/admin/resource-categories':'/api/resource-categories';
 const integer=(value,label,min=-1000000,max=1000000)=>{requireValue(Number.isSafeInteger(value)&&value>=min&&value<=max,`Invalid ${label}.`);return value;};
 const optional=(value,max,label)=>value===''?'':text(value,max,label);
 const normalizeTag=value=>{
  const tag=text(value,60,'Tag').normalize('NFKC').toLowerCase().replace(/^#+/,'').replace(/\s+/g,'-');
  requireValue(/^[\p{L}\p{N}][\p{L}\p{N}_-]{0,39}$/u.test(tag),'Tags use 1–40 letters, numbers, dashes, or underscores.');return tag;
 };
 async function change(action,type,id,data,condition,args,writes) {
  const reason=text(data.reason,500,'Reason'),auditId=crypto.randomUUID();
  const audit=db.prepare(`INSERT INTO admin_audit SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND role='admin' AND status='active') AND (${condition})`)
   .bind(auditId,auth.id,action,type,id,reason,Date.now(),auth.id,...args);
  const results=await db.batch([audit,...writes('EXISTS(SELECT 1 FROM admin_audit WHERE id=?)',auditId)]);
  requireValue(results[0].meta.changes===1,'This item changed or is no longer available. Refresh and try again.',409);
  return json({ok:true,id},action==='create'?201:200);
 }
 if(path===categoryRoot && method==='GET') return json((await db.prepare('SELECT * FROM resource_categories ORDER BY sort_order,name,id').all()).results);
 if(path===root && method==='GET') {
  const q=(url.searchParams.get('q')||'').trim(),category=url.searchParams.get('category')||'',rawTag=url.searchParams.get('tag')||'';
  requireValue(q.length<=200 && category.length<=80,'Search is too long.');
  const tag=rawTag?normalizeTag(rawTag):'',featured=url.searchParams.get('featured')||'',visibility=url.searchParams.get('visibility')||'visible';
  requireValue(['','1','0'].includes(featured),'Invalid featured filter.');
  requireValue(['visible','hidden','all'].includes(visibility),'Invalid visibility filter.');
  // Ordinary members cannot request hidden rows, counts, or hidden tag suggestions.
  requireValue(admin || visibility==='visible','Portal admins only.',403);
  const sorts={curated:'r.featured DESC,r.sort_order,r.title COLLATE NOCASE,r.id',title:'r.title COLLATE NOCASE,r.id',newest:'r.created_at DESC,r.id'};
  const sort=url.searchParams.get('sort')||'curated';requireValue(Object.hasOwn(sorts,sort),'Invalid resource sort.');
  const offset=integer(Number(url.searchParams.get('offset')||0),'page',0,1000000);
  const where=`(?='all' OR r.visible=?) AND (?='' OR r.category_id=?) AND (?='' OR r.featured=?)
   AND (?='' OR EXISTS(SELECT 1 FROM resource_tags t WHERE t.resource_id=r.id AND t.tag=?))
   AND (?='' OR instr(lower(r.title||' '||r.creator||' '||r.description||' '||c.name),lower(?))>0
    OR EXISTS(SELECT 1 FROM resource_tags t WHERE t.resource_id=r.id AND instr(t.tag,lower(?))>0))`;
  const args=[visibility,visibility==='hidden'?0:1,category,category,featured,Number(featured),tag,tag,q,q,q.replace(/^#+/,'')];
  const total=(await db.prepare(`SELECT count(*) AS n FROM resources r JOIN resource_categories c ON c.id=r.category_id WHERE ${where}`).bind(...args).first()).n;
  const rows=(await db.prepare(`SELECT r.*,c.name AS category_name FROM resources r JOIN resource_categories c ON c.id=r.category_id WHERE ${where} ORDER BY ${sorts[sort]} LIMIT 50 OFFSET ?`).bind(...args,offset).all()).results;
  for(const row of rows) row.tags=(await db.prepare('SELECT tag FROM resource_tags WHERE resource_id=? ORDER BY tag').bind(row.id).all()).results.map(t=>t.tag);
  const tags=(await db.prepare(`SELECT DISTINCT t.tag FROM resource_tags t JOIN resources r ON r.id=t.resource_id WHERE ?=1 OR r.visible=1 ORDER BY t.tag`).bind(+admin).all()).results.map(t=>t.tag);
  return json({items:rows,total,tags,more:offset+rows.length<total,nextOffset:offset+rows.length});
 }
 if(!admin || method!=='POST') return null;
 if(path===categoryRoot || path.startsWith(`${categoryRoot}/`)) {
  const suffix=path.slice(categoryRoot.length+1).split('/'),id=path===categoryRoot?crypto.randomUUID():suffix[0],deleting=suffix[1]==='delete';
  requireValue(id && suffix.length<=2 && (!suffix[1]||deleting),'Unknown category action.',404);
  const data=await body(request),creating=path===categoryRoot;
  if(deleting) {
   requireValue(data.confirmation==='DELETE','Type DELETE to confirm.');
   return change('delete','resource-category',id,data,'EXISTS(SELECT 1 FROM resource_categories WHERE id=? AND revision=?) AND NOT EXISTS(SELECT 1 FROM resources WHERE category_id=?)',[id,integer(data.revision,'revision',1),id],(guard,audit)=>[
    db.prepare(`DELETE FROM resource_categories WHERE id=? AND ${guard}`).bind(id,audit)
   ]);
  }
  const name=text(data.name,60,'Category name'),order=integer(data.sort_order,'category order');
  requireValue(!await db.prepare('SELECT id FROM resource_categories WHERE name=? COLLATE NOCASE AND id<>?').bind(name,id).first(),'That category name already exists.',409);
  return change(creating?'create':'edit','resource-category',id,data,creating?'1=1':'EXISTS(SELECT 1 FROM resource_categories WHERE id=? AND revision=?)',creating?[]:[id,integer(data.revision,'revision',1)],(guard,audit)=>[
   creating?db.prepare(`INSERT INTO resource_categories (id,name,sort_order) SELECT ?,?,? WHERE ${guard}`).bind(id,name,order,audit):db.prepare(`UPDATE resource_categories SET name=?,sort_order=?,revision=revision+1 WHERE id=? AND ${guard}`).bind(name,order,id,audit)
  ]);
 }
 if(path===root || path.startsWith(`${root}/`)) {
  const suffix=path.slice(root.length+1).split('/'),creating=path===root,id=creating?crypto.randomUUID():suffix[0],deleting=suffix[1]==='delete';
  requireValue(id && suffix.length<=2 && (!suffix[1]||deleting),'Unknown resource action.',404);
  const data=await body(request);
  const condition=creating?'1=1':'EXISTS(SELECT 1 FROM resources WHERE id=? AND revision=?)',args=creating?[]:[id,integer(data.revision,'revision',1)];
  if(deleting) {
   requireValue(data.confirmation==='DELETE','Type DELETE to confirm.');
   return change('delete','resource',id,data,condition,args,(guard,audit)=>[
    db.prepare(`DELETE FROM resource_tags WHERE resource_id=? AND ${guard}`).bind(id,audit),db.prepare(`DELETE FROM resources WHERE id=? AND ${guard}`).bind(id,audit)
   ]);
  }
  const title=text(data.title,180,'Title'),creator=optional(data.creator,120,'Author or creator'),description=optional(data.description,4000,'Description'),category=text(data.category_id,80,'Category');
  let link=optional(data.url,2000,'Resource URL');
  if(link) {let parsed;try {parsed=new URL(link);} catch {} requireValue(parsed && parsed.protocol==='https:' && !parsed.username && !parsed.password,'Use a complete HTTPS link without sign-in credentials.');link=parsed.href;}
  requireValue(typeof data.visible==='boolean' && typeof data.featured==='boolean','Choose visibility and featured status.');
  requireValue(Array.isArray(data.tags)&&data.tags.length<=20,'Use up to 20 tags.');
  const tags=[...new Set(data.tags.map(normalizeTag))],order=integer(data.sort_order,'resource order'),time=Date.now();
  // Category existence is rechecked inside the same atomic authorization guard.
  return change(creating?'create':'edit','resource',id,data,`(${condition}) AND EXISTS(SELECT 1 FROM resource_categories WHERE id=?)`,[...args,category],(guard,audit)=>[
   creating?db.prepare(`INSERT INTO resources (id,category_id,title,creator,description,url,visible,featured,sort_order,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}`).bind(id,category,title,creator,description,link,+data.visible,+data.featured,order,time,time,audit):db.prepare(`UPDATE resources SET category_id=?,title=?,creator=?,description=?,url=?,visible=?,featured=?,sort_order=?,updated_at=?,revision=revision+1 WHERE id=? AND ${guard}`).bind(category,title,creator,description,link,+data.visible,+data.featured,order,time,id,audit),
   db.prepare(`DELETE FROM resource_tags WHERE resource_id=? AND ${guard}`).bind(id,audit),
   ...tags.map(tag=>db.prepare(`INSERT INTO resource_tags SELECT ?,? WHERE ${guard}`).bind(id,tag,audit))
  ]);
 }
 return null;
}
