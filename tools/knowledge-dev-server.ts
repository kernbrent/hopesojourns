// Local QA only. Uses an in-memory database and a synthetic signed-in administrator.
// Never include this file, fixture, or server in a public site build.
import {createServer} from 'node:http';
import {readFileSync,statSync} from 'node:fs';
import path from 'node:path';
import {ministryFixture} from '../cloudflare/interest-worker/test/ministry-fixture';
import {handleKnowledge,seedKnowledge} from '../cloudflare/interest-worker/src/knowledge';
const root=process.cwd();
async function start(){const f=await ministryFixture();await seedKnowledge(f.env);
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url||'/','http://localhost'),pathname=url.pathname;
 if(pathname.startsWith('/api/interest/')){
  if(pathname==='/api/interest/admin/session'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({csrfToken:f.csrf,user:{is_admin:true,permissions:{},must_change_password:false}}));return;}
  const parts=[];for await(const part of req)parts.push(part);const body=Buffer.concat(parts);
  const headers=new Headers(req.headers as any);if(pathname.includes('/admin/'))headers.set('cookie','hs_admin_session='+f.token);
  const request=new Request(url,{method:req.method,headers,...(body.length?{body}: {})});
  const response=await handleKnowledge(request,f.env,pathname.replace('/api/interest',''));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 let file=path.resolve(root,'.'+decodeURIComponent(pathname));if(!file.startsWith(root+path.sep))throw Error();if(statSync(file).isDirectory())file=path.join(file,'index.html');
 const mime:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json'};
 res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(readFileSync(file));
 }catch{res.writeHead(404);res.end('Not found');}});
 server.listen(0,'127.0.0.1',()=>console.log('QA_ORIGIN=http://127.0.0.1:'+(server.address() as any).port));
}start();
