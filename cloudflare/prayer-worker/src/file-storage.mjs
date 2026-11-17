// Compression is private storage encoding. Downloaded bytes and filenames stay original.
export async function compressFile(bytes,isAudio) {
 if(isAudio||bytes.byteLength<1024)return {bytes,encoding:null};
 const compressed=await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
 return compressed.byteLength<bytes.byteLength*.95?{bytes:compressed,encoding:'gzip'}:{bytes,encoding:null};
}
export async function handleFileStorage(request,db,auth,url,h,files) {
 if(!/^\/api\/admin\/files(?:\/|$)/.test(url.pathname))return null;
 const {json,body,text,requireValue}=h;
 requireValue(auth.role==='admin','Portal admins only.',403);
 if(request.method==='GET'&&url.pathname==='/api/admin/files') {
  const search=(url.searchParams.get('search')||'').slice(0,200),kind=url.searchParams.get('kind')||'all',sort=url.searchParams.get('sort')||'largest',offset=Number(url.searchParams.get('offset')||0);
  requireValue(['all','posts','written','audio','archived'].includes(kind)&&['largest','newest','oldest'].includes(sort)&&Number.isSafeInteger(offset)&&offset>=0,'Invalid storage filters.');
  const summary=await db.prepare('SELECT count(*) AS count,coalesce(sum(size),0) AS original_bytes,coalesce(sum(coalesce(stored_size,size)),0) AS stored_bytes FROM prayer_attachments').first();
  const rows=(await db.prepare(`SELECT a.id,a.post_id,a.written_id,a.filename,a.content_type,a.size,coalesce(a.stored_size,a.size) AS stored_size,a.storage_encoding,a.is_audio,a.created_at,coalesce(p.title,w.title) AS prayer_title,coalesce(p.archived,0) AS archived,u.name AS uploader FROM prayer_attachments a LEFT JOIN posts p ON p.id=a.post_id LEFT JOIN written_prayers w ON w.id=a.written_id LEFT JOIN users u ON u.id=a.created_by WHERE instr(lower(a.filename||' '||coalesce(p.title,w.title,'')||' '||coalesce(u.name,'')),lower(?))>0 AND (?='all' OR (?='posts' AND a.post_id IS NOT NULL) OR (?='written' AND a.written_id IS NOT NULL) OR (?='audio' AND a.is_audio=1) OR (?='archived' AND p.archived=1)) ORDER BY ${sort==='largest'?'coalesce(a.stored_size,a.size) DESC':sort==='oldest'?'a.created_at ASC':'a.created_at DESC'},a.id LIMIT 51 OFFSET ?`).bind(search,kind,kind,kind,kind,kind,offset).all()).results;
  return json({summary,items:rows.slice(0,50),more:rows.length>50,offset:offset+50});
 }
 const match=/^\/api\/admin\/files\/([^/]+)\/delete$/.exec(url.pathname);
 if(match&&request.method==='POST') {
  const data=await body(request),reason=text(data.reason,500,'Reason');
  requireValue(data.confirmation==='DELETE','Type DELETE to permanently remove this file.');
  requireValue(files,'File storage is not configured.',503);
  const row=await db.prepare('SELECT * FROM prayer_attachments WHERE id=?').bind(match[1]).first();requireValue(row,'Attachment unavailable.',404);
  // Reserve an audited operation before touching R2; a failed delete remains visible and retryable.
  const op=crypto.randomUUID();
  const audit=await db.prepare("INSERT INTO admin_audit SELECT ?,?,'delete-requested','attachment',?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND role='admin' AND status='active' AND access_level='full') AND EXISTS(SELECT 1 FROM prayer_attachments WHERE id=?)").bind(op,auth.id,row.id,reason,Date.now(),auth.id,row.id).run();
  requireValue(audit.meta.changes===1,'Your access or this attachment changed. Refresh and try again.',409);
  try {await files.delete(row.object_key);}catch {return json({error:'Storage deletion failed. The attachment remains listed. Retry the deletion.'},503);}
  await db.batch([
   db.prepare('DELETE FROM prayer_attachments WHERE id=? AND object_key=?').bind(row.id,row.object_key),
   db.prepare("UPDATE admin_audit SET action='delete' WHERE id=?").bind(op)
  ]);
  return json({ok:true,freed_bytes:row.stored_size??row.size});
 }
 return null;
}
