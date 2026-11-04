// Loopback-only local test portal. Synthetic data; no deployed services or secrets.
import {createServer} from 'node:http';
import {readFileSync,statSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {ministryFixture} from '../cloudflare/interest-worker/test/ministry-fixture';
import {handleAdminRequest} from '../cloudflare/interest-worker/src/admin';
import {handleMinistryAdminRequest} from '../cloudflare/interest-worker/src/ministry-admin';
import {handlePlanning} from '../cloudflare/interest-worker/src/planning';
import {handleMeetings} from '../cloudflare/interest-worker/src/meetings';
const root=process.cwd();mkdirSync('.tmp/meetings',{recursive:true});
const f=await ministryFixture(undefined,{databasePath:path.resolve('.tmp/meetings/local-v2.sqlite')});
Object.assign(f.env,{ENVIRONMENT:'test',ADMIN_SESSION_SECRET:'local-meetings-only-session-secret',ADMIN_PASSWORD:'local-meetings-only-password',EMAIL_DELIVERY_MODE:'capture',MMT_EMAIL_DELIVERY_MODE:'capture',SHARED_SIGNIN:'disabled'});
if(!f.sqlite.prepare("SELECT id FROM ministries WHERE name_normalized='sample ministry abc'").get()){
 const ministry=crypto.randomUUID();f.sqlite.prepare("INSERT INTO ministries(id,name,name_normalized,created_at,updated_at) VALUES(?,'Sample Ministry ABC','sample ministry abc','now','now')").run(ministry);
 const participants=[];
 for(const first of ['Scott','Blake']){const id=crypto.randomUUID();f.sqlite.prepare("INSERT INTO people(id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,created_at,updated_at) VALUES(?,?,'Sample',?,'sample',?,?,'now','now')").run(id,first,first.toLowerCase(),first.toLowerCase()+'@example.test',first.toLowerCase()+'@example.test');f.sqlite.prepare("INSERT INTO ministry_contacts(ministry_id,person_id,created_at,updated_at) VALUES(?,?,'now','now')").run(ministry,id);participants.push({kind:'person',id});}
 const start=new Date();start.setDate(start.getDate()+2);start.setHours(15,0,0,0);const end=new Date(+start+3600000),id=crypto.randomUUID();
 const response=await handleMeetings(f.request('/admin/meetings',{id,operationId:crypto.randomUUID(),title:'Sample coffee and introductions',meeting_type:'Coffee',starts_at:start.toISOString(),ends_at:end.toISOString(),location_name:'Sample Coffee House',street_address:'9400 Example Road, McKinney, TX',participants:[...participants,{kind:'ministry',id:ministry}],notes:'Synthetic example. Add another participant, record a held meeting, or track an introduction.',introductions:[{id:crypto.randomUUID(),introducers:[participants[0]],pending_name:'Community outreach coordinator (name pending)',status:'promised',next_action:'Ask Scott for the name'}],tasks:[{id:crypto.randomUUID(),title:'Send meeting agenda',status:'open',direction:'mine',owner_id:'primary'}]}),f.env,'/admin/meetings');if(!response.ok)throw Error(await response.text());
}
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.ico':'image/x-icon'};
createServer(async(req,res)=>{res.setHeader('Cache-Control','no-store');try{
 const url=new URL(req.url||'/','http://localhost:4192');if(req.headers.host&&!['localhost:4192','127.0.0.1:4192'].includes(req.headers.host)){res.writeHead(403);res.end();return;}
 if(req.headers.origin&&!['http://localhost:4192','http://127.0.0.1:4192'].includes(req.headers.origin)){res.writeHead(403);res.end();return;}
 if(url.pathname==='/'){res.writeHead(302,{Location:'/admin/meetings/'});res.end();return;}
 if(url.pathname.startsWith('/api/interest/')){const p=url.pathname.slice('/api/interest'.length);const chunks=[];let length=0;for await(const c of req){length+=c.length;if(length>32768){res.writeHead(413);res.end('Request too large');return;}chunks.push(c);}const body=Buffer.concat(chunks),headers=new Headers(req.headers as any);headers.set('cookie','hs_admin_session='+f.token);const request=new Request(url,{method:req.method,headers,...(body.length?{body}:{})});
 // Explicit local allowlist; outbound-email, finance and destructive account routes are unavailable.
 let response:Response;
 if(p==='/admin/meetings'||p.startsWith('/admin/meetings/'))response=await handleMeetings(request,f.env,p);
 else if(p.startsWith('/admin/planning/'))response=await handlePlanning(request,f.env,p);
 else if(p==='/admin/ministry/inbox')response=await handleMinistryAdminRequest(request,f.env,p);
 else if(p==='/admin/session'||p==='/admin/people'||/^\/admin\/people\/[a-f\d-]{36}(\/relationships)?$/i.test(p)||p==='/admin/ministries'||/^\/admin\/ministries\/[a-f\d-]{36}$/i.test(p)||p==='/admin/stats'||p==='/admin/options')response=await handleAdminRequest(request,f.env,p);
 else response=new Response(JSON.stringify({error:'This route is not enabled in the local meeting preview.'}),{status:404,headers:{'Content-Type':'application/json'}});
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
 if(!/^\/(admin\/|assets\/|styles\.css$|phone-ui\.js$|script\.js$|favicon)/.test(url.pathname))throw Error('Unsupported asset');
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))throw Error('Invalid path');if(statSync(file).isDirectory())file=path.join(file,'index.html');const ext=path.extname(file);if(!mime[ext]||ext==='.json'&&url.pathname!=='/admin/version.json')throw Error('Unsupported asset');res.setHeader('Content-Type',mime[ext]);res.end(readFileSync(file));
 }catch(e){console.error(e instanceof Error?e.message:'Local preview error');res.writeHead(404);res.end('Local preview request failed.');}
}).listen(4192,'127.0.0.1',()=>console.log('LOCAL_REVIEW=http://localhost:4192/admin/meetings/'));
