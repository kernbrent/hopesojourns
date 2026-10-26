// Local review only: synthetic records, automatic local admin session, no live services.
// Never include this tool, its database or test fixtures in a public build.
import {createServer} from 'node:http';
import {readFileSync,statSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {ministryFixture} from '../cloudflare/interest-worker/test/ministry-fixture';
import {handleAdminRequest} from '../cloudflare/interest-worker/src/admin';
import {handleTripAdminRequest} from '../cloudflare/interest-worker/src/trip-platform';
import {signatureKey} from '../cloudflare/interest-worker/src/gift-thanks';
import {handleMinistryAdminRequest} from '../cloudflare/interest-worker/src/ministry-admin';
import {handlePlanning} from '../cloudflare/interest-worker/src/planning';
import {openTravelerEmail} from '../cloudflare/interest-worker/src/traveler-email-payload';
import {handleTravelerVetting} from '../cloudflare/interest-worker/src/traveler-vetting';
const root=process.cwd();mkdirSync('.tmp',{recursive:true});
const f=await ministryFixture(undefined,{databasePath:path.resolve(process.env.HS_VETTING_DB||'.tmp/traveler-vetting-preview-v2.sqlite')});
try { f.files.set(signatureKey,new Uint8Array(readFileSync('.tmp/volunteer-release-7b527239/private-checks/test-signature.png'))); } catch { f.files.set(signatureKey,new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'))); }
Object.assign(f.env,{ENVIRONMENT:'test',ADMIN_SESSION_SECRET:'local-preview-only-secret-32-characters',ADMIN_PASSWORD:'LocalPreview!2026'});
const trip= f.sqlite.prepare("SELECT id FROM trips WHERE code='VETTING-LOCAL'").get() as {id:string}|undefined;
let tripId=trip?.id;
if(!tripId){const opportunity=f.sqlite.prepare("SELECT id FROM opportunities WHERE kind='trip' LIMIT 1").get()!.id;
 const r=await handleTripAdminRequest(f.request('/admin/trips',{code:'VETTING-LOCAL',title:'England · Traveler workflow review',location:'England',startDate:'2027-07-10',endDate:'2027-07-17',opportunityId:opportunity}),f.env,'/admin/trips');const result=await r.json() as any;if(!result.id)throw Error(JSON.stringify(result));tripId=result.id;
 for(const [i,name] of ['Alice Sample','Ben Sample','Caroline Sample','David Sample','Elena Sample','Frank Sample','Grace Sample','Henry Sample'].entries()){
  const id=crypto.randomUUID(),[first,last]=name.split(' ');f.sqlite.prepare("INSERT INTO people(id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'2026-10-25','2026-10-25')").run(id,first,last,first.toLowerCase(),last.toLowerCase(),first.toLowerCase()+'@example.test',first.toLowerCase()+'@example.test');f.sqlite.prepare("UPDATE people SET country='US' WHERE id=?").run(id);f.sqlite.prepare("INSERT INTO contact_types VALUES(?,'prospective_traveler','2026-10-25')").run(id);f.sqlite.prepare("INSERT INTO contact_trips VALUES(?,?,'2026-10-25')").run(id,opportunity);
  const stage=['received','received','contacted','application','review','approved','confirmed','waitlisted'][i];
  if(stage!=='received'){const skipped=['review','approved','confirmed'].includes(stage);f.sqlite.prepare("INSERT INTO traveler_workflows(trip_id,person_id,stage,application_status,skip_reason,owner_note,next_follow_up,updated_at) VALUES(?,?,?,?,?,?,?,'2026-10-25')").run(tripId,id,stage,skipped?'skipped':stage==='application'?'requested':'not_requested',skipped?'Previous traveler — local example':'',i===2?'Call to discuss timing':'','2026-10-28');}
 }
}
export async function capturedApplicationLink(personId:string){const mail=f.sqlite.prepare("SELECT payload_json FROM traveler_application_emails WHERE person_id=? AND status='captured' ORDER BY updated_at DESC,id DESC LIMIT 1").get(personId);if(!mail)throw Error('No captured application invitation.');const payload=await openTravelerEmail(f.env,String(mail.payload_json)),url=payload.text.match(/https?:\/\/[^\s]+\/application\/#[a-f0-9]{64}/)?.[0];if(!url)throw Error('The captured invitation has no application link.');return url;}
export function reviewPath(){return "/admin/trips/?view=vetting&trip="+tripId;}
export async function serve(req:any,res:any){res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');try{const url=new URL(req.url||'/','http://localhost:4190'),pathname=url.pathname;
 if(pathname==='/'){res.writeHead(302,{Location:'/admin/trips/?view=vetting&trip='+tripId});res.end();return;}
 if(pathname.startsWith('/api/interest/')){const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks),headers=new Headers(req.headers as any),p=pathname.replace('/api/interest','');if(p.startsWith('/admin/'))headers.set('cookie','hs_admin_session='+f.token);const request=new Request(url,{method:req.method,headers,...(body.length?{body}: {})});const response=p.startsWith('/admin/traveler-profiles/')||p==='/public/traveler-application'?await handleTravelerVetting(request,f.env,p):p.startsWith('/admin/ministry/')?await handleMinistryAdminRequest(request,f.env,p):p.startsWith('/admin/planning/')?await handlePlanning(request,f.env,p):p.startsWith('/admin/trips')||p.startsWith('/admin/trip-platform')?await handleTripAdminRequest(request,f.env,p):await handleAdminRequest(request,f.env,p);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
 // Only serve the app's static assets; never serve local databases, guides or source.
 if(!/^\/(admin\/|application\/|journey\/|assets\/|styles\.css$|script\.js$|phone-ui\.js$|favicon)/.test(pathname)){res.writeHead(404);res.end();return;}
 let file=path.resolve(root,'.'+decodeURIComponent(pathname));if(!file.startsWith(root+path.sep))throw Error('Invalid path');if(statSync(file).isDirectory())file=path.join(file,'index.html');if(pathname!=='/admin/version.json'&&!['.html','.css','.js','.png','.jpg','.jpeg','.svg','.webp','.ico','.woff2'].includes(path.extname(file)))throw Error('Unsupported asset');const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp'};res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');let content=readFileSync(file);if(path.extname(file)==='.html')content=Buffer.from(content.toString().replace('<body','<body').replace(/(<body[^>]*>)/,'$1<div class="local-vetting-banner">LOCAL REVIEW · Sample records only · No live emails or investigations</div>'));res.end(content);
 }catch(error){console.error(error);res.writeHead(404);res.end('Local preview request failed.');}}
if(process.env.HS_VETTING_NO_LISTEN!=='1')createServer(serve).listen(4190,'127.0.0.1',()=>console.log('LOCAL_REVIEW=http://localhost:4190/admin/trips/?trip='+tripId));
