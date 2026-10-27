import {AdminError,adminJson,authenticate,auditStatement,hashText,readAdminJson,type AdminEnv} from './admin';
import {can} from './mmt-permissions';
import {Buffer} from 'node:buffer';
import {givingEmailFooter} from './gift-email-template';
import {signatureKey} from './gift-thanks';
import {emailColors as colors} from './gift-email-colors';
import {savedMail,publicMail,contactEmails,type Mail} from './contact-email-records';

type Person={id:string;first_name:string;last_name:string;email:string};
const sender='admin@hopesojourns.com';
const footerText='WitLooL,\nBrent Kern\nHope Sojourns\n972-505-0171\nChristian Steps Ministries\n\nWitLooL™ means “Working in the Light of our Lord.”\nWitLooL is a trademark.\nhttps://hopesojourns.com\nhttps://www.christiansteps.net';
const escape=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
async function signatureContent(env:AdminEnv){
 const object=await env.RECEIPTS.get(signatureKey);
 if(!object||object.size>500000)throw new AdminError(503,'SIGNATURE_REQUIRED','The standard email signature is not configured. Ask an administrator to add it in the giving email settings.');
 return Buffer.from(await new Response(object.body).arrayBuffer()).toString('base64');
}
const validEmail=(v:unknown):v is string=>typeof v==='string'&&v.length<=254&&/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/.test(v);
function ids(value:unknown):string[]{
 if(!Array.isArray(value)||value.length>100||value.some(x=>typeof x!=='string'||!x||x.length>100))throw new AdminError(422,'INVALID_CONTACTS','Select up to 100 contacts.');
 return [...new Set(value)];
}
async function selectedPeople(env:AdminEnv,personIds:string[]){
 if(!personIds.length)return [];
 const rows=await env.DB.prepare(`SELECT id,first_name,last_name,email FROM people WHERE id IN (${personIds.map(()=>'?').join(',')}) AND contact_status='active'`).bind(...personIds).all<Person>();
 if(rows.results.length!==personIds.length)throw new AdminError(409,'CONTACT_CHANGED','A selected contact is unavailable. Refresh the contact list and select again.');
 const byId=new Map(rows.results.map(p=>[p.id,p]));return personIds.map(id=>byId.get(id)!);
}
async function deliver(env:AdminEnv,id:string){
 const mail=await env.DB.prepare('SELECT * FROM contact_emails WHERE id=?').bind(id).first<Mail>();
 if(!mail)throw new AdminError(404,'NOT_FOUND','Email not found.');
 if(['sent','captured'].includes(mail.status))return publicMail(mail);
 const saved=savedMail(mail);
 // Never replay a legacy group payload that exposes addresses. Do not change an
 // uncertain provider payload or its key: it may already have been accepted.
 if(!saved.privateRecipients&&saved.payload.to.length>1)throw new AdminError(409,'VISIBLE_RECIPIENTS','This older saved email uses visible recipients and cannot be retried. Ask an administrator to verify its delivery with the email provider before preparing a private replacement.');
 const now=new Date().toISOString();
 if(['sending','uncertain'].includes(mail.status)&&(!mail.started_at||Date.now()-Date.parse(mail.started_at)>=23*3600000))throw new AdminError(409,'VERIFY_DELIVERY','Check delivery with the email provider before another attempt; the safe retry window has expired.');
 if(mail.status==='sending'&&Date.now()-Date.parse(mail.updated_at)<60000)throw new AdminError(409,'SENDING','This email is already sending. Refresh its status shortly.');
 const key=mail.status==='failed'?crypto.randomUUID():mail.attempt_key;
 const started=['sending','uncertain'].includes(mail.status)?mail.started_at:now;
 const claim=await env.DB.prepare("UPDATE contact_emails SET status='sending',attempt_key=?,started_at=?,updated_at=?,error=NULL WHERE id=? AND status=? AND updated_at=?").bind(key,started,now,id,mail.status,mail.updated_at).run();
 if(!claim.meta.changes)throw new AdminError(409,'SENDING','Another request is handling this email. Refresh its status.');
 let status='captured',error:string|null=null,providerId:string|null=null;
 if(env.ENVIRONMENT!=='test'){
  if(env.MMT_EMAIL_PROVIDER!=='resend'||env.MMT_EMAIL_DELIVERY_MODE!=='live'||!env.RESEND_API_KEY){status='failed';error='Portal email is not configured for live delivery.';}
  else try{
   const r=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(saved.payload)});
   if(r.ok){providerId=(await r.json() as {id?:string}).id||null;status=providerId?'sent':'uncertain';}
   else{status=r.status>=400&&r.status<500&&![408,409,429].includes(r.status)?'failed':'uncertain';await r.body?.cancel();}
   if(status!=='sent')error=status==='failed'?'The provider rejected this email. Check the sender and recipients before retrying.':'Delivery is uncertain. Use Retry saved email within 23 hours; do not compose a replacement.';
  }catch{status='uncertain';error='Delivery is uncertain. Use Retry saved email within 23 hours; do not compose a replacement.';}
 }
 const sentAt=status==='sent'?new Date().toISOString():null;
 await env.DB.batch([
  env.DB.prepare('UPDATE contact_emails SET status=?,provider_id=?,error=?,sent_at=?,updated_at=? WHERE id=? AND attempt_key=?').bind(status,providerId,error,sentAt,new Date().toISOString(),id,key),
  auditStatement(env,'contact_email',id,status)
 ]);
 return publicMail({...mail,status,error,sent_at:sentAt});
}

