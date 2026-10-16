import {handleTripPublicRequest} from './trip-platform';
import {hashText,type AdminEnv} from './admin';
type Row=Record<string,any>;
// These functions consume the same public projection as the website, never an admin
// query, raw R2 listing, traveler portal response, financial or contact record.
export async function refreshKnowledgeCatalog(env:AdminEnv){
 const sources:Row[]=[];let failures=0;
 async function get(path:string){const r=await handleTripPublicRequest(new Request('https://hopesojourns.com'+path),env,path);if(!r.ok)throw Error('Public projection unavailable');return r.json() as Promise<Row>;}
 function add(key:string,title:string,url:string,kind:string,body:string,context:string){sources.push({id:key,title,url,kind,body,context});}
 for(const [prefix,collection] of [['/public/trips','trips'],['/public/trip-stories','stories']]){
  const index=await get(prefix);
  for(const item of index[collection]||[]){
   try{const data=await get(prefix+'/'+item.slug),story=data.story||data.trip,scope=(collection==='stories'?'story:':'live:')+item.slug+':',page=(collection==='stories'?'/past-trips/story/?trip=':'/trip/?trip=')+item.slug,context=story.title+' '+(story.location||'')+' '+item.slug;
    add(scope+'overview',story.title,page,'website',[story.public_summary,story.public_description,story.summary,story.story].filter(v=>typeof v==='string').join('\n'),context);
    for(const c of data.content||story.content||story.contents||[]){add(scope+'content:'+c.id,c.title,page,'update',String(c.content||''),context);}
    for(const m of data.memories||story.memories||[]){add(scope+'memory:'+m.id,m.title||story.title,m.url||m.image_url||page,m.kind==='video'?'video':'caption',m.kind==='video'?'':[m.caption,m.alt_text].filter(Boolean).join('\n'),context);}
   }catch{failures++;}
  }
 }
 if(failures)throw Error('Some public journeys could not be read; no sources were changed. Try refreshing again.');
 const stamp=new Date().toISOString(),statements=[];
 for(const s of sources){
  // R2 media routes can be relative or absolute in public projection responses.
  if(s.url.startsWith('https://hopesojourns.com/'))s.url=new URL(s.url).pathname+new URL(s.url).search;
  const fingerprint=await hashText(JSON.stringify(s)),old=await env.DB.prepare('SELECT fingerprint FROM knowledge_sources WHERE origin_key=?').bind(s.id).first<Row>();
  if(old?.fingerprint===fingerprint)continue;
  statements.push(env.DB.prepare(`INSERT INTO knowledge_sources(id,origin_key,title,url,kind,context,body,status,managed,provenance,fingerprint,updated_at)
   VALUES(?,?,?,?,?,?,?, ?,1,'Published website projection; review before approving AI reuse',?,?)
   ON CONFLICT(origin_key) DO UPDATE SET title=excluded.title,url=excluded.url,kind=excluded.kind,context=excluded.context,body=excluded.body,
   status=excluded.status,segments_json='[]',revision=knowledge_sources.revision+1,fingerprint=excluded.fingerprint,updated_at=excluded.updated_at`).bind(s.id,s.id,s.title,s.url,s.kind,s.context,s.body.slice(0,100000),s.kind==='video'?'transcript_missing':'pending',fingerprint,stamp));
 }
 const seen=sources.map(s=>s.id);
 const managed=await env.DB.prepare('SELECT id FROM knowledge_sources WHERE managed=1').all<Row>();
 for(const s of managed.results)if(!seen.includes(s.id))statements.push(env.DB.prepare("UPDATE knowledge_sources SET status='withdrawn',body='',segments_json='[]',revision=revision+1,updated_at=? WHERE id=? AND status!='withdrawn'").bind(stamp,s.id));
 // Bounded batches avoid exceeding D1's per-query parameter limit. A partial refresh
 // can only create pending sources or withdraw data, never approve new content.
 for(let i=0;i<statements.length;i+=50)await env.DB.batch(statements.slice(i,i+50));
 return {sources:sources.length,changed:statements.length,videos:sources.filter(s=>s.kind==='video').length};
}
