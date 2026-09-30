import {AdminError, adminJson, authenticate, auditStatement, readAdminJson, type AdminEnv} from './admin';
import {can} from './mmt-permissions';

export const categories = ['daily','transportation','lodging','meal','ministry','worship','meeting','activity','rest','general'];
const detailFields = ['venue','address','contact','carrier','partySize','dietaryNotes','leader','preparation','admission'];
function object(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') { try { value=JSON.parse(value); } catch { throw new AdminError(422,'INVALID_FIELD','Invalid itinerary details.'); } }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AdminError(422,'INVALID_FIELD','Invalid itinerary details.');
  return value as Record<string, unknown>;
}
export function details(value: unknown, privateFields=false): string {
  const source=object(value), result:Record<string,string>={};
  for (const field of privateFields?['reservation','notes']:detailFields) {
    if(source[field]===undefined || source[field]===null || source[field]==='') continue;
    if(typeof source[field]!=='string' || source[field].length>2000) throw new AdminError(422,'INVALID_FIELD','Itinerary details must use 2,000 characters or fewer per field.');
    result[field]=source[field].trim();
  }
  return JSON.stringify(result);
}
export function tags(value:unknown):string {
  if(typeof value==='string') { try {value=JSON.parse(value);} catch {throw new AdminError(422,'INVALID_FIELD','Invalid itinerary categories.');} }
  if(!Array.isArray(value)||value.some(v=>!categories.includes(v)))throw new AdminError(422,'INVALID_FIELD','Choose valid itinerary categories.');
  return JSON.stringify([...new Set(value)]);
}
const normalized=(value:unknown)=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const phone=(value:unknown)=>String(value||'').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
const domain=(value:unknown)=>{try{return new URL(String(value)).hostname.toLowerCase().replace(/^www\./,'');}catch{return '';}};
type Ministry=Record<string,unknown> & {id:string;name:string};
function matches(row:Ministry, body:Record<string,unknown>) {
  const name=normalized(body.name), existing=normalized(row.name);
  return (name && (existing===name || (name.length>=5 && (existing.includes(name)||name.includes(existing)))))
    || (body.email && String(body.email).trim().toLowerCase()===String(row.email||'').trim().toLowerCase())
    || (phone(body.phone) && phone(body.phone)===phone(row.phone))
    || (domain(body.website) && domain(body.website)===domain(row.website));
}
// The write is conditional on the complete catalog remaining unchanged since the
// duplicate review. A simultaneous edit/create forces a fresh review, not a duplicate.
export async function itineraryMinistries(request:Request,env:AdminEnv,tripId:string):Promise<Response> {
  const session=await authenticate(request,env,request.method==='POST');
  if(!can(session.user,'contacts',request.method==='POST'))throw new AdminError(403,'FORBIDDEN','Contact access is required to look up or add ministries.');
  if(!await env.DB.prepare('SELECT id FROM trips WHERE id=?1').bind(tripId).first())throw new AdminError(404,'NOT_FOUND','Trip not found.');
  const rows=(await env.DB.prepare('SELECT id,name,name_normalized,city,region,country,email,phone,website,status,updated_at FROM ministries ORDER BY name').all<Ministry>()).results;
  if(request.method==='GET') {
    const q=normalized(new URL(request.url).searchParams.get('q'));
    return adminJson({ministries:rows.filter(r=>!q||[r.name,r.city,r.region,r.email,r.phone,r.website].some(v=>normalized(v).includes(q))).slice(0,50)});
  }
  const body=await readAdminJson(request);
  const name=String(body.name||'').normalize('NFKC').replace(/\s+/g,' ').trim();
  if(!name||name.length>160)throw new AdminError(422,'INVALID_FIELD','Enter a ministry name (up to 160 characters).');
  const fields=['city','region','country','email','phone','website'] as const;
  for(const key of fields)if(body[key]!==undefined&&(typeof body[key]!=='string'||String(body[key]).length>254))throw new AdminError(422,'INVALID_FIELD','Invalid ministry '+key+'.');
  const email=String(body.email||'').trim().toLowerCase(), website=String(body.website||'').trim();
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new AdminError(422,'INVALID_FIELD','Enter a valid email.');
  if(website&&(!domain(website)||!/^https?:\/\//i.test(website)))throw new AdminError(422,'INVALID_FIELD','Enter a complete http or https website address.');
  const duplicates=rows.filter(r=>matches(r,{...body,name,email,website}));
  const fingerprint=JSON.stringify(rows.map(r=>[r.id,r.updated_at]));
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([fingerprint,name,...fields.map(key=>String(body[key]||'').trim())])))),b=>b.toString(16).padStart(2,'0')).join('');
  if(duplicates.some(r=>normalized(r.name)===normalized(name)))return adminJson({matches:duplicates,blocked:true,message:'A ministry with this name already exists. Select its record.'});
  if(duplicates.length && body.reviewToken!==digest)return adminJson({matches:duplicates,reviewToken:digest,message:'Review these possible matches. Select an existing ministry or confirm this is a separate organization.'});
  const id=crypto.randomUUID(),now=new Date().toISOString();
  const insert=env.DB.prepare(`INSERT INTO ministries(id,name,name_normalized,city,region,country,email,phone,website,status,created_at,updated_at)
    SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,'active',?10,?10
    WHERE (SELECT json_group_array(json_array(id,updated_at)) FROM (SELECT id,updated_at FROM ministries ORDER BY name))=?11`).bind(id,name,name.toLowerCase(),String(body.city||'').trim()||null,String(body.region||'').trim()||null,String(body.country||'').trim()||null,email||null,String(body.phone||'').trim()||null,website||null,now,fingerprint);
  try{const result=await insert.run();if(!result.meta.changes)throw new AdminError(409,'RECHECK_MINISTRY','The ministry list changed. Check for duplicates again.');}
  catch(error){if(error instanceof Error&&error.message.includes('UNIQUE'))throw new AdminError(409,'MINISTRY_EXISTS','This ministry was just added. Search for it again.');throw error;}
  await auditStatement(env,'ministry',id,'created_from_itinerary',{tripId}).run();
  return adminJson({id,name},201);
}
