import {compressFile} from './file-storage.mjs';
const MAX=8*1024*1024,TOTAL=25*1024*1024;
const formats={pdf:'application/pdf',txt:'text/plain',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',m4a:'audio/mp4',webm:'audio/webm'};
export async function handleAttachments(request,db,auth,url,h,files) {
 const match=/^\/api\/(posts|written-prayers)\/([^/]+)\/attachments(?:\/([^/]+))?$/.exec(url.pathname);if(!match)return null;
 const {json,requireValue,visibility,visibleArgs,rateLimit}=h,[,type,parentId,id]=match,method=request.method,written=type==='written-prayers';
 const parent=written?await db.prepare("SELECT * FROM written_prayers WHERE id=? AND (status='published' OR ?='admin' OR (author_id=? AND ?='full'))").bind(parentId,auth.role,auth.id,auth.access_level||'full').first():await db.prepare(`SELECT p.* FROM posts p WHERE p.id=? AND ${visibility}`).bind(parentId,...visibleArgs(auth)).first();
 requireValue(parent,'Prayer unavailable.',404);
 const key=written?'written_id':'post_id';
 if(method==='GET'&&!id)return json((await db.prepare(`SELECT id,filename,content_type,size,coalesce(stored_size,size) AS stored_size,storage_encoding,is_audio,created_at FROM prayer_attachments WHERE ${key}=? ORDER BY created_at,id`).bind(parentId).all()).results);
 const attachment=id&&await db.prepare(`SELECT * FROM prayer_attachments WHERE id=? AND ${key}=?`).bind(id,parentId).first();
 if(id)requireValue(attachment,'Attachment unavailable.',404);
 requireValue(files,'File storage is not configured. Please contact a portal admin.',503);
 if(method==='GET'&&id) {
  const headers=new Headers({'Content-Type':attachment.content_type,'Content-Disposition':`${attachment.is_audio?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,'Accept-Ranges':'bytes'});
  const range=request.headers.get('range');let offset=0,length=attachment.size,status=200;
  if(range) {
   const m=/^bytes=(\d*)-(\d*)$/.exec(range);
   if(!m||(!m[1]&&!m[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${attachment.size}`}});
   offset=m[1]?Number(m[1]):Math.max(0,attachment.size-Number(m[2]));const end=m[1]?(m[2]?Math.min(Number(m[2]),attachment.size-1):attachment.size-1):attachment.size-1;
   if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(end)||offset>=attachment.size||end<offset)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${attachment.size}`}});
   length=end-offset+1;status=206;headers.set('Content-Range',`bytes ${offset}-${end}/${attachment.size}`);
  }
  const object=await files.get(attachment.object_key,{range:attachment.storage_encoding==='gzip'?{offset:0,length:attachment.stored_size}:{offset,length}});requireValue(object,'Attachment unavailable.',404);
  let payload=object.body;if(attachment.storage_encoding==='gzip'){const original=await new Response(new Response(object.body).body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();payload=original.slice(offset,offset+length);}
  headers.set('Content-Length',String(length));return new Response(payload,{status,headers});
 }
 requireValue(auth.access_level!=='provisional','Full membership is required to change attachments.',403);
 const owner=parent.author_id===auth.id||auth.role==='admin';
 const group=!written&&!parent.author_only&&parent.group_id&&await db.prepare("SELECT 1 FROM group_members WHERE group_id=? AND user_id=? AND status='approved'").bind(parent.group_id,auth.id).first();
 requireValue(owner||group,'You cannot change attachments for this prayer.',403);
 await rateLimit(db,`attachment:${auth.id}`,30);
 const live="EXISTS(SELECT 1 FROM users WHERE id=? AND status='active' AND access_level='full' AND role=?)";
 // Every write rechecks parent access, edit lock, membership and account authority.
 const access=written?"EXISTS(SELECT 1 FROM written_prayers WHERE id=? AND (author_id=? OR ?='admin'))":`EXISTS(SELECT 1 FROM posts p WHERE p.id=? AND ${visibility} AND (p.author_id=? OR ?='admin' OR (p.author_only=0 AND EXISTS(SELECT 1 FROM group_members WHERE group_id=p.group_id AND user_id=? AND status='approved'))))`;
 const args=written?[parentId,auth.id,auth.role]:[parentId,...visibleArgs(auth),auth.id,auth.role,auth.id];
 if(method==='POST'&&!id) {
  requireValue((request.headers.get('content-type')||'').startsWith('multipart/form-data'),'Choose a file.',415);
  const data=await request.formData(),file=data.get('file');requireValue(file&&typeof file.arrayBuffer==='function'&&file.size>0&&file.size<=MAX,'Choose a nonempty file up to 8 MB.');
  const filename=String(file.name).replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(0,180),ext=filename.split('.').pop().toLowerCase(),mime=formats[ext];
  requireValue(mime,'Use PDF, TXT, DOCX, JPG, PNG, WebP, MP3, WAV, OGG, M4A, or WebM.');
  const isAudio=mime.startsWith('audio/');requireValue(!isAudio||written,'Prayer recordings belong in the Written prayers library.');
  const bytes=await file.arrayBuffer(),head=new Uint8Array(bytes),ascii=(start,end)=>String.fromCharCode(...head.slice(start,end));
  if(isAudio)requireValue(ext==='mp3'?(ascii(0,3)==='ID3'||head[0]===255&&(head[1]&224)===224):ext==='wav'?(ascii(0,4)==='RIFF'&&ascii(8,12)==='WAVE'):ext==='ogg'?ascii(0,4)==='OggS':ext==='m4a'?ascii(4,8)==='ftyp':head[0]===26&&head[1]===69&&head[2]===223&&head[3]===163,'This file does not appear to be a supported audio recording.');
  const fileId=crypto.randomUUID(),objectKey=`prayers/${written?'written':'posts'}/${parentId}/${fileId}`;
  const stored=await compressFile(bytes,isAudio);
  await files.put(objectKey,stored.bytes,{httpMetadata:{contentType:stored.encoding?'application/octet-stream':mime}});
  try {
   const result=await db.prepare(`INSERT INTO prayer_attachments (id,${key},object_key,filename,content_type,size,is_audio,created_by,created_at,stored_size,storage_encoding) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${access} AND ${live} AND (SELECT count(*) FROM prayer_attachments WHERE ${key}=?)<10 AND (SELECT coalesce(sum(size),0) FROM prayer_attachments WHERE ${key}=?)+?<=?`).bind(fileId,parentId,objectKey,filename,mime,file.size,+isAudio,auth.id,Date.now(),stored.bytes.byteLength,stored.encoding,...args,auth.id,auth.role,parentId,parentId,file.size,TOTAL).run();
   requireValue(result.meta.changes===1,'The prayer changed, or the limit of 10 files / 25 MB per prayer was reached.',409);
  }catch(error){await files.delete(objectKey);throw error;}
  return json({id:fileId},201);
 }
 if(method==='DELETE'&&id) {
  const result=await db.prepare(`DELETE FROM prayer_attachments WHERE id=? AND ${access} AND ${live}`).bind(id,...args,auth.id,auth.role).run();
  requireValue(result.meta.changes===1,'Your access changed.',409);await files.delete(attachment.object_key);return json({ok:true});
 }
 return null;
}
