export async function handleAdmin(request,db,auth,url,h) {
 const {json,body,text,requireValue,digest,token,username}=h;
 requireValue(auth.role==='admin','Portal admins only.',403);
 const path=url.pathname,method=request.method;
 function page() {
  const [stamp,id='']=(url.searchParams.get('before') || `${Number.MAX_SAFE_INTEGER}`).split(':');
  const time=Number(stamp);requireValue(Number.isSafeInteger(time)&&time>0&&id.length<=80,'Invalid page.');return [time,time,id];
 }
 function paged(rows) {const items=rows.slice(0,50),last=items.at(-1);return {items,more:rows.length>50,cursor:last?`${last.created_at}:${last.id}`:null};}
 async function change(action,type,target,reason,condition,args,writes) {
  const id=crypto.randomUUID(),time=Date.now();
  const guard="EXISTS(SELECT 1 FROM admin_audit WHERE id=?)";
  const audit=db.prepare(`INSERT INTO admin_audit SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND role='admin' AND status='active') AND (${condition})`).bind(id,auth.id,action,type,target,reason,time,auth.id,...args);
  const results=await db.batch([audit,...writes(guard,id)]);
  requireValue(results[0].meta.changes===1,'The account or item changed, or this would remove the last active admin. Refresh and try again.',409);
  return json({ok:true});
 }
 if(path==='/api/admin/users' && method==='GET') {
  const search=(url.searchParams.get('search')||'').slice(0,200);
  const rows=(await db.prepare(`SELECT id,email,name,username,phone,timezone,bio,gender,birth_date,role,status,is_owner,created_at FROM users WHERE instr(lower(name||' '||email||' '||coalesce(username,'')),lower(?))>0 AND (created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT 51`).bind(search,...page()).all()).results;
  const result=paged(rows);
  for(const person of result.items) {
   const limit=await db.prepare('SELECT attempts,expires_at FROM login_limits WHERE key=?').bind(`email:${await digest(person.email)}`).first();
   person.locked_until=limit && limit.attempts>10 && limit.expires_at>Date.now()?limit.expires_at:null;
  }
  return json(result);
 }
 if(path==='/api/admin/posts' && method==='GET') {
  const search=(url.searchParams.get('search')||'').slice(0,200);
  const rows=(await db.prepare(`SELECT p.*,u.name AS author_name,g.name AS group_name FROM posts p JOIN users u ON u.id=p.author_id LEFT JOIN groups g ON g.id=p.group_id
   WHERE instr(lower(p.title||' '||p.body||' '||u.name||' '||coalesce(g.name,'')),lower(?))>0
   AND (p.created_at<? OR (p.created_at=? AND p.id<?)) ORDER BY p.created_at DESC,p.id DESC LIMIT 51`).bind(search,...page()).all()).results;
  return json(paged(rows));
 }
 if(path==='/api/admin/groups' && method==='GET') {
  const search=(url.searchParams.get('search')||'').slice(0,200);
  const rows=(await db.prepare(`SELECT g.*,u.name AS owner_name,(SELECT count(*) FROM group_members m WHERE m.group_id=g.id AND m.status='approved') AS member_count,
   (SELECT count(*) FROM posts p WHERE p.group_id=g.id) AS post_count FROM groups g JOIN users u ON u.id=g.owner_id
   WHERE instr(lower(g.name||' '||g.description||' '||u.name),lower(?))>0 AND (g.created_at<? OR (g.created_at=? AND g.id<?)) ORDER BY g.created_at DESC,g.id DESC LIMIT 51`).bind(search,...page()).all()).results;
  return json(paged(rows));
 }
 if(path==='/api/admin/audit' && method==='GET') return json((await db.prepare(`SELECT a.*,u.name AS actor_name FROM admin_audit a JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC,a.id DESC LIMIT 100`).all()).results);
 const match=/^\/api\/admin\/(users|posts|groups)\/([^/]+)\/(suspend|reactivate|unlock|password-reset|role|username|clear-bio|delete)$/.exec(path);
 if(!match || method!=='POST') return null;
 const [,type,id,action]=match,data=await body(request),reason=text(data.reason,500,'Reason');
 if(type==='users') {
  requireValue(id!==auth.id,'Use another admin to manage your own account; self-removal and self-demotion are blocked.',409);
  const target=await db.prepare('SELECT id,email,name,role,status,is_owner FROM users WHERE id=?').bind(id).first();
  requireValue(target && target.status!=='deleted','Account unavailable.',404);
  requireValue(!target.is_owner || action==='unlock','The primary owner cannot be suspended, deleted, demoted, or password-reset by another admin.',409);
  const exists="EXISTS(SELECT 1 FROM users WHERE id=? AND status<>'deleted')";
  const safe=`${exists} AND (NOT EXISTS(SELECT 1 FROM users WHERE id=? AND role='admin' AND status='active') OR (SELECT count(*) FROM users WHERE role='admin' AND status='active')>1)`;
  const limit=`email:${await digest(target.email)}`;
  if(action==='clear-bio') return change(action,'user',id,reason,exists,[id],(guard,op)=>[
    db.prepare(`UPDATE users SET bio='' WHERE id=? AND ${guard}`).bind(id,op)
  ]);
  if(action==='username') {
   const name=username(data.username,target.email,!!target.is_owner);
   requireValue(!await db.prepare('SELECT id FROM users WHERE id<>? AND (username=? COLLATE NOCASE OR email=? COLLATE NOCASE)').bind(id,name,name).first(),'That username is already in use.');
   return change(action,'user',id,reason,exists,[id],(guard,op)=>[
    db.prepare(`UPDATE users SET username=? WHERE id=? AND ${guard}`).bind(name,id,op),
    db.prepare(`DELETE FROM sessions WHERE user_id=? AND ${guard}`).bind(id,op)
   ]);
  }
  if(action==='unlock') return change(action,'user',id,reason,exists,[id],(guard,op)=>[
   db.prepare(`DELETE FROM login_limits WHERE key=? AND ${guard}`).bind(limit,op)
  ]);
  if(action==='suspend' || action==='reactivate') return change(action,'user',id,reason,safe,[id,id],(guard,op)=>[
   db.prepare(`UPDATE users SET status=? WHERE id=? AND ${guard}`).bind(action==='suspend'?'suspended':'active',id,op),
   db.prepare(`DELETE FROM sessions WHERE user_id=? AND ${guard}`).bind(id,op),
   db.prepare(`DELETE FROM password_resets WHERE user_id=? AND ${guard}`).bind(id,op),
   db.prepare(`DELETE FROM login_limits WHERE key=? AND ${guard}`).bind(limit,op)
  ]);
  if(action==='role') {
   requireValue(['admin','member'].includes(data.role),'Choose admin or member.');
   return change(`role:${data.role}`,'user',id,reason,data.role==='member'?safe:exists,data.role==='member'?[id,id]:[id],(guard,op)=>[
    db.prepare(`UPDATE users SET role=? WHERE id=? AND ${guard}`).bind(data.role,id,op),
    db.prepare(`DELETE FROM sessions WHERE user_id=? AND ${guard}`).bind(id,op)
   ]);
  }
  if(action==='password-reset') {
   requireValue(target.status==='active','Reactivate this account before creating a password reset.',409);
   const raw=token(),hash=await digest(raw);
   await change(action,'user',id,reason,"EXISTS(SELECT 1 FROM users WHERE id=? AND status='active')",[id],(guard,op)=>[
    db.prepare(`DELETE FROM password_resets WHERE user_id=? AND ${guard}`).bind(id,op),
    db.prepare(`INSERT INTO password_resets SELECT ?,?,?,NULL,? WHERE ${guard}`).bind(hash,id,Date.now()+3600000,auth.id,op),
    db.prepare(`DELETE FROM sessions WHERE user_id=? AND ${guard}`).bind(id,op),
    db.prepare(`DELETE FROM login_limits WHERE key=? AND ${guard}`).bind(limit,op)
   ]);
   return json({link:`${url.origin}/#reset=${raw}`,expiresInMinutes:60});
  }
  if(action==='delete') {
   requireValue(data.confirmation==='DELETE','Type DELETE to confirm account deletion.');
   return change(action,'user',id,reason,safe,[id,id],(guard,op)=>[
    db.prepare(`INSERT INTO group_members (group_id,user_id,status,requested_at,decided_at,decided_by)
      SELECT id,?,'approved',?,?,? FROM groups WHERE owner_id=? AND ${guard}
      ON CONFLICT(group_id,user_id) DO UPDATE SET status='approved',decided_at=excluded.decided_at,decided_by=excluded.decided_by`).bind(auth.id,Date.now(),Date.now(),auth.id,id,op),
    db.prepare(`UPDATE groups SET owner_id=? WHERE owner_id=? AND ${guard}`).bind(auth.id,id,op),
    db.prepare(`DELETE FROM posts WHERE author_id=? AND ${guard}`).bind(id,op),
    db.prepare(`DELETE FROM sessions WHERE user_id=? AND ${guard}`).bind(id,op),
    db.prepare(`DELETE FROM password_resets WHERE user_id=? AND ${guard}`).bind(id,op),
    db.prepare(`DELETE FROM invites WHERE email=? AND ${guard}`).bind(target.email,op),
    db.prepare(`DELETE FROM notifications WHERE user_id=? AND ${guard}`).bind(id,op),
    db.prepare(`DELETE FROM follows WHERE (follower_id=? OR followed_id=?) AND ${guard}`).bind(id,id,op),
    db.prepare(`DELETE FROM recipients WHERE user_id=? AND ${guard}`).bind(id,op),
    db.prepare(`DELETE FROM group_members WHERE user_id=? AND ${guard}`).bind(id,op),
    db.prepare(`DELETE FROM login_limits WHERE key=? AND ${guard}`).bind(limit,op),
    db.prepare(`UPDATE users SET name='Deleted member',email=?,username=NULL,phone='',timezone='',bio='',gender='',birth_date='',password='deleted',role='member',status='deleted' WHERE id=? AND ${guard}`).bind(`deleted+${id}@prayer.invalid`,id,op)
   ]);
  }
 }
 if(action==='delete' && ['posts','groups'].includes(type)) {
  requireValue(data.confirmation==='DELETE','Type DELETE to confirm removal.');
  const table=type==='posts'?'posts':'groups';
  return change('delete',type==='posts'?'post':'group',id,reason,`EXISTS(SELECT 1 FROM ${table} WHERE id=?)`,[id],(guard,op)=>type==='posts'?[
   db.prepare(`DELETE FROM posts WHERE id=? AND ${guard}`).bind(id,op)
  ]:[
   db.prepare(`DELETE FROM posts WHERE group_id=? AND ${guard}`).bind(id,op),
   db.prepare(`DELETE FROM group_members WHERE group_id=? AND ${guard}`).bind(id,op),
   db.prepare(`DELETE FROM groups WHERE id=? AND ${guard}`).bind(id,op)
  ]);
 }
 return null;
}
