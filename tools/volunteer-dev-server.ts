import {createServer} from 'node:http';
import {readFileSync,statSync} from 'node:fs';
import path from 'node:path';
import {ministryFixture} from '../cloudflare/interest-worker/test/ministry-fixture';
import {handleVolunteer} from '../cloudflare/interest-worker/src/volunteer';
import {handleAdminRequest,hashText} from '../cloudflare/interest-worker/src/admin';
import {signatureKey} from '../cloudflare/interest-worker/src/gift-thanks';
const root=process.cwd();
const f=await ministryFixture(undefined,{databasePath:process.env.HS_VOLUNTEER_PREVIEW_DB});Object.assign(f.env,{ENVIRONMENT:'test',ADMIN_PASSWORD:'Runtime!Password123',ADMIN_SESSION_SECRET:'qa-only-secret-at-least-thirty-two-characters'});
f.files.set(signatureKey,new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')));
let volunteer=f.sqlite.prepare("SELECT id FROM mmt_users WHERE username='samplevolunteer' AND deleted_at IS NULL").get() as {id:string}|undefined;
if(!volunteer){const result=await handleAdminRequest(f.request('/admin/account/users',{username:'samplevolunteer',first_name:'Sample',last_name:'Volunteer',email:'sample@example.test',phone:'9725550198',country:'US',volunteer_access:true,memberships:{hs:{enabled:false}}}),f.env,'/admin/account/users');volunteer=(await result.json() as any).user;}
if(!volunteer)throw Error('Unable to prepare the local sample volunteer.');
f.sqlite.prepare('UPDATE mmt_users SET must_change_password=0 WHERE id=?').run(volunteer.id);
const volunteerToken='v'.repeat(48);f.sqlite.prepare("INSERT INTO admin_sessions(id,token_hash,csrf_token,created_at,expires_at,last_seen_at,user_id) VALUES('qa-volunteer',?,'volunteer-csrf','2026','2099-01-01','2026',?) ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at,user_id=excluded.user_id").run(await hashText(volunteerToken),volunteer.id);
let actor='admin'; export function setActor(value:string){actor=value;}
export async function serve(req:any,res:any){try{res.setHeader('Cache-Control','no-store');const url=new URL(req.url||'/','http://127.0.0.1'),pathname=url.pathname;if(pathname==='/qa/actor'){actor=url.searchParams.get('value')||'admin';res.end('ok');return;}
 if(pathname.startsWith('/api/interest/')){const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks),headers=new Headers(req.headers as any);headers.set('cookie','hs_admin_session='+(actor==='admin'?f.token:volunteerToken));const request=new Request(url,{method:req.method,headers,...(body.length?{body}: {})}),p=pathname.replace('/api/interest','');const response=p.startsWith('/admin/volunteer')?await handleVolunteer(request,f.env,p):await handleAdminRequest(request,f.env,p);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
 let file=path.resolve(root,'.'+decodeURIComponent(pathname));if(!file.startsWith(root+path.sep))throw Error();if(statSync(file).isDirectory())file=path.join(file,'index.html');res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg'} as any)[path.extname(file)]||'application/octet-stream');res.end(readFileSync(file));
 }catch(error){console.error(error);res.writeHead(500);res.end('QA request failed');}}
