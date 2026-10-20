import {Buffer} from 'node:buffer';
import {AdminError,adminJson,authenticate,auditStatement,readAdminJson,type AdminEnv} from './admin';
import {currentPortal,type MmtIdentity} from './mmt-permissions';
import {signatureKey} from './gift-thanks';
import {volunteerReport,type ServiceEntry,type VolunteerSnapshot} from './volunteer-report';

type Org={id:string;name:string;ministry_id:string|null;classification:string;active:number;revision:number};
type Month={user_id:string;month:string;entries_json:string;status:string;revision:number;review_note:string;report_request_json:string|null};
type Report={id:string;user_id:string;start_date:string;end_date:string;period_label:string;version:number;snapshot_json:string;html:string;text:string;created_at:string};
type Delivery={id:string;status:string;payload_json:string;attempt_key:string;created_at:string;updated_at:string};
const now=()=>new Date().toISOString();
function fail(message:string,status=422):never{throw new AdminError(status,'VOLUNTEER_ERROR',message);}
const plain=(v:unknown,max=250)=>{if(typeof v!=='string'||!v.trim()||v.length>max||/[\u0000-\u001f]/.test(v))return fail('Complete required fields using plain text.');return v.trim();};
export function dateOnly(v:unknown){const s=plain(v,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T12:00:00Z'))||new Date(s+'T12:00:00Z').toISOString().slice(0,10)!==s)fail('Choose a valid calendar date.');return s;}
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function hourTenths(v:unknown){if(!/^(?:0|[1-9]\d?)(?:\.\d)?$/.test(String(v)))fail('Enter hours with no more than one decimal place, such as 1.2.');const t=Math.round(Number(v)*10);if(t<1||t>240)fail('Hours must be between 0.1 and 24.0 per entry.');return t;}
export function recipientEmails(v:unknown){if(!Array.isArray(v)||v.length>3)fail('Enter up to three recipient email addresses.');return [...new Set((v as unknown[]).map(x=>{const e=plain(x,254).toLowerCase();if(!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e))fail('Enter valid recipient email addresses.');return e;}))];}
const monthKey=(v:unknown)=>{const s=plain(v,7);dateOnly(s+'-01');return s;};
function owner(actor:MmtIdentity,value:unknown){const id=value?plain(value,100):actor.id;if(id!==actor.id&&!actor.is_admin)fail('You can access only your own volunteer records.',403);return id;}
async function allowedOrganizations(env:AdminEnv,id:string){return (await env.DB.prepare(`SELECT o.id,o.name,o.ministry_id,o.classification,o.active,o.revision FROM volunteer_organizations o WHERE o.active=1 AND (NOT EXISTS(SELECT 1 FROM volunteer_org_access WHERE user_id=?) OR EXISTS(SELECT 1 FROM volunteer_org_access a WHERE a.user_id=? AND a.organization_id=o.id)) ORDER BY o.name`).bind(id,id).all<Org>()).results;}
async function identity(env:AdminEnv,id:string){const u=await env.DB.prepare("SELECT * FROM mmt_users WHERE id=? AND deleted_at IS NULL").bind(id).first<MmtIdentity>();if(!u)fail('Volunteer account not found.',404);return u!;}
async function signature(env:AdminEnv){const obj=await env.RECEIPTS.get(signatureKey);if(!obj||obj.size>500000)fail('Configure the giving-email signature before issuing certified reports.',503);return Buffer.from(await new Response(obj!.body).arrayBuffer()).toString('base64');}
function reportOptions(b:Record<string,unknown>){const start=dateOnly(b.start),end=dateOnly(b.end);if(end<start||Date.parse(end)-Date.parse(start)>365*86400000)fail('Choose a reporting period of up to one year.');return {start,end,label:plain(b.label,100),organizationId:plain(b.organizationId,100),recipients:recipientEmails(b.recipients),requestId:plain(b.requestId,100)};}
async function issueReport(env:AdminEnv,actor:MmtIdentity,id:string,b:Record<string,unknown>){
 const opts=reportOptions(b);if(!/^[a-zA-Z0-9-]{20,100}$/.test(opts.requestId))fail('Refresh the report form and try again.');
 const prior=await env.DB.prepare('SELECT * FROM volunteer_reports WHERE id=?').bind(opts.requestId).first<Report>();
 if(prior){if(prior.user_id!==id)fail('Report identifier is already in use.',409);return prior;}
 const org=(await allowedOrganizations(env,id)).find(o=>o.id===opts.organizationId);if(!org)fail('Choose an organization permitted for this volunteer.',403);
 const u=await identity(env,id),months=(await env.DB.prepare('SELECT * FROM volunteer_months WHERE user_id=? AND month>=? AND month<=? ORDER BY month').bind(id,opts.start.slice(0,7),opts.end.slice(0,7)).all<Month>()).results;
 const entries:ServiceEntry[]=[];
 for(const m of months){const relevant=(JSON.parse(m.entries_json) as ServiceEntry[]).filter(e=>e.date>=opts.start&&e.date<=opts.end);if(relevant.length&&m.status!=='approved')fail(`Have an administrator approve ${m.month} before issuing this report.`);entries.push(...relevant);}
 if(!entries.length)fail('There are no approved hours in this period.');
 entries.sort((a,b)=>a.date.localeCompare(b.date)||a.activity.localeCompare(b.activity));
 const previous=await env.DB.prepare('SELECT MAX(version) AS version FROM volunteer_reports WHERE user_id=? AND start_date=? AND end_date=? AND json_extract(snapshot_json,\'$.organizationId\')=?').bind(id,opts.start,opts.end,org.id).first<{version:number}>();
 const snap:VolunteerSnapshot={name:u.first_name+' '+u.last_name,email:u.email,organization:org.name,organizationId:org.id,start:opts.start,end:opts.end,label:opts.label,entries,issued:now(),id:opts.requestId,version:(previous?.version||0)+1};
 const sig=await signature(env),content=volunteerReport(snap,'cid:brent-signature');
 // Guard approved revisions in the same transaction as the immutable snapshot.
 const guard=crypto.randomUUID(),statements:D1PreparedStatement[]=[];
 for(const m of months)statements.push(env.DB.prepare('INSERT INTO portal_contact_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM volunteer_months WHERE user_id=? AND month=? AND revision=? AND status=?) THEN 1 ELSE 0 END').bind(guard+m.month,id,m.month,m.revision,m.status));
 statements.push(env.DB.prepare('INSERT INTO volunteer_reports(id,user_id,start_date,end_date,period_label,version,snapshot_json,html,text,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(snap.id,id,snap.start,snap.end,snap.label,snap.version,JSON.stringify(snap),content.html.replace('cid:brent-signature','data:image/png;base64,'+sig),content.text,snap.issued,actor.id));
 for(const recipient of opts.recipients){const deliveryId=crypto.randomUUID(),payload={from:'Hope Sojourns <admin@hopesojourns.com>',to:[recipient],cc:[...new Set([u.email.toLowerCase(),'admin@hopesojourns.com'])].filter(e=>e!==recipient),reply_to:'admin@hopesojourns.com',...content,attachments:[{filename:'brent-kern-signature.png',content:sig,content_id:'brent-signature'}]};delete (payload as Partial<typeof payload>).totalTenths;statements.push(env.DB.prepare("INSERT INTO volunteer_deliveries(id,report_id,recipient,status,payload_json,attempt_key,created_at,updated_at) VALUES(?,?,?,'failed',?,?,?,?)").bind(deliveryId,snap.id,recipient,JSON.stringify(payload),'volunteer-'+deliveryId,snap.issued,snap.issued));}
 for(const m of months)statements.push(env.DB.prepare('DELETE FROM portal_contact_guards WHERE id=?').bind(guard+m.month));
 statements.push(auditStatement(env,'volunteer_report',snap.id,'issued',{userId:id,start:snap.start,end:snap.end,version:snap.version}));
 await env.DB.batch(statements);
 return (await env.DB.prepare('SELECT * FROM volunteer_reports WHERE id=?').bind(snap.id).first<Report>())!;
}
async function deliver(env:AdminEnv,d:Delivery){
 if(['sent','captured','verified_not_sent'].includes(d.status))return;
 if(['sending','uncertain'].includes(d.status)&&Date.now()-Date.parse(d.created_at)>23*3600000)fail('Ask an administrator to verify delivery with the email provider before another attempt.',409);
 if(d.status==='sending'&&Date.now()-Date.parse(d.updated_at)<60000)fail('This email is already sending.',409);
 const claim=await env.DB.prepare("UPDATE volunteer_deliveries SET status='sending',updated_at=? WHERE id=? AND status=? AND updated_at=?").bind(now(),d.id,d.status,d.updated_at).run();if(!claim.meta.changes)fail('Another request is handling this email.',409);
 let status='captured',error:string|null=null,providerId:string|null=null;
 if(env.ENVIRONMENT!=='test'){
  status='failed';
  if(env.MMT_EMAIL_PROVIDER!=='resend'||env.MMT_EMAIL_DELIVERY_MODE!=='live'||!env.RESEND_API_KEY)error='Volunteer email delivery is not configured.';
  else {status='uncertain';try{const r=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':d.attempt_key},body:d.payload_json});if(r.ok){providerId=(await r.json() as {id?:string}).id||null;status='sent';}else {status='failed';error='Email provider rejected this message.';await r.body?.cancel();}}catch{error='Delivery is uncertain. Retry this same delivery within 23 hours; do not create another report.';}}
 }
 await env.DB.prepare('UPDATE volunteer_deliveries SET status=?,error=?,provider_id=?,updated_at=? WHERE id=?').bind(status,error,providerId,now(),d.id).run();
}
async function sendReport(env:AdminEnv,id:string){const rows=(await env.DB.prepare('SELECT * FROM volunteer_deliveries WHERE report_id=? ORDER BY created_at').bind(id).all<Delivery>()).results;for(const d of rows)await deliver(env,d);}

export async function handleVolunteer(request:Request,env:AdminEnv,path:string):Promise<Response>{
 try{
 const session=await authenticate(request,env,request.method!=='GET'),actor=session.user;
 if(currentPortal()!=='hs'||(!actor.is_admin&&!actor.volunteer_access))fail('Volunteer or HS Administrator access is required.',403);
 const url=new URL(request.url),b=request.method==='GET'?{}:await readAdminJson(request),id=owner(actor,b.userId||url.searchParams.get('userId'));
 const suffix=path.slice('/admin/volunteer'.length);
 const resolve=suffix.match(/^\/deliveries\/([a-zA-Z0-9-]+)\/resolve$/);
 if(resolve&&request.method==='POST'){
  if(!actor.is_admin)fail('Only administrators can resolve uncertain delivery.',403);
  const delivery=await env.DB.prepare('SELECT d.* FROM volunteer_deliveries d WHERE d.id=?').bind(resolve[1]).first<Delivery & {report_id:string;recipient:string}>();
  if(!delivery||!['uncertain','sending','failed'].includes(delivery.status))fail('This delivery no longer needs resolution.',409);
  if(delivery.status==='sending'&&Date.now()-Date.parse(delivery.updated_at)<60000)fail('Wait for the active delivery attempt to finish.',409);
  const note=plain(b.note,1500);if(b.providerVerified!==true||!['sent','not_sent'].includes(String(b.result)))fail('Verify the result with the email provider and record your findings.');
  const resolved=b.result==='sent'?'sent':'verified_not_sent',time=now(),guard=crypto.randomUUID(),statements=[env.DB.prepare('INSERT INTO portal_contact_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM volunteer_deliveries WHERE id=? AND status=? AND updated_at=?) THEN 1 ELSE 0 END').bind(guard,delivery.id,delivery.status,delivery.updated_at),env.DB.prepare('UPDATE volunteer_deliveries SET status=?,error=?,updated_at=? WHERE id=? AND status=? AND updated_at=?').bind(resolved,'Administrator verified: '+note,time,delivery.id,delivery.status,delivery.updated_at)];
  if(resolved==='verified_not_sent'){const fresh=crypto.randomUUID();statements.push(env.DB.prepare("INSERT INTO volunteer_deliveries(id,report_id,recipient,status,payload_json,attempt_key,created_at,updated_at) SELECT ?,report_id,recipient,'failed',payload_json,?,?,? FROM volunteer_deliveries WHERE id=? AND status='verified_not_sent' AND updated_at=?").bind(fresh,'volunteer-'+fresh,time,time,delivery.id,time));}
  statements.push(env.DB.prepare('DELETE FROM portal_contact_guards WHERE id=?').bind(guard),auditStatement(env,'volunteer_delivery',delivery.id,'provider_verified',{result:resolved,note,priorStatus:delivery.status}));await env.DB.batch(statements);return adminJson({saved:true});
 }
 if(suffix===''&&request.method==='GET'){
  const orgs=await allowedOrganizations(env,id),months=await env.DB.prepare('SELECT * FROM volunteer_months WHERE user_id=? ORDER BY month DESC').bind(id).all<Month>();
  const reports=await env.DB.prepare('SELECT id,start_date,end_date,period_label,version,created_at FROM volunteer_reports WHERE user_id=? ORDER BY created_at DESC LIMIT 250').bind(id).all();
  const deliveries=await env.DB.prepare('SELECT d.id,d.report_id,d.recipient,d.status,d.error,d.created_at,d.updated_at FROM volunteer_deliveries d JOIN volunteer_reports r ON r.id=d.report_id WHERE r.user_id=? ORDER BY d.created_at DESC LIMIT 750').bind(id).all();
  const preferences=await env.DB.prepare('SELECT * FROM volunteer_preferences WHERE user_id=?').bind(id).first<{recipients_json:string;revision:number}>();
  let adminData={};if(actor.is_admin){const users=await env.DB.prepare("SELECT id,first_name,last_name,email,volunteer_access,hs_access FROM mmt_users WHERE deleted_at IS NULL AND (volunteer_access=1 OR is_admin=1 OR is_org_admin=1) ORDER BY last_name,first_name").all();const queue=await env.DB.prepare("SELECT m.user_id,m.month,m.revision,u.first_name,u.last_name FROM volunteer_months m JOIN mmt_users u ON u.id=m.user_id WHERE m.status='submitted' ORDER BY m.month,u.last_name").all();const organizations=await env.DB.prepare('SELECT * FROM volunteer_organizations ORDER BY name').all();const assignments=await env.DB.prepare('SELECT organization_id FROM volunteer_org_access WHERE user_id=?').bind(id).all<{organization_id:string}>();adminData={users:users.results,queue:queue.results,allOrganizations:organizations.results,assignments:assignments.results.map(x=>x.organization_id)};}
  return adminJson({userId:id,organizations:orgs.map(({id,name,classification})=>({id,name,classification})),months:months.results.map(m=>({...m,entries:JSON.parse(m.entries_json),entries_json:undefined,reportRequest:m.report_request_json?JSON.parse(m.report_request_json):null,report_request_json:undefined})),reports:reports.results,deliveries:deliveries.results,recipients:preferences?JSON.parse(preferences.recipients_json):[],preferencesRevision:preferences?.revision||0,testMode:env.ENVIRONMENT==='test',...adminData});
 }
 if(suffix==='/preferences'&&request.method==='PUT'){
  const recipients=recipientEmails(b.recipients),revision=Number(b.revision);const r=await env.DB.prepare('INSERT INTO volunteer_preferences(user_id,recipients_json) SELECT ?,? WHERE ?=0 ON CONFLICT(user_id) DO NOTHING').bind(id,JSON.stringify(recipients),revision).run();
  if(!r.meta.changes){const r=await env.DB.prepare('UPDATE volunteer_preferences SET recipients_json=?,revision=revision+1 WHERE user_id=? AND revision=?').bind(JSON.stringify(recipients),id,revision).run();if(!r.meta.changes)fail('Preferences changed. Refresh before saving.',409);}return adminJson({saved:true});
 }
 if(suffix==='/organizations'&&request.method==='POST'){
  if(!actor.is_admin)fail('Only administrators can manage organizations.',403);
  const orgId=b.id?plain(b.id,100):crypto.randomUUID(),name=plain(b.name,180),classification=plain(b.classification,40);if(!['ministry_partner','school','court','government','business','other'].includes(classification))fail('Choose a valid organization classification.');
  const ministryId=b.ministryId?plain(b.ministryId,100):null;if(ministryId&&!await env.DB.prepare('SELECT id FROM ministries WHERE id=?').bind(ministryId).first())fail('Select an existing ministry.');
  if(b.id){const prior=await env.DB.prepare('SELECT * FROM volunteer_organizations WHERE id=?').bind(orgId).first<Org>();if(!prior)fail('Organization not found.',404);if(prior!.ministry_id&&(prior!.name!==name||b.active===false))fail('Edit linked ministry names and active status in Ministries & partners.');const r=await env.DB.prepare('UPDATE volunteer_organizations SET name=?,classification=?,ministry_id=?,active=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').bind(name,classification,ministryId||prior!.ministry_id,b.active===false?0:1,now(),orgId,Number(b.revision)).run();if(!r.meta.changes)fail('Organization changed. Refresh before saving.',409);}
  else await env.DB.prepare('INSERT INTO volunteer_organizations(id,ministry_id,name,classification,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(orgId,ministryId,name,classification,now(),now()).run();
  await auditStatement(env,'volunteer_organization',orgId,'saved').run();return adminJson({id:orgId});
 }
 if(suffix==='/assignments'&&request.method==='PUT'){
  if(!actor.is_admin)fail('Only administrators can assign organizations.',403);await identity(env,id);
  if(!Array.isArray(b.organizationIds)||b.organizationIds.length>200)fail('Choose valid organizations.');const ids=[...new Set(b.organizationIds.map(x=>plain(x,100)))];
  const all=(await env.DB.prepare('SELECT id FROM volunteer_organizations WHERE active=1').all<{id:string}>()).results;if(ids.some(x=>!all.some(o=>o.id===x)))fail('Choose active organizations.');
  await env.DB.batch([env.DB.prepare('DELETE FROM volunteer_org_access WHERE user_id=?').bind(id),...ids.map(o=>env.DB.prepare('INSERT INTO volunteer_org_access(user_id,organization_id) VALUES(?,?)').bind(id,o)),auditStatement(env,'volunteer_user',id,'organizations_assigned',{organizationIds:ids})]);return adminJson({saved:true});
 }
 const match=suffix.match(/^\/months\/(\d{4}-\d{2})(?:\/(submit|review|reopen))?$/);
 if(match){
  const month=monthKey(match[1]),prior=await env.DB.prepare('SELECT * FROM volunteer_months WHERE user_id=? AND month=?').bind(id,month).first<Month>(),revision=Number(b.revision)||0;
  if(request.method==='PUT'&&!match[2]){
   if(prior&&['submitted','approved'].includes(prior.status))fail('Reopen or return this month before editing it.',409);
   if(!Array.isArray(b.entries)||b.entries.length>310)fail('Enter up to 310 activities within one calendar month.');
   const orgs=await allowedOrganizations(env,id),totals=new Map<string,number>();
   const entries=(b.entries as Record<string,unknown>[]).map(r=>{const date=dateOnly(r.date);if(date.slice(0,7)!==month||date>today())fail('Every date must be within the selected month and cannot be in the future.');const tenths=hourTenths(r.hours),org=orgs.find(o=>o.id===r.organizationId);if(!org)fail('Choose a permitted service organization.',403);totals.set(date,(totals.get(date)||0)+tenths);if(totals.get(date)!>240)fail('Daily total cannot exceed 24.0 hours.');return {date,tenths,activity:plain(r.activity,500),organizationId:org!.id,organizationName:org!.name};});
   const encoded=JSON.stringify(entries);if(encoded.length>220000)fail('This month contains too much text. Shorten activity descriptions.');
   if(!prior){if(revision!==0)fail('Refresh before saving.',409);await env.DB.prepare("INSERT INTO volunteer_months(user_id,month,entries_json,updated_at) VALUES(?,?,?,?)").bind(id,month,encoded,now()).run();}
   else {const r=await env.DB.prepare("UPDATE volunteer_months SET entries_json=?,status='draft',revision=revision+1,reviewed_by=NULL,approved_at=NULL,report_request_json=NULL,updated_at=? WHERE user_id=? AND month=? AND revision=? AND status IN('draft','returned')").bind(encoded,now(),id,month,revision).run();if(!r.meta.changes)fail('This month changed. Refresh before saving.',409);}
   await auditStatement(env,'volunteer_month',id+':'+month,'hours_saved',{entries}).run();return adminJson({saved:true});
  }
  if(request.method==='POST'&&match[2]){
   if(!prior||prior.revision!==revision)fail('Refresh this month before continuing.',409);
   if(match[2]==='submit'){
    if(!['draft','returned'].includes(prior.status)||!JSON.parse(prior.entries_json).length)fail('Save your hours before submitting them.');
    let reportRequest=null;if(b.reportRequest){const r=reportOptions(b.reportRequest as Record<string,unknown>);if(r.start.slice(0,7)!==month||r.end.slice(0,7)!==month)fail('Monthly reports must stay within this month.');if(!(await allowedOrganizations(env,id)).some(o=>o.id===r.organizationId))fail('Choose a permitted reporting organization.',403);reportRequest=JSON.stringify(r);}
    const r=await env.DB.prepare("UPDATE volunteer_months SET status='submitted',report_request_json=?,revision=revision+1,updated_at=? WHERE user_id=? AND month=? AND revision=? AND status IN('draft','returned')").bind(reportRequest,now(),id,month,revision).run();if(!r.meta.changes)fail('This month changed.',409);
   }else if(match[2]==='reopen'){
    if(prior.status==='submitted'&&!actor.is_admin)fail('Ask an administrator to return this submitted month.',403);
    const r=await env.DB.prepare("UPDATE volunteer_months SET status='draft',approved_at=NULL,reviewed_by=NULL,report_request_json=NULL,revision=revision+1,updated_at=? WHERE user_id=? AND month=? AND revision=?").bind(now(),id,month,revision).run();if(!r.meta.changes)fail('This month changed.',409);
   }else {
    if(!actor.is_admin)fail('Only administrators can certify hours.',403);if(prior.status!=='submitted')fail('This month is not awaiting review.',409);
    if(!['approve','return'].includes(String(b.action)))fail('Choose Approve or Return.');const status=b.action==='approve'?'approved':'returned',note=b.action==='return'?plain(b.note,1500):String(b.note||'').slice(0,1500);
    const r=await env.DB.prepare("UPDATE volunteer_months SET status=?,review_note=?,reviewed_by=?,approved_at=?,revision=revision+1,updated_at=? WHERE user_id=? AND month=? AND revision=? AND status='submitted'").bind(status,note,actor.id,status==='approved'?now():null,now(),id,month,revision).run();if(!r.meta.changes)fail('This month changed.',409);
    if(status==='approved'&&prior.report_request_json){try{const report=await issueReport(env,actor,id,JSON.parse(prior.report_request_json));await sendReport(env,report.id);}catch(error){await auditStatement(env,'volunteer_month',id+':'+month,'report_needs_attention').run();return adminJson({saved:true,warning:error instanceof AdminError?error.message:'Hours approved. Report delivery needs attention; create the report from approved hours.'});}}
   }
   await auditStatement(env,'volunteer_month',id+':'+month,match[2],{action:b.action||null}).run();return adminJson({saved:true});
  }
 }
 if(suffix==='/reports'&&request.method==='POST'){const report=await issueReport(env,actor,id,b);await sendReport(env,report.id);return adminJson({id:report.id});}
 const reportMatch=suffix.match(/^\/reports\/([a-zA-Z0-9-]+)(?:\/(resend|retry))?$/);
 if(reportMatch){
  const r=await env.DB.prepare('SELECT * FROM volunteer_reports WHERE id=?').bind(reportMatch[1]).first<Report>();if(!r)fail('Report not found.',404);owner(actor,r!.user_id);
  if(request.method==='GET'&&!reportMatch[2])return new Response(r!.html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store, private','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'none'; style-src 'self' 'unsafe-inline'; img-src data: https://hopesojourns.com; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",'X-Content-Type-Options':'nosniff'}});
  if(request.method==='POST'&&reportMatch[2]){
   const rows=(await env.DB.prepare('SELECT * FROM volunteer_deliveries WHERE report_id=?').bind(r!.id).all<Delivery>()).results;
   if(reportMatch[2]==='retry'){for(const d of rows)await deliver(env,d);}
   else {
    if(rows.some(d=>['sending','uncertain','failed'].includes(d.status)))fail('Resolve existing delivery attempts using Retry failed delivery before resending.',409);
    const org=(await allowedOrganizations(env,r!.user_id)).find(o=>o.id===(JSON.parse(r!.snapshot_json) as VolunteerSnapshot).organizationId);if(!org)fail('This reporting organization is no longer permitted. Ask an administrator.',403);
    const emails=recipientEmails(b.recipients);if(!emails.length)fail('Choose at least one recipient.');
    const u=await identity(env,r!.user_id),sig=r!.html.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/)?.[1];if(!sig)fail('The original report signature is unavailable.',409);
    const snap=JSON.parse(r!.snapshot_json) as VolunteerSnapshot,content=volunteerReport(snap,'cid:brent-signature');
    for(const email of emails){const deliveryId=crypto.randomUUID(),payload={from:'Hope Sojourns <admin@hopesojourns.com>',to:[email],cc:[...new Set([u.email.toLowerCase(),'admin@hopesojourns.com'])].filter(x=>x!==email),reply_to:'admin@hopesojourns.com',subject:content.subject,html:r!.html.replace('data:image/png;base64,'+sig,'cid:brent-signature'),text:r!.text,attachments:[{filename:'brent-kern-signature.png',content:sig,content_id:'brent-signature'}]};await env.DB.prepare("INSERT INTO volunteer_deliveries(id,report_id,recipient,status,payload_json,attempt_key,created_at,updated_at) VALUES(?,?,?,'failed',?,?,?,?)").bind(deliveryId,r!.id,email,JSON.stringify(payload),'volunteer-'+deliveryId,now(),now()).run();}await sendReport(env,r!.id);
   }
   await auditStatement(env,'volunteer_report',r!.id,reportMatch[2]).run();return adminJson({saved:true});
  }
 }
 fail('Volunteer action not found.',404);
 }catch(error){if(error instanceof AdminError)return adminJson({error:error.message,code:error.code},error.status,error.headers);if(error instanceof Error&&/UNIQUE constraint|CHECK constraint/.test(error.message))return adminJson({error:'This record changed or already exists. Refresh and review it before trying again.'},409);console.error('volunteer_action_failed');return adminJson({error:'Unable to complete the volunteer action. Refresh and try again.'},500);}
}
