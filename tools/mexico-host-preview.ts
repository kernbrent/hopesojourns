// Loopback-only synthetic Mexico review. No hosted credentials, records, or mail.
import {createServer} from 'node:http';
import {readFileSync,statSync} from 'node:fs';
import path from 'node:path';
import {ministryFixture} from '../cloudflare/interest-worker/test/ministry-fixture';
import {handleTripPublicRequest} from '../cloudflare/interest-worker/src/trip-platform';
import {handleDestinations} from '../cloudflare/interest-worker/src/destinations';
const root=process.cwd(),port=4208;
const f=await ministryFixture('0068_athens_july_2027_dates.sql');
const itineraryIds=['0d061718-59f9-48a8-9c33-da98bd5d03cb','94da964d-07d0-498c-bad0-a39153f86191','1ae73842-e4cf-459b-9821-daa4845d5e21','46ef7eb7-0e9d-44d1-b224-2e6c10e08354','be4235be-cf42-4ae9-8905-e25850b5f0c4','a18fc0dc-7db4-4b4a-bfd5-60fcf153abd2'];
f.sqlite.exec("INSERT INTO trips(id,opportunity_id,code,slug,title,location,start_date,end_date,status,public_enabled,interest_enabled,portal_enabled,created_at,updated_at) VALUES('mexico-local','trip-mexico-city','MEXICO-LOCAL','mexico-january-2027-8385c082','Mexico January 2027','Mexico City, Mexico','2027-01-09','2027-01-14','recruiting',1,1,1,'old','old')");
itineraryIds.forEach((id,index)=>f.sqlite.prepare("INSERT INTO trip_content(id,trip_id,content_type,title,content,event_date,visibility,publication_status,created_at,updated_at) VALUES(?,'mexico-local','itinerary','Legacy outline','Local sample',?,'travelers','published','old','old')").run(id,`2027-01-${String(index+9).padStart(2,'0')}`));
f.sqlite.exec(readFileSync('cloudflare/interest-worker/migrations/0069_mexico_host_briefing.sql','utf8'));
f.sqlite.exec("INSERT INTO trip_content(id,trip_id,content_type,title,content,event_date,visibility,publication_status,created_at,updated_at) VALUES('sample-packing','mexico-local','resource','Packing and preparation','Local sample only. Review passport, work clothing, comfortable shoes, and guidance from your leader.','2027-01-09','travelers','published','now','now')");
const token='local-mexico-preview-only';const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('base64url');
f.sqlite.prepare("INSERT INTO trip_portal_sessions(id,trip_id,token_hash,expires_at,last_seen_at,created_at) VALUES('local-session','mexico-local',?,'2099-01-01','now','now')").run(hash);
const publicEntries=new Set(['index.html','styles.css','script.js','trip.js','destinations-public.js','phone-ui.js','experience.js','experience.css','assets','trips','trip','journey','destination','explore','past-trips','resources','knowledge','giving','interest','schedule','about','corporate-journeys','partners','discover','groups','internships','students','credits']);
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'};
createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 try{
  if(req.method!=='GET'){res.writeHead(405);res.end('Local review is read-only.');return;}
  const url=new URL(req.url||'/',`http://localhost:${port}`),route=decodeURIComponent(url.pathname);
  if(route.startsWith('/api/interest/')){
   const p=route.slice('/api/interest'.length);
   if(p==='/public/knowledge/config'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({enabled:false,aiEnabled:false}));return;}
   if(!p.startsWith('/public/')&&p!=='/portal/session'){res.writeHead(404);res.end();return;}
   const request=new Request(url,{headers:{cookie:'hs_trip_portal_session='+token}});
   const response=p.startsWith('/public/destinations')?await handleDestinations(request,f.env,p):await handleTripPublicRequest(request,f.env,p);
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  const relative=route.replace(/^\//,'')||'index.html';if(!publicEntries.has(relative.split('/')[0])){res.writeHead(404);res.end();return;}
  let file=path.resolve(root,relative);if(path.relative(root,file).startsWith('..'))throw Error('Invalid path');
  if(statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!mime[path.extname(file)]){res.writeHead(404);res.end();return;}
  let body=readFileSync(file);
  if(file.endsWith('.html'))body=Buffer.from(body.toString('utf8').replace(/(<body[^>]*>)/,'$1<aside class="test-site-banner">LOCAL REVIEW · Synthetic trip information · Changes not released</aside>'));
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]});res.end(body);
 }catch{res.writeHead(404);res.end('This local review route is unavailable.');}
}).listen(port,'127.0.0.1',()=>console.log(`Mexico review: http://localhost:${port}/trips/mexico-city/ | Ministry: /trips/mexico-city/gods-kitchen/ | Traveler: /journey/`));
