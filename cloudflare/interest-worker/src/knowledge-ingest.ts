import {handleTripPublicRequest} from './trip-platform';
import {handleDestinations} from './destinations';
import {hashText,type AdminEnv} from './admin';
import {siteContent,siteContentDigest} from './knowledge-site-content';
import {safeKnowledgeUrl} from './knowledge-policy';
type Row=Record<string,any>;
type Source={id:string;title:string;url:string;kind:string;body:string;context:string};
const now=()=>new Date().toISOString();
// Ingest only published public projections, never raw contacts, finances, traveler
// records, arbitrary URLs, broad R2 listings or AI-generated FAQ answers.
async function store(env:AdminEnv,sources:Source[],prefixes:string[]){
 const stamp=now(),statements=[];
 const managed=await env.DB.prepare('SELECT * FROM knowledge_sources WHERE managed=1').all<Row>();
 const previous=new Map(managed.results.map(s=>[s.origin_key,s]));
 for(const source of sources){const s={...source};
  if(s.url.startsWith('https://hopesojourns.com/')){const u=new URL(s.url);s.url=u.pathname+u.search+u.hash;}
  if(!safeKnowledgeUrl(s.url))throw Error('Unsafe public source URL.');
  const fingerprint=await hashText(JSON.stringify(s)),old=previous.get(s.id);
  if(old&&(old.sync_paused||old.visibility!=='public'))continue;
  const same=old?.fingerprint===fingerprint;
  if(same&&['approved','transcript_missing'].includes(old!.status))continue;
  const transcript=same&&old?.segments_json!=='[]'&&old?.body;
  const body=transcript?old!.body:s.body.slice(0,100000),segments=transcript?old!.segments_json:'[]';
  const status=['video','audio'].includes(s.kind)&&!transcript?'transcript_missing':'approved';
  statements.push(env.DB.prepare(`INSERT INTO knowledge_sources(id,origin_key,title,url,kind,context,body,segments_json,status,managed,provenance,fingerprint,updated_at)
   VALUES(?,?,?,?,?,?,?,?,?,1,'Published public website original; authorized for public answers',?,?)
   ON CONFLICT(origin_key) DO UPDATE SET title=excluded.title,url=excluded.url,kind=excluded.kind,context=excluded.context,body=excluded.body,
   status=excluded.status,segments_json=excluded.segments_json,revision=knowledge_sources.revision+1,fingerprint=excluded.fingerprint,updated_at=excluded.updated_at
   WHERE knowledge_sources.sync_paused=0 AND knowledge_sources.visibility='public' AND knowledge_sources.revision=?`).bind(s.id,s.id,s.title,s.url,s.kind,s.context,body,segments,status,fingerprint,stamp,old?.revision||0));
 }
 const seen=new Set(sources.map(s=>s.id));
 for(const s of managed.results)if(!s.sync_paused&&prefixes.some(p=>s.origin_key.startsWith(p))&&!seen.has(s.id))statements.push(env.DB.prepare("UPDATE knowledge_sources SET status='withdrawn',body='',segments_json='[]',revision=revision+1,updated_at=? WHERE id=? AND sync_paused=0 AND status!='withdrawn'").bind(stamp,s.id));
 for(let i=0;i<statements.length;i+=40)await env.DB.batch(statements.slice(i,i+40));
 return {sources:sources.length,changed:statements.length,videos:sources.filter(s=>s.kind==='video').length};
}
export async function syncSiteKnowledge(env:AdminEnv){
 const state=await env.DB.prepare("SELECT digest FROM knowledge_catalog_state WHERE key='site'").first<Row>();
 if(state?.digest===siteContentDigest)return;
 await store(env,siteContent,['site:']);
 // Earlier starter FAQs cited literal website excerpts before the full catalog.
 // If those originals disappear from a released page, revoke their old evidence.
 const legacy=await env.DB.prepare("SELECT id,url,body FROM knowledge_sources WHERE managed=0 AND visibility='public' AND status='approved' AND (origin_key LIKE 'static:internship:%' OR origin_key LIKE 'starter-content:%')").all<Row>();
 const normalize=(value:string)=>value.normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
 for(const s of legacy.results){const page=normalize(siteContent.filter(p=>p.url.split('#')[0]===s.url.split('#')[0]).map(p=>p.body).join(' '));
  if(!page||s.body.split('\n').filter(Boolean).some((line:string)=>!page.includes(normalize(line))))await env.DB.prepare("UPDATE knowledge_sources SET status='pending',sync_paused=1,revision=revision+1,updated_at=? WHERE id=? AND status='approved'").bind(now(),s.id).run();
 }

 await env.DB.prepare("INSERT INTO knowledge_catalog_state(key,digest,refreshed_at) VALUES('site',?,?) ON CONFLICT(key) DO UPDATE SET digest=excluded.digest,refreshed_at=excluded.refreshed_at").bind(siteContentDigest,now()).run();
}
export async function refreshKnowledgeCatalog(env:AdminEnv){
 await syncSiteKnowledge(env);
 const sources:Source[]=[];let failures=0;
 async function get(path:string){const r=await handleTripPublicRequest(new Request('https://hopesojourns.com'+path),env,path);if(!r.ok)throw Error('Public projection unavailable');return r.json() as Promise<Row>;}
 function add(id:string,title:string,url:string,kind:string,body:string,context:string){sources.push({id,title,url,kind,body,context});}
 for(const [prefix,collection] of [['/public/trips','trips'],['/public/trip-stories','stories']]){
  const index=await get(prefix);
  for(const item of index[collection]||[]){
   try{const data=await get(prefix+'/'+item.slug),story=data.story||data.trip,scope=(collection==='stories'?'story:':'live:')+item.slug+':',page=(collection==='stories'?'/past-trips/story/?trip=':'/trip/?trip=')+item.slug,context=story.title+' '+(story.location||'')+' '+item.slug;
    add(scope+'overview',story.title,page,'website',[story.public_summary,story.public_description,story.summary,story.story].filter(v=>typeof v==='string').join('\n'),context);
    for(const c of data.content||story.content||story.contents||[])add(scope+'content:'+c.id,c.title,page,c.content_type==='devotional'?'devotional':'update',String(c.content||''),context);
    for(const m of data.memories||story.memories||[])add(scope+'memory:'+m.id,m.title||story.title,m.url||m.image_url||page,m.kind==='video'?'video':m.kind==='note'?'update':'caption',m.kind==='video'?'':[m.content,m.caption,m.alt_text].filter(v=>typeof v==='string').join('\n'),context);
   }catch{failures++;}
  }
 }
 const response=await handleDestinations(new Request('https://hopesojourns.com/public/destinations'),env,'/public/destinations');
 if(!response.ok)throw Error('Public destinations unavailable.');
 const destinations=await response.json() as Row;
 for(const d of destinations.destinations||[]){
  add('destination:'+d.slug,d.title,'/destination/?destination='+d.slug, 'ministry',[d.title,d.introduction,d.partners,d.service,d.notes,d.dates_text,d.focus,d.setting,d.summary,d.location].filter(v=>typeof v==='string').join('\n'),d.title+' '+d.slug);
 }
 if(failures)throw Error('Some public journeys could not be read; their catalog was not changed. Try refreshing again.');
 const result=await store(env,sources,['live:','story:','destination:']);
 await env.DB.prepare("INSERT INTO knowledge_catalog_state(key,refreshed_at) VALUES('published',?) ON CONFLICT(key) DO UPDATE SET refreshed_at=excluded.refreshed_at").bind(now()).run();
 return {...result,siteSources:siteContent.length};
}
export async function ensureKnowledgeCatalog(env:AdminEnv){
 const token=crypto.randomUUID(),stamp=now();
 const claim=await env.DB.prepare(`INSERT INTO knowledge_catalog_state(key,digest,refreshed_at,lease_until) VALUES('refresh-lock',?,?,?)
 ON CONFLICT(key) DO UPDATE SET digest=excluded.digest,refreshed_at=excluded.refreshed_at,lease_until=excluded.lease_until
 WHERE knowledge_catalog_state.lease_until<? RETURNING digest`).bind(token,stamp,new Date(Date.now()+120000).toISOString(),stamp).first<Row>();
 if(!claim)return;
 try{
  await syncSiteKnowledge(env);
  const state=await env.DB.prepare("SELECT refreshed_at FROM knowledge_catalog_state WHERE key='published'").first<Row>();
  if(!state||Date.parse(state.refreshed_at)<Date.now()-5*60000)await refreshKnowledgeCatalog(env);
 }finally{await env.DB.prepare("DELETE FROM knowledge_catalog_state WHERE key='refresh-lock' AND digest=?").bind(token).run();}
}
