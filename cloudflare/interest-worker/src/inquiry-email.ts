import {AdminError,auditStatement,type AdminEnv} from './admin';
type Payload={from:string;to:string[];reply_to:string;subject:string;text:string};
type Mail={id:string;inquiry_id:string;kind:string;payload_json:string;status:string;attempt_key:string;started_at:string|null;updated_at:string;error:string|null};
export function inquiryPayload(env:AdminEnv,to:string,subject:string,text:string):Payload {
 const from=env.EMAIL_FROM_ADDRESS||'admin@hopesojourns.com';
 return {from:`Hope Sojourns <${from}>`,to:[to],reply_to:env.EMAIL_REPLY_TO||from,subject,text};
}
export async function deliverInquiryEmail(env:AdminEnv,id:string){
 const mail=await env.DB.prepare('SELECT * FROM inquiry_emails WHERE id=?').bind(id).first<Mail>();
 if(!mail)throw new AdminError(404,'NOT_FOUND','Email not found.');
 if(mail.status==='sent'||mail.status==='captured')return {status:mail.status};
 const now=new Date().toISOString(),age=mail.started_at?Date.now()-Date.parse(mail.started_at):0;
 if(['sending','uncertain'].includes(mail.status)&&age>=23*3600000)throw new AdminError(409,'VERIFY_DELIVERY','Check delivery with the email provider before sending another message; the safe retry window has expired.');
 if(mail.status==='sending'&&Date.now()-Date.parse(mail.updated_at)<60000)throw new AdminError(409,'SENDING','This email is being sent. Refresh shortly.');
 const key=mail.status==='failed'?crypto.randomUUID():mail.attempt_key;
 const started=['sending','uncertain'].includes(mail.status)?mail.started_at:now;
 const claim=await env.DB.prepare("UPDATE inquiry_emails SET status='sending',attempt_key=?,started_at=?,updated_at=?,error=NULL WHERE id=? AND status=? AND updated_at=?").bind(key,started,now,id,mail.status,mail.updated_at).run();
 if(!claim.meta.changes)throw new AdminError(409,'SENDING','Another request is handling this email. Refresh shortly.');
 let status='captured',error:string|null=null,providerId:string|null=null;
 if(env.ENVIRONMENT!=='test'){
  if(env.MMT_EMAIL_PROVIDER!=='resend'||env.MMT_EMAIL_DELIVERY_MODE!=='live'||!env.RESEND_API_KEY){status='failed';error='Portal email is not configured for live delivery.';}
  else try{
   const response=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':key},body:mail.payload_json});
   if(response.ok){const result=await response.json() as {id?:string};providerId=result.id||null;status=providerId?'sent':'uncertain';}
   else {status=response.status>=400&&response.status<500&&![408,409,429].includes(response.status)?'failed':'uncertain';await response.body?.cancel();}
   if(status!=='sent')error=status==='failed'?'The provider rejected this email. Correct the issue and retry.':'Delivery is uncertain. Retry this saved email within 23 hours using the same delivery key.';
  }catch{status='uncertain';error='Delivery is uncertain. Retry this saved email within 23 hours; do not compose a replacement.';}
 }
 const sentAt=status==='sent'?new Date().toISOString():null;
 const updates=[env.DB.prepare('UPDATE inquiry_emails SET status=?,provider_id=?,error=?,sent_at=?,updated_at=? WHERE id=? AND attempt_key=?').bind(status,providerId,error,sentAt,new Date().toISOString(),id,key),auditStatement(env,'inquiry_email',id,status,{inquiryId:mail.inquiry_id})];
 if(mail.kind==='reply')updates.push(env.DB.prepare('UPDATE submission_replies SET delivery_status=?,provider_message_id=?,error_message=?,sent_at=?,updated_at=? WHERE id=?').bind(status==='sent'?'sent':status==='captured'?'draft':'failed',providerId,status==='captured'?'Test capture only; no email sent.':error,sentAt,now,id));
 if(status==='sent'&&mail.kind==='reply')updates.push(env.DB.prepare("UPDATE inquiry_workflows SET stage=CASE WHEN stage='new' THEN 'contacted' ELSE stage END,revision=revision+1,updated_at=? WHERE submission_id=?").bind(now,mail.inquiry_id));
 if(status==='sent'&&mail.kind==='reply')updates.push(env.DB.prepare("UPDATE people SET last_contacted_at=?,last_contacted_note='Trip inquiry reply sent',updated_at=? WHERE id=(SELECT person_id FROM interest_submissions WHERE id=?)").bind(sentAt,now,mail.inquiry_id));
 await env.DB.batch(updates);
 return {status,error};
}
export async function acknowledgeInquiry(env:AdminEnv,id:string,input:{firstName:string;email:string}){
 // Intake is already committed. A delivery failure must not tell the visitor to resubmit.
 try{
 const now=new Date().toISOString(),key='ack-'+id;
 const payload=inquiryPayload(env,input.email,'Thank you for your interest in Hope Sojourns',`Dear ${input.firstName},\n\nThank you for your interest in serving with Hope Sojourns. We received your request, and a team member will follow up within two business days. This is an expression of interest, not a reservation or a financial commitment.\n\nIf your preferred journey is not planned yet, we can keep your interest on file and discuss future opportunities.\n\nHope Sojourns\n972-505-0171\nhttps://hopesojourns.com`);
 await env.DB.prepare("INSERT OR IGNORE INTO inquiry_emails(id,inquiry_id,kind,payload_json,attempt_key,updated_at) VALUES(?,?,'acknowledgment',?,?,?)").bind(key,id,JSON.stringify(payload),key,now).run();
 await deliverInquiryEmail(env,key);
 }catch{console.warn('Inquiry acknowledgment requires review.');}
}
