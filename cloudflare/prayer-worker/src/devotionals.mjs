// Independent prayer-portal readings. Never reads or writes the MMT library.
export async function handleDevotionals(request,db,auth,url,h) {
 const {json,body,text,requireValue,rateLimit}=h,path=url.pathname,method=request.method;
 const managing=path.startsWith('/api/admin/'),root=managing?'/api/admin/devotionals':'/api/devotionals';
 if(managing) requireValue(auth.role==='admin','Portal admins only.',403);
 let timezone=auth.timezone||'America/Chicago',today;
 try {today=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
 catch {timezone='America/Chicago';today=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
 const visible="(?='admin' OR (d.status='published' AND d.publish_date<=?))";
 const select=`SELECT d.*,r.read_at FROM devotionals d LEFT JOIN devotional_reads r ON r.devotional_id=d.id AND r.user_id=?`;
 if(path==='/api/devotionals/today' && method==='GET') {
  // Even admins see the actual member reading here; future/draft review stays in Manage.
  const item=await db.prepare(`${select} WHERE d.status='published' AND d.publish_date<=? ORDER BY d.publish_date DESC,d.id LIMIT 1`).bind(auth.id,today).first();
  return json({today,timezone,item:item||null});
 }
 if(path===root && method==='GET') {
  const q=(url.searchParams.get('q')||'').trim(),status=url.searchParams.get('status')||'all',read=url.searchParams.get('read')||'all',offset=Number(url.searchParams.get('offset')||0);
  requireValue(q.length<=200 && ['all','draft','published','hidden'].includes(status) && ['all','read','unread'].includes(read) && Number.isSafeInteger(offset)&&offset>=0&&offset<=1000000,'Invalid devotional filters.');
  const where=`${managing?'1=1':"(d.status='published' AND d.publish_date<=?)"} AND (?='all' OR d.status=?) AND (?='all' OR (?='read' AND r.read_at IS NOT NULL) OR (?='unread' AND r.read_at IS NULL)) AND (?='' OR instr(lower(d.title||' '||d.scripture||' '||d.body||' '||d.reflection),lower(?))>0)`;
  const args=[auth.id,...(managing?[]:[today]),status,status,read,read,read,q,q];
  const total=(await db.prepare(`SELECT count(*) AS n FROM devotionals d LEFT JOIN devotional_reads r ON r.devotional_id=d.id AND r.user_id=? WHERE ${where}`).bind(...args).first()).n;
  const items=(await db.prepare(`${select} WHERE ${where} ORDER BY d.publish_date DESC,d.id LIMIT 20 OFFSET ?`).bind(...args,offset).all()).results;
  return json({today,timezone,items,total,more:offset+items.length<total});
 }
 const match=/^\/api\/devotionals\/([^/]+)(\/read)?$/.exec(path);
 if(match) {
  const item=await db.prepare(`${select} WHERE d.id=? AND ${visible}`).bind(auth.id,match[1],auth.role,today).first();
  requireValue(item,'Devotional unavailable.',404);
  if(!match[2]&&method==='GET') return json(item);
  if(match[2]&&method==='POST') {
   const data=await body(request);requireValue(typeof data.read==='boolean','Choose read or unread.');await rateLimit(db,`devotional-read:${auth.id}`,120);
   const guard="EXISTS(SELECT 1 FROM users WHERE id=? AND status='active' AND role=?) AND EXISTS(SELECT 1 FROM devotionals WHERE id=? AND (?='admin' OR (status='published' AND publish_date<=?)))";
   const args=[auth.id,auth.role,item.id,auth.role,today];
   if(data.read) {
    await db.prepare(`INSERT OR IGNORE INTO devotional_reads SELECT ?,?,? WHERE ${guard}`).bind(item.id,auth.id,Date.now(),...args).run();
    requireValue(await db.prepare('SELECT read_at FROM devotional_reads WHERE devotional_id=? AND user_id=?').bind(item.id,auth.id).first(),'Devotional changed. Refresh and try again.',409);
   } else await db.prepare(`DELETE FROM devotional_reads WHERE devotional_id=? AND user_id=? AND ${guard}`).bind(item.id,auth.id,...args).run();
   return json({ok:true,read:data.read});
  }
 }
 if(managing&&method==='POST'&&(path===root||path.startsWith(root+'/'))) {
  const parts=path.slice(root.length+1).split('/'),creating=path===root,id=creating?crypto.randomUUID():parts[0],deleting=parts[1]==='delete',data=await body(request);
  requireValue(creating||(parts.length<=2&&(!parts[1]||deleting)),'Unknown devotional action.',404);
  requireValue(creating||Number.isSafeInteger(data.revision)&&data.revision>0,'Invalid revision.');
  const reason=text(data.reason,500,'Reason'),audit=crypto.randomUUID(),time=Date.now();
  const condition=creating?'1=1':'EXISTS(SELECT 1 FROM devotionals WHERE id=? AND revision=?)',args=creating?[]:[id,data.revision];
  let title,scripture,reading,reflection,prayer,date,status,sample;
  if(deleting) requireValue(data.confirmation==='DELETE','Type DELETE to confirm.');
  else {
   title=text(data.title,180,'Title');scripture=text(data.scripture,180,'Scripture reference');reading=text(data.body,6000,'Reading');reflection=data.reflection===''?'':text(data.reflection,1200,'Reflection');prayer=data.prayer===''?'':text(data.prayer,1200,'Prayer');date=data.publish_date;status=data.status;sample=data.is_sample;
   requireValue(typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date,'Choose a valid publication date.');
   requireValue(['draft','published','hidden'].includes(status)&&typeof sample==='boolean','Choose status and sample designation.');
  }
  const unique=!deleting&&status==='published'?" AND NOT EXISTS(SELECT 1 FROM devotionals WHERE publish_date=? AND status='published' AND id<>?)":'';
  const authorization=db.prepare(`INSERT INTO admin_audit SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND role='admin' AND status='active') AND (${condition})${unique}`).bind(audit,auth.id,deleting?'delete':creating?'create':'edit','devotional',id,reason,time,auth.id,...args,...(unique?[date,id]:[]));
  const guard='EXISTS(SELECT 1 FROM admin_audit WHERE id=?)';
  const write=deleting?db.prepare(`DELETE FROM devotionals WHERE id=? AND ${guard}`).bind(id,audit):creating?
   db.prepare(`INSERT INTO devotionals (id,title,scripture,body,reflection,prayer,publish_date,status,is_sample,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}`).bind(id,title,scripture,reading,reflection,prayer,date,status,+sample,time,time,audit):
   db.prepare(`UPDATE devotionals SET title=?,scripture=?,body=?,reflection=?,prayer=?,publish_date=?,status=?,is_sample=?,updated_at=?,revision=revision+1 WHERE id=? AND ${guard}`).bind(title,scripture,reading,reflection,prayer,date,status,+sample,time,id,audit);
  const results=await db.batch([authorization,write]);requireValue(results[0].meta.changes===1,'This devotional changed, the date already has a published reading, or admin access ended. Refresh and try again.',409);
  return json({ok:true,id},creating?201:200);
 }
 return null;
}
