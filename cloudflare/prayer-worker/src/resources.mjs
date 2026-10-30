import {resourceAccess} from './resource-access.mjs';
// The library belongs to this installation. Authentication/CSRF precede this handler.
export async function handleResources(request,db,auth,url,h) {
 const {json,body,text,requireValue,rateLimit,assets}=h,path=url.pathname,method=request.method;
 const admin=path.startsWith('/api/admin/');
 if(admin) requireValue(auth.role==='admin','Portal admins only.',403);
 const recommending=path==='/api/resources/recommend' && method==='POST';
 const access=resourceAccess(auth);
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
 function imageValue(data) {
  if(data.image===undefined) return undefined;
  if(data.image===null) return null;
  const image=data.image;
  requireValue(image && ['image/jpeg','image/png','image/webp'].includes(image.mime) && typeof image.data==='string' && image.data.length<=349528 && /^[A-Za-z0-9+/]+={0,2}$/.test(image.data),'Use a JPEG, PNG, or WebP image up to 256 KB.');
  let bytes;try {bytes=Uint8Array.from(atob(image.data),c=>c.charCodeAt(0));} catch {requireValue(false,'Invalid image data.');}
  requireValue(bytes.length>12 && bytes.length<=262144,'Use an image up to 256 KB.');
  const starts=(values,offset=0)=>values.every((v,i)=>bytes[offset+i]===v);
  requireValue(image.mime==='image/jpeg'?starts([255,216,255]):image.mime==='image/png'?starts([137,80,78,71,13,10,26,10]):starts([82,73,70,70])&&starts([87,69,66,80],8),'The image file does not match its type.');
  return image;
 }
 function imageWrites(id,image,guard,key) {
  if(image===undefined) return [];
  return [db.prepare(`DELETE FROM resource_images WHERE resource_id=? AND ${guard}`).bind(id,key),
   db.prepare(`UPDATE resources SET image_key='' WHERE id=? AND ${guard}`).bind(id,key),
   ...(image?[db.prepare(`INSERT INTO resource_images SELECT ?,?,? WHERE ${guard}`).bind(id,image.mime,image.data,key)]:[])];
 }
 const imageMatch=/^\/api\/resources\/([^/]+)\/image$/.exec(path);
 if(imageMatch && method==='GET') {
  const row=await db.prepare(`SELECT r.id,r.image_key,i.mime,i.data FROM resources r LEFT JOIN resource_images i ON i.resource_id=r.id WHERE r.id=? AND (${access.sql})`).bind(imageMatch[1],...access.args).first();
  requireValue(row && (row.data||row.image_key),'Image unavailable.',404);
  if(row.data) return new Response(Uint8Array.from(atob(row.data),c=>c.charCodeAt(0)),{headers:{'Content-Type':row.mime}});
  requireValue(['/assets/resource-covers/wild-at-heart.jpg','/assets/resource-covers/not-even-a-hint.jpg'].includes(row.image_key),'Image unavailable.',404);
  return assets.fetch(new Request(new URL(row.image_key,url.origin)));
 }
 if(path==='/api/admin/resource-review-count' && method==='GET') return json(await db.prepare("SELECT count(*) AS pending FROM resources WHERE review_status='pending'").first());
 const reviewMatch=/^\/api\/admin\/resources\/([^/]+)\/(approve|decline)$/.exec(path);
 if(reviewMatch && method==='POST') {
  const [,id,decision]=reviewMatch,data=await body(request),revision=integer(data.revision,'revision',1);
  return change(decision,'resource',id,data,"EXISTS(SELECT 1 FROM resources WHERE id=? AND revision=? AND review_status='pending')",[id,revision],(guard,audit)=>[
   db.prepare(`UPDATE resources SET review_status=?,visible=?,reviewed_by=?,reviewed_at=?,updated_at=?,revision=revision+1 WHERE id=? AND ${guard}`).bind(decision==='approve'?'approved':'declined',decision==='approve'?1:0,auth.id,Date.now(),Date.now(),id,audit)
  ]);
 }
 if(path===categoryRoot && method==='GET') return json((await db.prepare('SELECT * FROM resource_categories ORDER BY sort_order,name,id').all()).results);
 if(path===root && method==='GET') {
  const q=(url.searchParams.get('q')||'').trim(),category=url.searchParams.get('category')||'',rawTag=url.searchParams.get('tag')||'';
  requireValue(q.length<=200 && category.length<=80,'Search is too long.');
  const review=url.searchParams.get('review_status')||(admin?'all':'approved');
  requireValue(['all','approved','pending','declined'].includes(review),'Invalid review filter.');
  requireValue(admin || review==='approved','Portal admins only.',403);
  const tag=rawTag?normalizeTag(rawTag):'',featured=url.searchParams.get('featured')||'',visibility=url.searchParams.get('visibility')||'visible';
  requireValue(['','1','0'].includes(featured),'Invalid featured filter.');
  requireValue(['visible','hidden','all'].includes(visibility),'Invalid visibility filter.');
  // Ordinary members cannot request hidden rows, counts, or hidden tag suggestions.
  requireValue(admin || visibility==='visible','Portal admins only.',403);
  const sorts={curated:'r.featured DESC,r.sort_order,r.title COLLATE NOCASE,r.id',title:'r.title COLLATE NOCASE,r.id',newest:'r.created_at DESC,r.id'};
  const sort=url.searchParams.get('sort')||'curated';requireValue(Object.hasOwn(sorts,sort),'Invalid resource sort.');
  const offset=integer(Number(url.searchParams.get('offset')||0),'page',0,1000000);
  const where=`(${access.sql}) AND (?='all' OR r.review_status=?) AND (?='all' OR r.visible=?) AND (?='' OR r.category_id=?) AND (?='' OR r.featured=?)
   AND (?='' OR EXISTS(SELECT 1 FROM resource_tags t WHERE t.resource_id=r.id AND t.tag=?))
   AND (?='' OR instr(lower(r.title||' '||r.creator||' '||r.description||' '||c.name),lower(?))>0
    OR EXISTS(SELECT 1 FROM resource_tags t WHERE t.resource_id=r.id AND instr(t.tag,lower(?))>0))`;
  const args=[...access.args,review,review,visibility,visibility==='hidden'?0:1,category,category,featured,Number(featured),tag,tag,q,q,q.replace(/^#+/,'')];
  const total=(await db.prepare(`SELECT count(*) AS n FROM resources r JOIN resource_categories c ON c.id=r.category_id WHERE ${where}`).bind(...args).first()).n;
  const rows=(await db.prepare(`SELECT r.*,c.name AS category_name,CASE WHEN r.image_key<>'' OR EXISTS(SELECT 1 FROM resource_images i WHERE i.resource_id=r.id) THEN 1 ELSE 0 END AS has_image FROM resources r JOIN resource_categories c ON c.id=r.category_id WHERE ${where} ORDER BY ${sorts[sort]} LIMIT 50 OFFSET ?`).bind(...args,offset).all()).results;
  for(const row of rows) {
   if(!admin) for(const key of ['submitted_by','submitted_at','reviewed_by','reviewed_at','image_key']) delete row[key];
   else if(row.submitted_by) row.submitted_name=(await db.prepare('SELECT name FROM users WHERE id=?').bind(row.submitted_by).first())?.name||'Former member';
   row.tags=(await db.prepare('SELECT tag FROM resource_tags WHERE resource_id=? ORDER BY tag').bind(row.id).all()).results.map(t=>t.tag);
  }
  const tags=(await db.prepare(`SELECT DISTINCT t.tag FROM resource_tags t JOIN resources r ON r.id=t.resource_id WHERE ${access.sql} ORDER BY t.tag`).bind(...access.args).all()).results.map(t=>t.tag);
  return json({items:rows,total,tags,more:offset+rows.length<total,nextOffset:offset+rows.length});
 }
 if((!admin && !recommending) || method!=='POST') return null;
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
 if(recommending || path===root || path.startsWith(`${root}/`)) {
  const suffix=path.slice(root.length+1).split('/'),creating=recommending || path===root,id=creating?crypto.randomUUID():suffix[0],deleting=suffix[1]==='delete';
  requireValue(id && suffix.length<=2 && (!suffix[1]||deleting),'Unknown resource action.',404);
  const data=await body(request);
  if(recommending) {requireValue(auth.role!=='admin','Use Add resource as an admin.');await rateLimit(db,`resource-recommend:${auth.id}`,10);}
  const condition=creating?'1=1':'EXISTS(SELECT 1 FROM resources WHERE id=? AND revision=?)',args=creating?[]:[id,integer(data.revision,'revision',1)];
  if(deleting) {
   requireValue(data.confirmation==='DELETE','Type DELETE to confirm.');
   return change('delete','resource',id,data,condition,args,(guard,audit)=>[
    db.prepare(`DELETE FROM resource_tags WHERE resource_id=? AND ${guard}`).bind(id,audit),db.prepare(`DELETE FROM resource_images WHERE resource_id=? AND ${guard}`).bind(id,audit),db.prepare(`DELETE FROM resources WHERE id=? AND ${guard}`).bind(id,audit)
   ]);
  }
  const title=text(data.title,180,'Title'),creator=optional(data.creator,120,'Author or creator'),description=optional(data.description,4000,'Description'),category=text(data.category_id,80,'Category');
  let link=optional(data.url,2000,'Resource URL');
  if(link) {let parsed;try {parsed=new URL(link);} catch {} requireValue(parsed && parsed.protocol==='https:' && !parsed.username && !parsed.password,'Use a complete HTTPS link without sign-in credentials.');link=parsed.href;}
  if(recommending) {data.visible=false;data.featured=false;data.sort_order=0;}
  requireValue(typeof data.visible==='boolean' && typeof data.featured==='boolean','Choose visibility and featured status.');
  requireValue(Array.isArray(data.tags)&&data.tags.length<=20,'Use up to 20 tags.');
  const tags=[...new Set(data.tags.map(normalizeTag))],order=integer(data.sort_order,'resource order'),time=Date.now();
  const existing=creating?null:await db.prepare('SELECT genders,min_age,max_age,review_status FROM resources WHERE id=?').bind(id).first();
  const image=imageValue(data),genders=data.genders??(existing?.genders?existing.genders.split(','):[]);
  requireValue(Array.isArray(genders)&&genders.length<=3&&genders.every(value=>['male','female','another'].includes(value)),'Choose valid resource gender audiences.');
  const audience=[...new Set(genders)].sort().join(','),minAge=data.min_age===undefined?(existing?.min_age??null):data.min_age,maxAge=data.max_age===undefined?(existing?.max_age??null):data.max_age;
  if(minAge!==null) integer(minAge,'minimum age',0,120);if(maxAge!==null) integer(maxAge,'maximum age',0,120);
  requireValue(minAge===null||maxAge===null||minAge<=maxAge,'Minimum age cannot exceed maximum age.');
  if(recommending) {
   const result=await db.batch([
    db.prepare(`INSERT INTO resources (id,category_id,title,creator,description,url,visible,featured,sort_order,created_at,updated_at,review_status,submitted_by,submitted_at,genders,min_age,max_age)
     SELECT ?,?,?,?,?,?,0,0,0,?,?,'pending',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND status='active' AND role='member') AND EXISTS(SELECT 1 FROM resource_categories WHERE id=?) AND (SELECT count(*) FROM resources WHERE submitted_by=? AND review_status='pending')<20`).bind(id,category,title,creator,description,link,time,time,auth.id,time,audience,minAge,maxAge,auth.id,category,auth.id),
    ...tags.map(tag=>db.prepare('INSERT INTO resource_tags SELECT ?,? WHERE EXISTS(SELECT 1 FROM resources WHERE id=?)').bind(id,tag,id)),
    ...imageWrites(id,image,'EXISTS(SELECT 1 FROM resources WHERE id=?)',id)
   ]);
   requireValue(result[0].meta.changes===1,'The category changed or you have 20 pending recommendations. Refresh before trying again.',409);
   return json({ok:true},201);
  }
  if(!creating && data.visible) requireValue(existing?.review_status==='approved','Approve this recommendation before making it visible.',409);
  // Category existence is rechecked inside the same atomic authorization guard.
  return change(creating?'create':'edit','resource',id,data,`(${condition}) AND EXISTS(SELECT 1 FROM resource_categories WHERE id=?)`,[...args,category],(guard,audit)=>[
   creating?db.prepare(`INSERT INTO resources (id,category_id,title,creator,description,url,visible,featured,sort_order,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}`).bind(id,category,title,creator,description,link,+data.visible,+data.featured,order,time,time,audit):db.prepare(`UPDATE resources SET category_id=?,title=?,creator=?,description=?,url=?,visible=?,featured=?,sort_order=?,updated_at=?,revision=revision+1 WHERE id=? AND ${guard}`).bind(category,title,creator,description,link,+data.visible,+data.featured,order,time,id,audit),
   db.prepare(`UPDATE resources SET genders=?,min_age=?,max_age=? WHERE id=? AND ${guard}`).bind(audience,minAge,maxAge,id,audit),
   ...imageWrites(id,image,guard,audit),
   db.prepare(`DELETE FROM resource_tags WHERE resource_id=? AND ${guard}`).bind(id,audit),
   ...tags.map(tag=>db.prepare(`INSERT INTO resource_tags SELECT ?,? WHERE ${guard}`).bind(id,tag,audit))
  ]);
 }
 return null;
}
