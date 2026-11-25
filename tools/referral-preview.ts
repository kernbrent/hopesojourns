// Local review only. All writes stay in a separate SQLite file; no provider calls.
import {createServer} from 'node:http';
import {readFileSync,statSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {ministryFixture} from '../cloudflare/interest-worker/test/ministry-fixture';
import worker from '../cloudflare/interest-worker/src/index';
const root=process.cwd(),port=4193;
mkdirSync('.tmp',{recursive:true});
const f=await ministryFixture(undefined,{databasePath:path.join(root,'.tmp/referral-preview.sqlite')});
const env={...f.env,ALLOWED_ORIGINS:`http://localhost:${port},http://127.0.0.1:${port}`,ENVIRONMENT:'test',ADMIN_PASSWORD:'LocalReviewOnly!123',ADMIN_SESSION_SECRET:'local-review-only-secret-at-least-thirty-two-characters'} as any;
f.sqlite.exec("INSERT OR IGNORE INTO trips(id,code,slug,title,location,status,public_enabled,interest_enabled,public_summary,created_at,updated_at) VALUES('mission-local','MISSION-LOCAL','mission-local','Local mission journey','Example destination','recruiting',1,1,'Local fixture for shared trip template review','2026-11-24','2026-11-24')");
globalThis.fetch=async()=>{throw Error('External requests are disabled in this local preview.');};
const entries=new Set(['index.html','styles.css','script.js','discovery.js','discovery.css','phone-ui.js','destinations-public.js','experience.css','experience.js','trip.js','interest','admin','assets','knowledge','trips','trip','destination','schedule','about','resources','mission-journey','journey','past-trips']);
const previewFiles=new Set(['preview/referral-review/session.js']);
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
createServer(async(req,res)=>{try{
 const url=new URL(req.url||'/',`http://localhost:${port}`),route=decodeURIComponent(url.pathname);res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
 if(route.startsWith('/api/interest/')){
  const endpoint=route.replace('/api/interest',''),read=['GET','HEAD'].includes(req.method||'GET');
  const allowed=read?(endpoint==='/health'||endpoint.startsWith('/public/destinations')||endpoint.startsWith('/public/trips')||endpoint.startsWith('/admin/')):req.method==='POST'&&(endpoint==='/submissions'||endpoint==='/public/mission-preparation'||/^\/admin\/mission-preparation\/[^/]+\/(review|retry)$/.test(endpoint)||/^\/admin\/interest-reviews\/[^/]+$/.test(endpoint));
  if(!allowed){res.writeHead(405);res.end('This local preview does not enable that action.');return;}
  const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>32768){res.writeHead(413);res.end();return;}chunks.push(chunk);}
  const headers:Record<string,string>={'content-type':'application/json',origin:String(req.headers.origin||`http://localhost:${port}`)};
  if(req.headers.referer)headers.referer=String(req.headers.referer);
  if(req.headers['idempotency-key'])headers['idempotency-key']=String(req.headers['idempotency-key']);
  if(endpoint.startsWith('/admin/'))headers.cookie='hs_admin_session='+f.token;
  if(req.headers['x-csrf-token'])headers['x-csrf-token']=String(req.headers['x-csrf-token']);
  const response=await worker.fetch(new Request(url,{method:req.method,headers,...(read?{}:{body:Buffer.concat(chunks)})}) as any,env);
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 if(!['GET','HEAD'].includes(req.method||'GET')){res.writeHead(405);res.end();return;}
 let relative=route.replace(/^\//,'')||'index.html';
 if(!entries.has(relative.split('/')[0])&&!previewFiles.has(relative))throw Error();
 let file=path.resolve(root,relative);if(path.relative(root,file).startsWith('..')||path.isAbsolute(path.relative(root,file)))throw Error();
 if(statSync(file).isDirectory())file=path.join(file,'index.html');if(!mime[path.extname(file)])throw Error();
 let body=readFileSync(file);
 if(file.endsWith('.html')){
  let html=body.toString().replace(/(<body[^>]*>)/,'$1<aside class="test-site-banner">LOCAL REVIEW · Separate test records · Email captured only · <a href="/interest/">Interest form</a> · <a href="/admin/#requests">Local MMT inquiries</a> · <a href="/">Homepage concept</a></aside>');
  if(relative==='interest/'||relative==='interest/index.html')html=html.replace('data-interest-api-base="/api/interest"','data-interest-api-base="/api/interest" data-local-interest-api-base="/api/interest"');
  if(relative==='admin/'||relative==='admin/index.html')html=html.replace('</head>','<script src="/preview/referral-review/session.js" defer></script></head>');

  body=Buffer.from(html);
 }
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]});res.end(req.method==='HEAD'?undefined:body);
 }catch(error){res.writeHead(404);res.end('Local review route unavailable.');}
}).listen(port,'127.0.0.1',()=>console.log(`Referral review: http://localhost:${port}/interest/ · Homepage concept: http://localhost:${port}/ · Local MMT: http://localhost:${port}/admin/#requests`));
