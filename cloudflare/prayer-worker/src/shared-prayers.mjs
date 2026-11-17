export async function decorateSharedPosts(db,posts,auth) {
 for(const post of posts) {
  const id=post.post_id||post.id;
  const row=await db.prepare(`SELECT (SELECT count(*) FROM prayer_comments WHERE post_id=p.id) comment_count,EXISTS(SELECT 1 FROM group_members WHERE group_id=p.group_id AND user_id=? AND status='approved') approved FROM posts p WHERE p.id=?`).bind(auth.id,id).first();
  post.comment_count=auth.access_level==='provisional'?0:row?.comment_count||0;
  post.can_edit=auth.access_level!=='provisional'&&(auth.role==='admin'||post.author_id===auth.id||!post.author_only&&!!row?.approved);
 }
}
// Group editing and conversations always inherit the parent prayer's audience.
export async function handleSharedPrayers(request,db,auth,url,h) {
 const {json,body,text,requireValue,rateLimit,visibility,visibleArgs}=h;
 const match=/^\/api\/posts\/([^/]+)\/(edit|history|comments)(?:\/([^/]+)(?:\/(heart))?)?$/.exec(url.pathname);
 if(!match)return null;
 const [,id,feature,commentId,heart]=match,method=request.method;
 const visible=()=>db.prepare(`SELECT p.* FROM posts p WHERE p.id=? AND ${visibility}`).bind(id,...visibleArgs(auth)).first();
 const post=await visible();requireValue(post,'Prayer unavailable.',404);
 const full=auth.access_level!=='provisional';
 const approved=post.group_id&&await db.prepare("SELECT 1 FROM group_members WHERE group_id=? AND user_id=? AND status='approved'").bind(post.group_id,auth.id).first();
 const owner=post.author_id===auth.id||auth.role==='admin';
 const canEdit=full&&(owner||(!post.author_only&&approved));
 const live="EXISTS(SELECT 1 FROM users WHERE id=? AND role=? AND status='active' AND access_level='full')";
 if(feature==='history'&&!commentId&&method==='GET') {
  requireValue(full,'Full access is required.',403);
  return json((await db.prepare('SELECT r.*,u.name editor_name FROM post_revisions r JOIN users u ON u.id=r.editor_id WHERE post_id=? ORDER BY revision DESC').bind(id).all()).results);
 }
 if(feature==='edit'&&!commentId&&method==='POST') {
  requireValue(canEdit,'Only the author, portal admins, or eligible group members may edit this prayer.',403);
  const data=await body(request);requireValue(Number.isSafeInteger(data.revision)&&data.revision>0,'Invalid revision.');
  requireValue(owner||data.author_only===undefined,'Only the original author or a portal admin can change editing permissions.',403);
  requireValue(data.author_only===undefined||typeof data.author_only==='boolean','Choose editing permissions.');
  const title=text(data.title,140,'Title'),content=text(data.body,6000,'Prayer text');
  requireValue(['request','update','answered'].includes(data.kind),'Choose a post type.');
  await rateLimit(db,`prayer-edit:${auth.id}`,60);
  const op=crypto.randomUUID(),time=Date.now(),lock=data.author_only===undefined?post.author_only:+data.author_only;
  const editable=`(p.author_id=? OR ?='admin' OR (p.author_only=0 AND EXISTS(SELECT 1 FROM group_members gm WHERE gm.group_id=p.group_id AND gm.user_id=? AND gm.status='approved')))`;
  const where=`p.id=? AND p.revision=? AND ${visibility} AND ${editable} AND ${live}`;
  const guard='EXISTS(SELECT 1 FROM admin_audit WHERE id=?)';
  const result=await db.batch([
   db.prepare(`INSERT INTO admin_audit SELECT ?,?,'edit','post',?,'Prayer content updated',? WHERE EXISTS(SELECT 1 FROM posts p WHERE ${where})`).bind(op,auth.id,id,time,id,data.revision,...visibleArgs(auth),auth.id,auth.role,auth.id,auth.id,auth.role),
   db.prepare(`INSERT OR IGNORE INTO post_revisions SELECT id,revision,title,body,kind,author_only,coalesce(updated_by,author_id),coalesce(updated_at,created_at) FROM posts WHERE id=? AND ${guard}`).bind(id,op),
   db.prepare(`UPDATE posts SET title=?,body=?,kind=?,author_only=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND ${guard}`).bind(title,content,data.kind,lock,time,auth.id,id,op),
   db.prepare(`INSERT INTO post_revisions SELECT id,revision,title,body,kind,author_only,updated_by,updated_at FROM posts WHERE id=? AND ${guard}`).bind(id,op)
  ]);
  requireValue(result[0].meta.changes===1,'This prayer or your access changed. Refresh before saving.',409);
  return json({ok:true});
 }
 if(feature!=='comments')return null;
 requireValue(full,'Full access is required for comments.',403);
 if(!commentId&&method==='GET') {
  const before=url.searchParams.get('before')||'',rows=(await db.prepare(`SELECT c.*,u.name author_name,(SELECT count(*) FROM comment_hearts ch WHERE ch.comment_id=c.id) heart_count,EXISTS(SELECT 1 FROM comment_hearts ch WHERE ch.comment_id=c.id AND ch.user_id=?) hearted FROM prayer_comments c JOIN users u ON u.id=c.author_id WHERE c.post_id=? AND (?='' OR c.id<?) ORDER BY c.id DESC LIMIT 51`).bind(auth.id,id,before,before).all()).results;
  return json({items:rows.slice(0,50),more:rows.length>50,cursor:rows.slice(0,50).at(-1)?.id||null});
 }
 const access=`EXISTS(SELECT 1 FROM posts p WHERE p.id=? AND ${visibility}) AND ${live}`;
 const args=[id,...visibleArgs(auth),auth.id,auth.role];
 if(!commentId&&method==='POST') {
  const data=await body(request),content=text(data.body,2000,'Comment');await rateLimit(db,`comment:${auth.id}`,60);
  // Time-prefixed UUID gives stable, deterministic newest-first paging.
  const cid=String(Date.now()).padStart(15,'0')+'-'+crypto.randomUUID();
  const result=await db.prepare(`INSERT INTO prayer_comments SELECT ?,?,?,?,? WHERE ${access}`).bind(cid,id,auth.id,content,Date.now(),...args).run();
  requireValue(result.meta.changes===1,'Prayer unavailable.',404);return json({id:cid},201);
 }
 const comment=commentId&&await db.prepare('SELECT * FROM prayer_comments WHERE id=? AND post_id=?').bind(commentId,id).first();
 requireValue(comment,'Comment unavailable.',404);
 if(heart&&method==='POST') {
  const data=await body(request);requireValue(typeof data.active==='boolean','Choose a reaction.');await rateLimit(db,`comment-heart:${auth.id}`,120);
  const guard=`${access} AND EXISTS(SELECT 1 FROM prayer_comments WHERE id=? AND post_id=?)`;
  if(data.active)await db.prepare(`INSERT OR IGNORE INTO comment_hearts SELECT ?,?,? WHERE ${guard}`).bind(commentId,auth.id,Date.now(),...args,commentId,id).run();
  else await db.prepare(`DELETE FROM comment_hearts WHERE comment_id=? AND user_id=? AND ${guard}`).bind(commentId,auth.id,...args,commentId,id).run();
  requireValue(await visible(),'Prayer unavailable.',404);
  const total=await db.prepare('SELECT count(*) count,coalesce(max(user_id=?),0) active FROM comment_hearts WHERE comment_id=?').bind(auth.id,commentId).first();return json(total);
 }
 if(!heart&&method==='DELETE') {
  requireValue(comment.author_id===auth.id||auth.role==='admin','Only the comment author or a portal admin can remove it.',403);
  const data=await body(request),reason=auth.role==='admin'&&comment.author_id!==auth.id?text(data.reason,500,'Moderation reason'):'Comment removed by author';
  const op=crypto.randomUUID(),guard='EXISTS(SELECT 1 FROM admin_audit WHERE id=?)';
  const results=await db.batch([
   db.prepare(`INSERT INTO admin_audit SELECT ?,?,'delete','comment',?,?,? WHERE ${access}`).bind(op,auth.id,commentId,reason,Date.now(),...args),
   db.prepare(`DELETE FROM prayer_comments WHERE id=? AND post_id=? AND ${guard}`).bind(commentId,id,op)
  ]);requireValue(results[0].meta.changes===1,'Your access changed.',409);return json({ok:true});
 }
 return null;
}
