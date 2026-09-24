import {Buffer} from 'node:buffer';
import {AdminError,adminJson,authenticate,auditStatement,hashText,readAdminJson,type AdminEnv} from './admin';
import {giftEmail,type ThankYouGift} from './gift-email-template';

export const signatureKey='branding/brent-kern-signature.png';
type Gift=ThankYouGift & {entryId:string;personId:string;email:string;lastName:string};
type SentRow={entry_id:string;person_id:string;status:string;attempt_key:string;payload_json:string;started_at:string;updated_at:string;sent_at:string|null;error:string|null};
type Payload={from:string;to:string[];reply_to:string;subject:string;text:string;html:string;attachments:{filename:string;content:string;content_id:string}[]};
export async function thanksSettings(env:AdminEnv){
 const settings=await env.DB.prepare('SELECT automatic FROM gift_thanks_settings WHERE id=1').first<{automatic:number}>();
 return {automatic:settings?.automatic===1,testMode:env.ENVIRONMENT==='test',ready:env.ENVIRONMENT==='test'||(env.MMT_EMAIL_PROVIDER==='resend'&&env.MMT_EMAIL_DELIVERY_MODE==='live'&&!!env.RESEND_API_KEY)};
}
async function gifts(env:AdminEnv,id:string):Promise<Gift[]>{
 const rows=await env.DB.prepare(`SELECT g.id AS entryId,g.person_id AS personId,
 COALESCE(NULLIF(p.preferred_name,''),p.first_name) AS name,p.last_name AS lastName,p.email,
 g.transaction_date AS date,g.charitable_amount AS amount,g.payment_type AS method,l.currency
 FROM donation_gifts g JOIN people p ON p.id=g.person_id JOIN ledger_entries l ON l.id=g.id
 WHERE g.id=? ORDER BY g.person_id,g.transaction_date`).bind(id).all<Gift>();
 return rows.results;
}
async function giftFor(env:AdminEnv,id:string,personId:string){
 const matches=(await gifts(env,id)).filter(g=>g.personId===personId);
 if(!matches.length)throw new AdminError(404,'GIFT_NOT_FOUND','This charitable gift is not linked to that contact.');
 if(matches.length>1)throw new AdminError(409,'AMBIGUOUS_GIFT','This split has multiple gifts for the same donor. Review the donor allocations before acknowledging it.');
 return matches[0]!;
}
async function signatureContent(env:AdminEnv){
 const object=await env.RECEIPTS.get(signatureKey);
 if(!object||object.size>500_000)throw new AdminError(503,'SIGNATURE_REQUIRED','The thank-you signature is not configured. Contact the portal administrator.');
 return Buffer.from(await new Response(object.body).arrayBuffer()).toString('base64');
}
const validEmail=(email:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const snapshotHash=(gift:Gift)=>hashText(JSON.stringify(gift));
async function sentRow(env:AdminEnv,id:string,personId:string){
 return env.DB.prepare(`SELECT * FROM gift_thanks WHERE entry_id=?1 AND (person_id=?2 OR
 (status IN('sent','sending','uncertain') AND NOT EXISTS(SELECT 1 FROM donation_splits WHERE entry_id=?1 AND json_array_length(allocations_json)>0)))
 ORDER BY CASE WHEN status='sent' THEN 0 WHEN status IN('sending','uncertain') THEN 1 ELSE 2 END LIMIT 1`).bind(id,personId).first<SentRow>();
}
function deliveryState(row:SentRow|null){
 const age=row?Date.now()-Date.parse(row.started_at):0;
 const locked=row?.status==='sent'||row?.status==='sending'&&Date.now()-Date.parse(row.updated_at)<60_000||['sending','uncertain'].includes(row?.status||'')&&age>=23*3600_000;
 return {status:row?.status||'not_sent',sentAt:row?.sent_at||null,error:row?.error||null,locked:!!locked};
}
export async function listGiftThanks(env:AdminEnv,id:string){
 const items=await gifts(env,id);
 return Promise.all(items.map(async g=>({personId:g.personId,name:`${g.name} ${g.lastName}`,email:g.email,
 date:g.date,amount:g.amount,method:g.method,hasEmail:validEmail(g.email),...deliveryState(await sentRow(env,id,g.personId))})));
}

export async function sendGiftThanks(env:AdminEnv,id:string,personId:string,actor:string,expectedHash?:string){
 const gift=await giftFor(env,id,personId);
 let existing=await sentRow(env,id,personId);
 if(existing?.status==='sent')return deliveryState(existing);
 if(existing&&existing.person_id!==personId)throw new AdminError(409,'THANK_YOU_LOCKED','A thank-you for this gift was already attempted for its previous contact. Check delivery before changing the acknowledgment.');
 if(deliveryState(existing).locked)throw new AdminError(409,'THANK_YOU_LOCKED','This thank-you is already sending or needs its delivery checked before another attempt.');
 // A retry after a timeout must reuse exactly the same provider payload and key.
 const retry=existing&&['uncertain','sending'].includes(existing.status);
 if(!retry){
  if(!validEmail(gift.email))throw new AdminError(422,'EMAIL_REQUIRED','Add a valid email address to this donor’s contact before sending a thank-you.');
  if(expectedHash&&expectedHash!==await snapshotHash(gift))throw new AdminError(409,'GIFT_CHANGED','The gift or contact changed. Reopen the preview before sending.');
 }
 const settings=await thanksSettings(env);
 if(!settings.ready)throw new AdminError(503,'EMAIL_NOT_READY','Gift email delivery is not configured. The gift is saved and can be thanked later.');
 const now=new Date().toISOString();
 const attemptKey=retry?existing!.attempt_key:'gift-thanks-'+crypto.randomUUID();
 let payload:Payload;
 if(retry)payload=JSON.parse(existing!.payload_json) as Payload;
 else {
  const content=await signatureContent(env);
  payload={...giftEmail(gift,'cid:brent-signature'),from:'Hope Sojourns <giving@hopesojourns.com>',
   to:[gift.email],reply_to:'giving@hopesojourns.com',
   attachments:[{filename:'brent-kern-signature.png',content,content_id:'brent-signature'}]};
 }
 const payloadJson=JSON.stringify(payload);
 const startedAt=retry?existing!.started_at:now;
 // Atomic compare-and-set: concurrent manual and automatic requests cannot both send.
 const claim=await env.DB.prepare(`INSERT INTO gift_thanks(entry_id,person_id,status,attempt_key,payload_json,started_at,updated_at,actor)
 VALUES(?,?,'sending',?,?,?,?,?) ON CONFLICT(entry_id,person_id) DO UPDATE SET status='sending',attempt_key=excluded.attempt_key,
 payload_json=excluded.payload_json,started_at=excluded.started_at,updated_at=excluded.updated_at,actor=excluded.actor,error=NULL
 WHERE gift_thanks.status IN('failed','captured') OR (gift_thanks.attempt_key=? AND gift_thanks.status IN('uncertain','sending') AND gift_thanks.updated_at=?)`)
 .bind(id,personId,attemptKey,payloadJson,startedAt,now,actor,retry?existing!.attempt_key:'',retry?existing!.updated_at:'').run();
 if(Number(claim.meta.changes)!==1)throw new AdminError(409,'THANK_YOU_LOCKED','Another request is already handling this gift. Refresh its status.');
 let status='captured',providerId:string|null=null,error:string|null=null;
 if(env.ENVIRONMENT!=='test'){
  status='uncertain';
  try{
   const response=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),
    headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':attemptKey},body:payloadJson});
   if(response.ok){
    const result=await response.json() as {id?:string};
    if(result.id){status='sent';providerId=result.id;}else error='Provider response was incomplete. Retry safely within 23 hours.';
   }else{
    // 5xx, conflicts, and timeouts may have accepted the message. Never issue a new key for these.
    status=response.status>=400&&response.status<500&&![408,409].includes(response.status)?'failed':'uncertain';
    error=status==='failed'?`Email provider rejected the request (HTTP ${response.status}). Correct the issue and retry.`:'Delivery could not be confirmed. Retry safely within 23 hours; afterward an administrator must check delivery.';
    await response.body?.cancel();
   }
  }catch{error='Delivery could not be confirmed. Retry safely within 23 hours; afterward an administrator must check delivery.';}
 }
 const sentAt=status==='sent'?new Date().toISOString():null;
 await env.DB.batch([
  env.DB.prepare('UPDATE gift_thanks SET status=?,sent_at=?,provider_id=?,error=?,updated_at=? WHERE entry_id=? AND person_id=? AND attempt_key=?')
   .bind(status,sentAt,providerId,error,new Date().toISOString(),id,personId,attemptKey),
  auditStatement(env,'gift_thanks',id,status,{personId,actor,providerId}),
 ]);
 return {status,sentAt,error,locked:status==='sent'};
}