export async function handleContactEmail(request:Request,env:AdminEnv,path:string):Promise<Response>{
 try{
  const edit=request.method!=='GET',session=await authenticate(request,env,edit);
  if(!can(session.user,'contacts',edit))throw new AdminError(403,'ACCESS_DENIED','Contact edit access is required to send email.');
  const suffix=path.slice('/admin/contacts/emails'.length);
  if(request.method==='GET'&&suffix===''){
   const params=new URL(request.url).searchParams,personId=params.get('personId')||undefined,page=Number(params.get('page')||1);
   if(!Number.isInteger(page)||page<1||page>10000)throw new AdminError(422,'INVALID_PAGE','Choose a valid email history page.');
   if(personId&&!await env.DB.prepare('SELECT id FROM people WHERE id=?').bind(personId).first())throw new AdminError(404,'NOT_FOUND','Contact not found.');
   return adminJson({from:sender,testMode:env.ENVIRONMENT==='test',...await contactEmails(env,{personId,page})});
  }
  if(request.method!=='POST')throw new AdminError(405,'METHOD_NOT_ALLOWED','Method not allowed.');
  const retry=suffix.match(/^\/([a-f0-9-]{36})\/retry$/i);
  if(retry)return adminJson({email:await deliver(env,retry[1])});
  const body=await readAdminJson(request);
  if(suffix==='/preview'){
   const people=await selectedPeople(env,ids(body.personIds));
   const recipients=[...new Set(people.filter(p=>validEmail(p.email)).map(p=>p.email.toLowerCase()))];
   const signature=await signatureContent(env);
   return adminJson({from:sender,to:recipients,skipped:people.filter(p=>!validEmail(p.email)).map(p=>`${p.first_name} ${p.last_name}`),footerHtml:givingEmailFooter('data:image/png;base64,'+signature),testMode:env.ENVIRONMENT==='test',ready:env.ENVIRONMENT==='test'||(env.MMT_EMAIL_PROVIDER==='resend'&&env.MMT_EMAIL_DELIVERY_MODE==='live'&&!!env.RESEND_API_KEY)});
  }
  if(suffix!=='')throw new AdminError(404,'NOT_FOUND','Email action not found.');
  if(typeof body.sendId!=='string'||!/^[a-f0-9-]{36}$/i.test(body.sendId))throw new AdminError(422,'INVALID_SEND_ID','Reopen the email composer before sending.');
  if(!Array.isArray(body.to)||body.to.length>100||body.to.some(v=>!validEmail(v)))throw new AdminError(422,'INVALID_EMAIL','Enter valid email addresses separated by commas, semicolons, or new lines.');
  const to=[...new Set((body.to as string[]).map(v=>v.toLowerCase()))].sort();
  if(!to.length||to.length>50)throw new AdminError(422,'RECIPIENT_LIMIT','Include between 1 and 50 different email addresses.');
  if(typeof body.subject!=='string'||!body.subject.trim()||body.subject.length>160||/[\u0000-\u001f\u007f]/.test(body.subject))throw new AdminError(422,'SUBJECT_REQUIRED','Enter a subject of up to 160 characters on one line.');
  if(typeof body.message!=='string'||!body.message.trim()||body.message.length>10000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body.message))throw new AdminError(422,'MESSAGE_REQUIRED','Enter a message of up to 10,000 characters.');
  const subject=body.subject.trim(),message=body.message.trim();
  const hash=await hashText(JSON.stringify({to,subject,message}));
  let existing=await env.DB.prepare('SELECT * FROM contact_emails WHERE id=?').bind(body.sendId).first<Mail>();
  if(existing&&existing.request_hash!==hash)throw new AdminError(409,'CHANGED_EMAIL','This send request belongs to a saved message. Open Email history to review or retry it.');
  if(!existing){
   await selectedPeople(env,ids(body.personIds));
   // Manual recipients also link to any matching active contacts. Shared addresses
   // produce one delivery but retain the history on every matching contact.
   const linked=(await env.DB.prepare("SELECT id FROM people WHERE contact_status='active' AND lower(email) IN(SELECT value FROM json_each(?))").bind(JSON.stringify(to)).all<{id:string}>()).results;
   const signature=await signatureContent(env);
   const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body style="margin:0;background:${colors.white};color:${colors.ink};font:15px/1.6 Arial,sans-serif"><div style="max-width:640px;margin:auto;padding:24px"><div>${escape(message).replace(/\r?\n/g,'<br>')}</div>${givingEmailFooter('cid:brent-signature')}</div></body></html>`;
   const bcc=to.filter(address=>address!==sender);
   const payload=JSON.stringify({recipients:to,delivery:{from:`Hope Sojourns <${sender}>`,to:[sender],...(bcc.length?{bcc}:{}),reply_to:sender,subject,text:message+'\n\n'+footerText,html,attachments:[{filename:'brent-kern-signature.png',content:signature,content_id:'brent-signature'}]}});
   const now=new Date().toISOString();
   await env.DB.prepare("INSERT OR IGNORE INTO contact_emails(id,request_hash,payload_json,attempt_key,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").bind(body.sendId,hash,payload,'contact-'+body.sendId,session.user.id,now,now).run();
   existing=await env.DB.prepare('SELECT * FROM contact_emails WHERE id=?').bind(body.sendId).first<Mail>();
   if(!existing)throw new AdminError(409,'UNRESOLVED_EMAIL','This message already has an unresolved send attempt. Open Email history and retry the saved email.');
   if(existing.request_hash!==hash)throw new AdminError(409,'CHANGED_EMAIL','This send request belongs to another message. Open Email history.');
   await env.DB.batch([...linked.map(p=>env.DB.prepare('INSERT OR IGNORE INTO contact_email_people(email_id,person_id) VALUES(?,?)').bind(body.sendId,p.id)),auditStatement(env,'contact_email',body.sendId,'prepared',{recipientCount:to.length})]);
  }
  return adminJson({email:await deliver(env,body.sendId)});
 }catch(error){
  if(error instanceof AdminError)return adminJson({error:error.message,code:error.code},error.status);
  console.error('Contact email operation failed');return adminJson({error:'Unable to complete the email request. Check Email history before retrying.'},500);
 }
}
