// Isolated loopback preview. No hosted credentials or mail integrations.
import {createServer} from 'node:http';
import {readFileSync,statSync} from 'node:fs';
import path from 'node:path';
import {ministryFixture} from '../cloudflare/interest-worker/test/ministry-fixture';
import worker from '../cloudflare/interest-worker/src/index';
const root=process.cwd(),port=8787,f=await ministryFixture();
const env={...f.env,ALLOWED_ORIGINS:'http://localhost:*,http://127.0.0.1:*',ENVIRONMENT:'test'} as any;
const entries=new Set(['index.html','styles.css','script.js','trip.js','destinations-public.js','phone-ui.js','experience.js','experience.css','assets','trips','trip','destination','past-trips','resources','knowledge','interest','schedule','about','partners','explore','discover','groups','internships','students','credits','giving','corporate-journeys']);
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
createServer(async(req,res)=>{
 try{
  const url=new URL(req.url||'/',`http://localhost:${port}`),route=decodeURIComponent(url.pathname);
  res.setHeader('Cache-Control','no-store');
  if(route.startsWith('/api/interest/')||['/opportunities','/submissions'].includes(route)){
   const endpoint=route.replace('/api/interest','');
   if(!['/opportunities','/submissions'].includes(endpoint)&&!endpoint.startsWith('/public/destinations')&&!endpoint.startsWith('/public/trip-stories')&&!endpoint.startsWith('/public/trips')){res.writeHead(404);res.end();return;}
   const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>32768){res.writeHead(413);res.end();return;}chunks.push(chunk);}
   const response=await worker.fetch(new Request(`http://localhost:${port}/api/interest${endpoint}${url.search}`,{method:req.method,headers:{'content-type':'application/json',...(req.headers.origin?{origin:req.headers.origin}:{})},...(['GET','HEAD','OPTIONS'].includes(req.method||'GET')?{}:{body:Buffer.concat(chunks)})}) as any,env);
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  const relative=route.replace(/^\//,'')||'index.html';if(!entries.has(relative.split('/')[0]))throw Error();
  let file=path.resolve(root,relative);if(path.relative(root,file).startsWith('..'))throw Error();if(statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!mime[path.extname(file)])throw Error();let body=readFileSync(file);
  if(file.endsWith('.html'))body=Buffer.from(body.toString().replace(/(<body[^>]*>)/,'$1<aside class="test-site-banner">LOCAL REVIEW · Inquiries stay in memory · No hosted records or email</aside>'));
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]});res.end(body);
 }catch{res.writeHead(404);res.end('Local review route unavailable.');}
}).listen(port,'127.0.0.1',()=>console.log(`Journey preview: http://localhost:${port}/trips/camino-de-santiago/`));