export async function automaticallyThankGift(env:AdminEnv,id:string,actor:string){
 // Delivery failures must never roll back or misreport a successfully received gift.
 try{
  if(!(await thanksSettings(env)).automatic)return [];
  const results=[];
  for(const gift of await gifts(env,id)){
   try{results.push({personId:gift.personId,...await sendGiftThanks(env,id,gift.personId,actor)});}
   catch(error){results.push({personId:gift.personId,status:'not_sent',error:error instanceof AdminError?error.message:'Thank-you could not be sent. Open the gift to review it.'});}
  }
  return results;
 }catch{return [{status:'not_sent',error:'Gift saved. Thank-you could not be sent; review it in the ledger.'}];}
}

export async function handleGiftThanks(request:Request,env:AdminEnv,path:string):Promise<Response|null>{
 if(path==='/admin/ledger/gift-thanks/settings'){
  const session=await authenticate(request,env,request.method!=='GET');
  if(request.method==='PUT'){
   const body=await readAdminJson(request);
   if(typeof body.automatic!=='boolean')throw new AdminError(422,'INVALID_SETTING','Choose whether to send automatic thank-you emails.');
   await env.DB.batch([env.DB.prepare('UPDATE gift_thanks_settings SET automatic=? WHERE id=1').bind(body.automatic?1:0),auditStatement(env,'gift_thanks','settings','updated',{automatic:body.automatic,actor:session.user_id})]);
  }else if(request.method!=='GET')throw new AdminError(405,'METHOD_NOT_ALLOWED','Method not allowed.');
  return adminJson(await thanksSettings(env));
 }
 const route=path.match(/^\/admin\/ledger\/entries\/([^/]+)\/thanks(?:\/([^/]+))?$/);
 if(!route)return null;
 const session=await authenticate(request,env,request.method!=='GET');
 const id=decodeURIComponent(route[1]!),personId=route[2]?decodeURIComponent(route[2]):null;
 if(request.method==='GET'&&!personId)return adminJson({gifts:await listGiftThanks(env,id),...await thanksSettings(env)});
 if(request.method==='GET'&&personId){
  const gift=await giftFor(env,id,personId),row=await sentRow(env,id,personId);
  const saved=row&&['sending','uncertain','sent'].includes(row.status)?JSON.parse(row.payload_json) as Payload:null;
  const content=saved?.attachments[0]?.content||await signatureContent(env);
  const message=saved?{subject:saved.subject,text:saved.text,html:saved.html.replace('cid:brent-signature','data:image/png;base64,'+content)}:giftEmail(gift,'data:image/png;base64,'+content);
  return adminJson({...message,to:saved?.to[0]||gift.email,previewHash:await snapshotHash(gift),...deliveryState(row),...await thanksSettings(env)});
 }
 if(request.method==='POST'&&personId){
  const body=await readAdminJson(request);
  if(typeof body.previewHash!=='string')throw new AdminError(422,'PREVIEW_REQUIRED','Preview this gift before sending.');
  return adminJson(await sendGiftThanks(env,id,personId,session.user_id,body.previewHash));
 }
 throw new AdminError(405,'METHOD_NOT_ALLOWED','Method not allowed.');
}
