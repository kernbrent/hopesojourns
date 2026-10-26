import {Buffer} from 'node:buffer';
import {AdminError,adminJson,authenticate,auditStatement,hashText,readAdminJson,type AdminEnv} from './admin';
import {can} from './mmt-permissions';
import {prepareApplicationInvitations,applicationInvitationCandidates} from './traveler-vetting';
import {deliverTravelerEmail} from './traveler-screening-email';
import {sealTravelerEmail} from './traveler-email-payload';
import {emailColors as colors} from './gift-email-colors';
import {givingEmailFooter} from './gift-email-template';
import {signatureKey} from './gift-thanks';
type Row=Record<string,any>;
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function fail(message:string,status=422):never{throw new AdminError(status,'APPLICATION_EMAIL',message);}
export function applicationInvitation(name:string,trip:string,url:string,signature:string,additionalInformation=''){
 const intro=`You are invited to complete a Hope Sojourns traveler application for ${trip}. Your answers help us get to know you and prepare for this journey. This application does not reserve a place or create a financial commitment.`;
 const warning='This URL only works once. Open it when you are ready to complete the application and keep that page open until you receive confirmation. If the link fails, or you do not complete the application and need a new link, request a replacement at admin@hopesojourns.com. Unopened links expire after 14 days.';
 const subject=`Traveler application invitation — ${trip}`;
 const text=`Dear ${name},\n\n${intro}${additionalInformation?'\n\n'+additionalInformation:''}\n\nComplete your traveler application:\n${url}\n\n${warning}\n\nWitLooL,\nBrent Kern\nHope Sojourns\n972-505-0171\nChristian Steps Ministries\n\nWitLooL™ means “Working in the Light of our Lord.”\nWitLooL is a trademark.\nhttps://hopesojourns.com\nhttps://www.christiansteps.net`;
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body style="margin:0;background:${colors.white};color:${colors.ink};font:15px/1.6 Arial,sans-serif"><div style="max-width:640px;margin:auto;padding:24px"><p>Dear ${esc(name)},</p><p>${esc(intro)}</p>${additionalInformation?`<p style="white-space:pre-wrap">${esc(additionalInformation)}</p>`:''}<p><a href="${esc(url)}" style="color:${colors.forest}">Complete your traveler application</a></p><p>${esc(warning)}</p>${givingEmailFooter(signature)}</div></body></html>`;
 return {subject,text,html};
}
export async function handleApplicationEmail(request:Request,env:AdminEnv,tripId:string,action:string){try{
 const session=await authenticate(request,env,request.method!=='GET');if(!can(session.user,'contacts',request.method!=='GET')||!can(session.user,'trips',request.method!=='GET'))fail('Contact and trip permissions are required.',403);
 if(action==='application-preview'&&request.method==='GET'){
  const preview=await env.DB.prepare('SELECT html FROM traveler_application_previews WHERE id=? AND trip_id=? AND expires_at>?').bind(new URL(request.url).searchParams.get('id')||'',tripId,new Date().toISOString()).first<{html:string}>();if(!preview)fail('Preview expired. Prepare it again.',404);
  return new Response(preview.html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src data: https://hopesojourns.com; frame-ancestors 'self'; base-uri 'none'; form-action 'none'"}});
 }
 if(action==='application-emails'&&request.method==='GET')return adminJson({emails:(await env.DB.prepare('SELECT id,person_id,application_id,status,sent_at,error,updated_at FROM traveler_application_emails WHERE trip_id=? ORDER BY updated_at DESC LIMIT 200').bind(tripId).all()).results});
 if(request.method!=='POST')fail('Method not allowed.',405);const b=await readAdminJson(request);
 if(action==='application-retry'){
  const mail=await env.DB.prepare('SELECT id FROM traveler_application_emails WHERE id=? AND trip_id=?').bind(typeof b.emailId==='string'?b.emailId:'',tripId).first();if(!mail)fail('Email not found.',404);return adminJson(await deliverTravelerEmail(env,String(mail.id),'application'));
 }
 if(!Array.isArray(b.people)||!b.people.length||b.people.length>100)fail('Select 1–100 travelers.');
 const ids=b.people as Row[],sendId=typeof b.sendId==='string'?b.sendId:'',regenerate=b.regenerate===true,additionalInformation=typeof b.additionalInformation==='string'?b.additionalInformation.trim():'';if(additionalInformation.length>4000)fail('Keep the additional information to 4,000 characters or fewer.');
 if(ids.some(p=>!p||typeof p.personId!=='string')||new Set(ids.map(p=>p.personId)).size!==ids.length)fail('Select each traveler once.');
 const requestHash=await hashText(JSON.stringify({people:ids.map(p=>p.personId).sort(),tripId,regenerate,additionalInformation}));
 if(action==='application-emails'&&!/^[a-f0-9-]{36}$/i.test(sendId))fail('A stable email send ID is required.');
 const previous=sendId?(await env.DB.prepare('SELECT id,person_id,request_hash,context_json FROM traveler_application_emails WHERE trip_id=? AND send_id=?').bind(tripId,sendId).all<Row>()).results:[];
 if(previous.length){if(previous.some(p=>p.request_hash!==requestHash))fail('This send ID belongs to another invitation. Retry the saved message.',409);const results=[];for(const mail of previous){try{results.push(await deliverTravelerEmail(env,mail.id,'application'));}catch(e){results.push({id:mail.id,status:'requires_attention',error:e instanceof AdminError?e.message:'Delivery requires review.'});}}return adminJson({results,skipped:JSON.parse(previous[0]!.context_json).skipped||[]});}
 if(action!=='application-preview'&&action!=='application-emails')fail('Not found.',404);
 const trip=await env.DB.prepare('SELECT title FROM trips WHERE id=?').bind(tripId).first<Row>();if(!trip)fail('Trip not found.',404);
 const subject=`Traveler application invitation — ${trip.title}`,testMode=env.ENVIRONMENT==='test';
 if(action==='application-emails'&&!testMode&&(env.MMT_EMAIL_PROVIDER!=='resend'||env.MMT_EMAIL_DELIVERY_MODE!=='live'||!env.RESEND_API_KEY))fail('Portal email is not configured for live delivery.',503);
 let context:Row;
 if(action==='application-preview'){
  const candidates=await applicationInvitationCandidates(env,tripId,ids,regenerate);context={requestHash,tripTitle:trip.title,...candidates};
  if(!candidates.recipients.length)return adminJson({subject,recipients:[],skipped:candidates.skipped,people:[],previewUrl:null,testMode});
 }else{
  const preview=await env.DB.prepare('SELECT context_json FROM traveler_application_previews WHERE id=? AND trip_id=? AND expires_at>?').bind(typeof b.previewId==='string'?b.previewId:'',tripId,new Date().toISOString()).first<Row>();if(!preview)fail('Preview this invitation before sending. The preview may have expired.',409);context=JSON.parse(preview.context_json);
  if(context.requestHash!==requestHash||context.tripTitle!==trip.title)fail('The invitation or trip changed. Preview it again before sending.',409);
  const current=await applicationInvitationCandidates(env,tripId,ids,regenerate);if(JSON.stringify(current.recipients)!==JSON.stringify(context.recipients)||JSON.stringify(current.skipped)!==JSON.stringify(context.skipped))fail('Contact or application details changed after preview. Preview the invitation again before sending.',409);
 }
 const object=await env.RECEIPTS.get(signatureKey);if(!object||object.size>500000)fail('The standard ministry signature must be configured before sending application invitations.',503);const signature=Buffer.from(await new Response(object.body).arrayBuffer()).toString('base64');
 const origin=env.HS_PORTAL_ORIGIN||(testMode?new URL(request.url).origin:'https://hopesojourns.com'),from=env.EMAIL_FROM_ADDRESS||'admin@hopesojourns.com';
 if(action==='application-preview'){
  const first=context.recipients[0],message=applicationInvitation(first.firstName,trip.title,origin+'/application/#link-created-when-sent','data:image/png;base64,'+signature,additionalInformation),id=crypto.randomUUID(),now=new Date().toISOString();
  await env.DB.batch([env.DB.prepare('DELETE FROM traveler_application_previews WHERE expires_at<?').bind(now),env.DB.prepare('INSERT INTO traveler_application_previews(id,trip_id,html,expires_at,context_json) VALUES(?,?,?,?,?)').bind(id,tripId,message.html,new Date(Date.now()+10*60000).toISOString(),JSON.stringify(context))]);
  return adminJson({subject,recipients:context.recipients,skipped:context.skipped,previewId:id,previewUrl:`/api/interest/admin/trips/${tripId}/vetting/application-preview?id=${id}`,testMode});
 }
 const prepared=await prepareApplicationInvitations(env,tripId,context.recipients,{regenerate}),now=new Date().toISOString(),created:Row[]=[];
 for(const link of prepared.links){const expected=context.recipients.find((r:Row)=>r.personId===link.personId);if(!expected||expected.email!==link.email||expected.name!==link.name||expected.firstName!==link.firstName)fail('Contact details changed after preview. Preview the invitation again before sending.',409);
  prepared.statements.push(env.DB.prepare(`UPDATE traveler_workflows SET revision=CASE WHEN EXISTS(SELECT 1 FROM people p JOIN trips t ON t.id=? WHERE p.id=? AND p.contact_status='active' AND p.email=? AND p.first_name||' '||p.last_name=? AND COALESCE(NULLIF(p.preferred_name,''),p.first_name)=? AND t.title=?) THEN revision ELSE -1 END WHERE trip_id=? AND person_id=?`).bind(tripId,link.personId,expected.email,expected.name,expected.firstName,context.tripTitle,tripId,link.personId));
 }

 for(const p of prepared.links){const id=crypto.randomUUID(),message=applicationInvitation(p.firstName,trip.title,origin+p.path,'cid:brent-signature',additionalInformation),payload={...message,from:`Hope Sojourns <${from}>`,to:[p.email],reply_to:env.EMAIL_REPLY_TO||from,attachments:[{filename:'brent-kern-signature.png',content:signature,content_id:'brent-signature'}]};
  prepared.statements.push(env.DB.prepare('INSERT INTO traveler_application_emails(id,trip_id,person_id,application_id,send_id,request_hash,payload_json,attempt_key,updated_at,context_json) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,tripId,p.personId,p.applicationId,sendId,requestHash,await sealTravelerEmail(env,payload),'application-'+id,now,JSON.stringify(context)),auditStatement(env,'person',p.personId,'traveler_application_email_prepared',{tripId,emailId:id,applicationId:p.applicationId}));created.push({id});
 }
 await env.DB.batch(prepared.statements);const results=[];for(const mail of created){try{results.push(await deliverTravelerEmail(env,mail.id,'application'));}catch(e){results.push({id:mail.id,status:'requires_attention',error:e instanceof AdminError?e.message:'Delivery requires review.'});}}return adminJson({results,skipped:context.skipped});
 }catch(e){if(e instanceof AdminError)return adminJson({error:e.message,code:e.code},e.status);if(e instanceof Error&&/CHECK constraint|UNIQUE constraint/.test(e.message))return adminJson({error:'Contact or application details changed. Preview the invitation again before sending.',code:'APPLICATION_EMAIL_CONFLICT'},409);console.error('application_email_failure');return adminJson({error:'Unable to prepare the application invitation.',code:'SERVER_ERROR'},500);}}
