// Loopback-only review, isolated SQLite, no hosted records or outgoing messages.
import {createServer} from 'node:http';
import {readFileSync,statSync} from 'node:fs';
import path from 'node:path';
import {ministryFixture} from '../cloudflare/interest-worker/test/ministry-fixture';
import worker from '../cloudflare/interest-worker/src/index';
const root=process.cwd(),port=8798,f=await ministryFixture(undefined,{databasePath:path.join(root,'.tmp/discovery-preview.sqlite')});
const env={...f.env,ALLOWED_ORIGINS:'http://localhost:*,http://127.0.0.1:*',ENVIRONMENT:'test',ADMIN_PASSWORD:'LocalReviewOnly!123',ADMIN_SESSION_SECRET:'local-review-only-secret-at-least-thirty-two-characters'} as any;
f.sqlite.exec("INSERT OR IGNORE INTO people(id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,created_at,updated_at) VALUES('discovery-demo','Sample','Visitor','sample','visitor','visitor@example.test','visitor@example.test','2026-11-20','2026-11-20'); INSERT OR IGNORE INTO traveler_profiles(person_id,details_json,revision,updated_at) VALUES('discovery-demo','{\"ageRange\":\"41+\",\"occupation\":\"Sample teacher\"}',0,'2026-11-20')");
const entries=new Set(['index.html','styles.css','script.js','discovery.js','discovery.css','trip.js','destinations-public.js','phone-ui.js','experience.js','experience.css','admin','assets','trips','trip','destination','past-trips','resources','knowledge','interest','schedule','about','partners','explore','discover','groups','internships','students','giving','corporate-journeys','faq']);
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
createServer(async(req,res)=>{try{
 const url=new URL(req.url||'/',`http://localhost:${port}`),route=decodeURIComponent(url.pathname);res.setHeader('Cache-Control','no-store');
 if(route.startsWith('/api/interest/')){
  const endpoint=route.replace('/api/interest',''),allowed=endpoint==='/public/discovery'||endpoint.startsWith('/public/destinations')||endpoint.startsWith('/public/trips')||endpoint==='/admin/session'||endpoint==='/admin/discovery-self'||endpoint==='/admin/discovery'||endpoint.startsWith('/admin/discovery/');
  if(!allowed){res.writeHead(404);res.end();return;}
  // Preview staff view is a local fixture; public interviews remain anonymous.
  const chunks:Buffer[]=[];let size=0;for await(const c of req){size+=c.length;if(size>32768){res.writeHead(413);res.end();return;}chunks.push(c);}
  const response=await worker.fetch(new Request(url,{method:req.method,headers:{'content-type':'application/json',...(endpoint.startsWith('/admin/')&&endpoint!=='/admin/discovery-self'?{cookie:'hs_admin_session='+f.token}:{}),...(req.headers['x-csrf-token']?{'x-csrf-token':String(req.headers['x-csrf-token'])}:{})},...(['GET','HEAD'].includes(req.method||'GET')?{}:{body:Buffer.concat(chunks)})}) as any,env);
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 if(req.method!=='GET'){res.writeHead(405);res.end();return;}
 const relative=route.replace(/^\//,'')||'index.html';if(!entries.has(relative.split('/')[0]))throw Error();
 let file=path.resolve(root,relative);if(path.relative(root,file).startsWith('..'))throw Error();if(statSync(file).isDirectory())file=path.join(file,'index.html');if(!mime[path.extname(file)])throw Error();
 let body=readFileSync(file);if(file.endsWith('.html'))body=Buffer.from(body.toString().replace(/(<body[^>]*>)/,'$1<aside class="test-site-banner">LOCAL REVIEW · Sample portal access · Answers stay in a local test database</aside>'));
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]});res.end(body);
 }catch{res.writeHead(404);res.end('Local review route unavailable.');}
}).listen(port,'127.0.0.1',()=>console.log(`Discovery preview: http://localhost:${port}/ · Staff: http://localhost:${port}/admin/discovery/`));
