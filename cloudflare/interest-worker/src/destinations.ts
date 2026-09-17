import {AdminError,adminJson,authenticate,auditStatement,readAdminJson,type AdminEnv} from './admin';
import {detectReceiptMedia,ReceiptFileError} from './receipt-file';

type Row=Record<string,unknown>;
const publicFields='id,slug,title,location,eyebrow,summary,introduction,service,partners,focus,setting,notes,dates_text,image_url,image_alt,image_credit,sort_order,revision';
function line(value:unknown,max:number,required=false){if(value==null&&!required)return '';if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)||(required&&!value.trim()))throw new AdminError(422,'INVALID_CONTENT','Complete the required fields and keep the content within the indicated limits.');return value.trim();}
function mapped(row:Row,admin=false){const image=row.image_key?`/api/interest/${admin?'admin':'public'}/destinations/${row.slug}/image?v=${row.revision}`:row.image_url;const result:Row={...row,image_url:image};delete result.image_key;delete result.image_type;return result;}
async function get(env:AdminEnv,slug:string){const row=await env.DB.prepare('SELECT * FROM destinations WHERE slug=?').bind(slug).first<Row>();if(!row)throw new AdminError(404,'NOT_FOUND','Destination not found.');return row;}
async function save(request:Request,env:AdminEnv,slug?:string){
 const body=await readAdminJson(request),existing=slug?await get(env,slug):null;
 const nextSlug=existing?String(existing.slug):line(body.slug,70,true).toLowerCase();
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(nextSlug))throw new AdminError(422,'INVALID_SLUG','Use lowercase words separated by hyphens for the page address.');
 const status=line(body.status,20,true);if(!['draft','published','archived'].includes(status))throw new AdminError(422,'INVALID_STATUS','Choose Draft, Published, or Hidden.');
 const fields=['title','location','eyebrow','summary','introduction','service','partners','focus','setting','notes','dates_text','image_alt','image_credit'];
 const limits=[150,150,150,500,5000,5000,3000,300,300,3000,1500,300,1000];
 const values=fields.map((key,i)=>line(body[key],limits[i],i<2));
 if(status==='published'&&(!values[3]||!values[4]||!values[11]||(!existing?.image_url&&!existing?.image_key)))throw new AdminError(422,'NOT_READY','Before publishing, add a tile summary, page introduction, photo, and image description. Save as Draft first if you need to upload a photo.');
 const order=Number(body.sort_order??0);if(!Number.isInteger(order)||order<0||order>100000)throw new AdminError(422,'INVALID_ORDER','Display order must be a whole number from 0 to 100000.');
 const now=new Date().toISOString(),id=existing?.id??'trip-'+crypto.randomUUID();
 // Resolve collisions in the same transaction as the save. Exclude this destination
 // and guard edits by revision so an outdated editor cannot shift other records.
 const bump=env.DB.prepare(`UPDATE destinations SET sort_order=sort_order+1,revision=revision+1,updated_at=? WHERE id IN (
 SELECT id FROM destinations WHERE id<>? AND sort_order>=?
 AND EXISTS(SELECT 1 FROM destinations WHERE id<>? AND sort_order=?)
 AND (?=1 OR EXISTS(SELECT 1 FROM destinations WHERE id=? AND revision=? AND sort_order<>?)))`)
 .bind(now,id,order,id,order,existing?0:1,id,Number(body.revision)||0,order);
 if(existing){
  const revision=Number(body.revision);if(!Number.isInteger(revision)||revision!==Number(existing.revision))throw new AdminError(409,'STALE_EDIT','This destination changed. Refresh and reopen it before saving.');
  const results=await env.DB.batch([bump,env.DB.prepare(`UPDATE destinations SET ${fields.map(k=>k+'=?').join(',')},status=?,sort_order=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?`).bind(...values,status,order,now,id,revision),auditStatement(env,'destination',String(id),'edited',{status,sort_order:order})]);
  if(!results[1].meta.changes)throw new AdminError(409,'STALE_EDIT','This destination changed. Refresh and reopen it before saving.');
 }else{
  await env.DB.batch([bump,env.DB.prepare("INSERT INTO opportunities(id,slug,kind,title,location,active,sort_order,updated_at) VALUES(?,?,'trip',?,?,0,?,?)").bind(id,'trip-'+nextSlug,values[0],values[1],order,now),env.DB.prepare(`INSERT INTO destinations(id,slug,${fields.join(',')},status,sort_order,updated_at) VALUES(${Array(fields.length+5).fill('?').join(',')})`).bind(id,nextSlug,...values,status,order,now),auditStatement(env,'destination',String(id),'created',{status,sort_order:order})]);
 }
 return adminJson({destination:mapped(await get(env,nextSlug),true)},existing?200:201);
}
const MAX_IMAGE=6*1024*1024;
async function upload(request:Request,env:AdminEnv,slug:string){
 const current=await get(env,slug);if(!request.body)throw new AdminError(422,'NO_PHOTO','Choose a photo.');
 if(Number(request.headers.get('content-length'))>MAX_IMAGE+65536)throw new AdminError(413,'TOO_LARGE','Choose a photo up to 6 MB.');
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let total=0;
 while(true){const result=await reader.read();if(result.done)break;total+=result.value.length;if(total>MAX_IMAGE+65536){await reader.cancel();throw new AdminError(413,'TOO_LARGE','Choose a photo up to 6 MB.');}chunks.push(result.value);}
 const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const form=await new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();const file=form.get('file');
 if(!(file instanceof File)||!file.size||file.size>MAX_IMAGE)throw new AdminError(422,'INVALID_IMAGE','Choose a JPEG, PNG, or WebP photo up to 6 MB.');
 const image=new Uint8Array(await file.arrayBuffer());let media;
 try{media=detectReceiptMedia(image);}catch{throw new AdminError(422,'INVALID_IMAGE','Choose a valid JPEG, PNG, or WebP photo.');}
 if(!['image/jpeg','image/png','image/webp'].includes(media.mediaType))throw new AdminError(422,'INVALID_IMAGE','Choose a JPEG, PNG, or WebP photo.');
 const revision=Number(form.get('revision'));if(revision!==Number(current.revision))throw new AdminError(409,'STALE_EDIT','Refresh this destination before replacing its photo.');
 const key=`destination-images/${current.id}/${crypto.randomUUID()}.${media.extension}`;
 await env.RECEIPTS.put(key,image,{httpMetadata:{contentType:media.mediaType}});
 try{const results=await env.DB.batch([env.DB.prepare('UPDATE destinations SET image_key=?,image_type=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').bind(key,media.mediaType,new Date().toISOString(),current.id,revision),auditStatement(env,'destination',String(current.id),'photo_replaced')]);if(!results[0].meta.changes)throw new AdminError(409,'STALE_EDIT','The destination changed while uploading. Refresh and try again.');}catch(error){await env.RECEIPTS.delete(key);throw error;}
 // Retain prior objects for recovery. Public URLs always resolve the current published photo.
 return adminJson({destination:mapped(await get(env,slug),true)});
}
export async function handleDestinations(request:Request,env:AdminEnv,path:string):Promise<Response>{
 try{
  const admin=path.startsWith('/admin/');if(admin)await authenticate(request,env,request.method!=='GET');else if(request.method!=='GET')throw new AdminError(405,'METHOD_NOT_ALLOWED','Read only.');
  const match=path.match(/^\/(admin|public)\/destinations(?:\/([a-z0-9-]+))?(?:\/(image))?$/);if(!match)throw new AdminError(404,'NOT_FOUND','Not found.');
  const [, ,slug,image]=match;
  if(admin&&request.method==='POST'&&image&&slug)return await upload(request,env,slug);
  if(admin&&((request.method==='POST'&&!slug)||(request.method==='PUT'&&slug&&!image)))return await save(request,env,slug);
  if(request.method!=='GET')throw new AdminError(405,'METHOD_NOT_ALLOWED','Use the destination editor to make changes.');
  if(!slug){const rows=await env.DB.prepare(`SELECT ${admin?'*':publicFields+',image_key'} FROM destinations ${admin?'':"WHERE status='published'"} ORDER BY sort_order,title`).all<Row>();return adminJson({destinations:rows.results.map(r=>mapped(r,admin))});}
  const row=await get(env,slug);if(!admin&&row.status!=='published')throw new AdminError(404,'NOT_FOUND','This destination is not currently available.');
  if(image){if(!row.image_key)throw new AdminError(404,'NOT_FOUND','Photo not found.');const object=await env.RECEIPTS.get(String(row.image_key));if(!object)throw new AdminError(404,'NOT_FOUND','Photo not found.');return new Response(object.body,{headers:{'Content-Type':String(row.image_type),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}});}
  const output=admin?row:Object.fromEntries(publicFields.split(',').map(key=>[key,row[key]]));output.image_key=row.image_key;
  const departures=await env.DB.prepare("SELECT slug,title,start_date,end_date,status,location FROM trips WHERE opportunity_id=? AND public_enabled=1 AND status NOT IN ('draft','archived','canceled','completed') ORDER BY start_date").bind(row.id).all();
  return adminJson({destination:mapped(output,admin),departures:departures.results});
 }catch(error){if(error instanceof AdminError||error instanceof ReceiptFileError)return adminJson({error:error.message,code:error.code},error.status);if(error instanceof Error&&/UNIQUE constraint/.test(error.message))return adminJson({error:'That page address already exists. Choose a different address.'},409);console.error('destination_error',error instanceof Error?error.message:'Unknown error');return adminJson({error:'The destination could not be saved or loaded. Try again.'},500);}
}
