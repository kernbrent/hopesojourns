import {can,type MmtIdentity} from './mmt-permissions';
import {AdminError,adminJson,authenticate,auditStatement,readAdminJson,type AdminEnv} from './admin';
import {perTravelerAmount,allocatePayment,cents,dollars,fundingStatusStatement} from './ministry-budget';

type Row=Record<string,unknown>;
function line(value:unknown,max=180):string {
 if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f]/.test(value)) throw new AdminError(422,'INVALID_FIELD','Complete the required fields using plain text.');
 return value.trim();
}
function id(value:unknown):string {const result=line(value,36);if(!/^[a-f0-9-]{36}$/i.test(result))throw new AdminError(422,'INVALID_ID','Choose a valid record.');return result;}
async function openCharges(env:AdminEnv,accountId:string,includeInactive=false) {
 return (await env.DB.prepare(`SELECT c.*,
 COALESCE((SELECT SUM(a.amount) FROM trip_payment_applications a WHERE a.charge_id=c.id),0)+
 COALESCE((SELECT SUM(a.amount) FROM trip_award_applications a JOIN trip_coverage_awards w ON w.id=a.award_id WHERE a.charge_id=c.id AND w.status='approved'),0) AS applied
 FROM trip_charges c WHERE c.account_id=?1 ${includeInactive?'':"AND c.status NOT IN ('waived','canceled')"} ORDER BY c.created_at,c.id`).bind(accountId).all<{id:string;amount:number;applied:number;cost_item_id:string;title:string;budget_managed:number;status:string}>()).results;
}

async function inboxItems(env:AdminEnv,user:MmtIdentity):Promise<Row[]> {
 const [requests,payments,messages,events,budgets]=await Promise.all([
 env.DB.prepare(`SELECT s.id,p.first_name || ' ' || p.last_name AS title,s.created_at,
 CASE WHEN EXISTS(SELECT 1 FROM interests i WHERE i.submission_id=s.id AND i.status='new') THEN 'action' ELSE 'completed' END AS status
 FROM interest_submissions s JOIN people p ON p.id=s.person_id ORDER BY s.created_at DESC LIMIT 250`).all<Row>(),
 env.DB.prepare(`SELECT id,display_name AS title,status,callback_status,received_at AS created_at FROM csm_distribution_inbox ORDER BY received_at DESC LIMIT 250`).all<Row>(),
 env.DB.prepare(`SELECT id,trip_id,subject AS title,status,created_at FROM trip_message_outbox WHERE status IN ('failed','sent') ORDER BY created_at DESC LIMIT 100`).all<Row>(),
 env.DB.prepare('SELECT * FROM ministry_events ORDER BY created_at DESC LIMIT 250').all<Row>(),
 env.DB.prepare(`SELECT id,title,updated_at AS created_at, CASE WHEN budget_completed_at IS NULL AND status NOT IN ('archived','canceled','completed') THEN 'action' ELSE 'completed' END AS status FROM trips ORDER BY updated_at DESC LIMIT 100`).all<Row>()]);
 const accessRequests=user.is_admin?(await env.DB.prepare("SELECT id,kind,first_name||' '||last_name AS title,status,created_at FROM mmt_access_requests WHERE (?=1 OR portal='hs') ORDER BY created_at DESC LIMIT 250").bind(user.is_org_admin?1:0).all<Row>()).results:[];
 const failedEmails=user.is_admin?(await env.DB.prepare("SELECT e.id,e.recipient AS title,e.kind,e.created_at FROM mmt_email_events e JOIN mmt_users u ON u.id=e.user_id WHERE e.status='not_sent' AND (?=1 OR u.hs_access=1) ORDER BY e.created_at DESC LIMIT 100").bind(user.is_org_admin?1:0).all<Row>()).results:[];
 const items:Row[]=[
 ...failedEmails.map(r=>({...r,id:'account-email:'+r.id,kind:'Account email',status:'action',detail:'Account email was not sent. Review delivery and send fresh instructions.',action_url:'/admin/account/#users'})),
 ...accessRequests.map(r=>({...r,id:'access:'+r.id,kind:r.kind==='access'?'Access request':'Account recovery',detail:'Review account access and verify identity before approving recovery.',status:r.status==='pending'?'action':'completed',action_url:'/admin/account/#users'})),
 ...(can(user,'contacts')?requests.results:[]).map(r=>({...r,id:'request:'+r.id,kind:'Traveler request',detail:'Review the submitted interest and update its follow-up status.',action_url:'/admin/#requests'})),
 ...(can(user,'finances')?payments.results:[]).map(r=>({...r,id:'payment:'+r.id,kind:'Payment',detail:r.callback_status==='failed'?'Decision callback failed. Review the payment inbox.':`Payment ${r.status}.`,status:['pending','needs_match','failed'].includes(String(r.status))||r.callback_status==='failed'?'action':'completed',action_url:'/admin/#csm-inbox'})),
 ...(can(user,'trips')?messages.results:[]).map(r=>({...r,id:'message:'+r.id,kind:'Trip message',status:r.status==='failed'?'action':'completed',detail:r.status==='failed'?'Review the failed message before retrying.':'Message sent.',action_url:'/admin/trips/?trip='+r.trip_id})),
 ...(can(user,'trips')?budgets.results:[]).map(r=>({...r,id:'budget:'+r.id,kind:'Trip preparation',detail:'Finish estimates and review traveler charges.',action_url:'/admin/trips/?trip='+r.id})),
 ...(user.is_admin?events.results:[]).map(r=>({...r,id:'event:'+r.id,kind:'Activity'}))
 ].sort((a,b)=>String((b as Row).created_at).localeCompare(String((a as Row).created_at)));
 const saved=(await env.DB.prepare('SELECT * FROM ministry_inbox_states').all<Row>()).results;
 const states=new Map(saved.map(row=>[row.item_id,row]));
 return items.map(item=>{const saved=states.get(item.id);return {...item,source_status:item.status,status:saved?.status||item.status,manually_completed:saved?.status==='completed',inbox_updated_at:saved?.updated_at||null};});
}

async function updateInbox(request:Request,env:AdminEnv,user:MmtIdentity){
 if(!can(user,'inbox',true))throw new AdminError(403,'ACCESS_DENIED','You need edit access to the inbox.');
 const body=await readAdminJson(request),itemId=line(body.itemId,100),action=line(body.action,20);
 if(!['complete','reopen','delete','restore'].includes(action))throw new AdminError(422,'INVALID_ACTION','Choose Complete, Reopen, Delete, or Restore.');
 const item=(await inboxItems(env,user)).find(item=>item.id===itemId);
 if(!item)throw new AdminError(404,'INBOX_ITEM_NOT_FOUND','This inbox item is no longer available to you. Refresh the inbox.');
 const now=new Date().toISOString();
 const existing=await env.DB.prepare('SELECT status,previous_status FROM ministry_inbox_states WHERE item_id=?').bind(itemId).first<{status:string;previous_status:string|null}>();
 if(action==='restore'&&existing?.status!=='deleted'||action==='reopen'&&existing?.status!=='completed')throw new AdminError(409,'INBOX_STATE_CHANGED','This item changed. Refresh the inbox before trying again.');
 if(action==='complete'&&existing?.status==='deleted')throw new AdminError(409,'INBOX_ITEM_DELETED','Restore this item before marking it completed.');
 const next=action==='delete'?'deleted':action==='complete'?'completed':action==='restore'?existing?.previous_status:null;
 const previous=action==='delete'?(existing?.status==='deleted'?existing.previous_status:existing?.status==='completed'?'completed':null):null;
 await env.DB.batch([
 next?env.DB.prepare('INSERT INTO ministry_inbox_states(item_id,status,previous_status,updated_by,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET status=excluded.status,previous_status=excluded.previous_status,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(itemId,next,previous,user.id,now):env.DB.prepare('DELETE FROM ministry_inbox_states WHERE item_id=?').bind(itemId),
 auditStatement(env,'ministry_inbox',itemId,action,{inboxOnly:true,actorUserId:user.id})
 ]);
 return adminJson({success:true,itemId,action});
}

async function account(env:AdminEnv,accountId:string) {
 const row=await env.DB.prepare('SELECT * FROM trip_accounts WHERE id=?1').bind(accountId).first<Row>();
 if(!row)throw new AdminError(404,'NOT_FOUND','Account not found.');
 const [charges,payments,awards]=await Promise.all([openCharges(env,accountId),
 env.DB.prepare('SELECT p.*,s.name AS funding_source_name FROM trip_payments p LEFT JOIN trip_funding_sources s ON s.id=p.funding_source_id WHERE p.account_id=?1 ORDER BY p.created_at DESC').bind(accountId).all(),
 env.DB.prepare('SELECT a.*,s.name AS funding_source_name FROM trip_coverage_awards a JOIN trip_funding_sources s ON s.id=a.funding_source_id WHERE a.account_id=?1 ORDER BY a.created_at DESC').bind(accountId).all()]);
 const unapplied=await env.DB.prepare(`SELECT p.id,'payment' AS kind,p.amount-COALESCE((SELECT SUM(a.amount) FROM trip_payment_applications a WHERE a.payment_id=p.id),0) AS remaining,p.payer_name AS label
 FROM trip_payments p WHERE p.account_id=?1 AND p.status='received' AND p.purpose IN ('trip_payment','admin_fee','other')
 UNION ALL SELECT w.id,'support',w.amount-COALESCE((SELECT SUM(a.amount) FROM trip_award_applications a WHERE a.award_id=w.id),0),w.reason
 FROM trip_coverage_awards w WHERE w.account_id=?1 AND w.status='approved'`).bind(accountId).all<{id:string;kind:string;remaining:number;label:string}>();
 return {account:row,charges,payments:payments.results,awards:awards.results,unapplied:unapplied.results.filter(r=>cents(r.remaining)>0)};
}

async function applyExisting(request:Request,env:AdminEnv,accountId:string){
 const body=await readAdminJson(request);const data=await account(env,accountId);
 const operationId=id(body.operationId);
 if(await env.DB.prepare('SELECT id FROM ministry_operations WHERE id=?1').bind(operationId).first())return adminJson({alreadyRecorded:true});
 const source=data.unapplied.find(r=>r.id===body.sourceId);const amount=Number(body.amount);
 if(!source||cents(amount)>cents(source.remaining))throw new AdminError(409,'NO_AVAILABLE_FUNDING','Refresh the account and choose available funding.');
 const now=new Date().toISOString();const allocations=allocatePayment(amount,data.charges);
 await env.DB.batch([env.DB.prepare('INSERT INTO ministry_operations(id,created_at) VALUES(?1,?2)').bind(operationId,now),...allocations.map(a=>source.kind==='payment'
 ?env.DB.prepare(`INSERT INTO trip_payment_applications(payment_id,charge_id,amount,created_at) VALUES(?1,?2,?3,?4)
 ON CONFLICT(payment_id,charge_id) DO UPDATE SET amount=amount+excluded.amount`).bind(source.id,a.chargeId,a.amount,now)
 :env.DB.prepare(`INSERT INTO trip_award_applications(award_id,charge_id,amount) VALUES(?1,?2,?3)
 ON CONFLICT(award_id,charge_id) DO UPDATE SET amount=amount+excluded.amount`).bind(source.id,a.chargeId,a.amount)),fundingStatusStatement(env,accountId,now),auditStatement(env,'trip_account',accountId,'existing_funding_applied',{sourceId:source.id,amount})]);
 return adminJson({ok:true});
}

async function applySupport(request:Request,env:AdminEnv,accountId:string) {
 const session=await authenticate(request,env,true);const body=await readAdminJson(request);
 const data=await account(env,accountId);const operation=id(body.operationId);
 if(await env.DB.prepare('SELECT id FROM ministry_operations WHERE id=?1').bind(operation).first())return adminJson({alreadyRecorded:true});
 const amount=Number(body.amount);const selected=body.chargeId?data.charges.filter(c=>c.id===body.chargeId):data.charges;
 const allocations=allocatePayment(amount,selected);
 const source=line(body.fundingSourceId,100);
 if(!await env.DB.prepare("SELECT id FROM trip_funding_sources WHERE id=?1 AND status='active'").bind(source).first())throw new AdminError(422,'INVALID_SOURCE','Choose an active funding source.');
 const now=new Date().toISOString();const awardId=crypto.randomUUID();const reason=line(body.reason,1000);
 await env.DB.batch([
 env.DB.prepare('INSERT INTO ministry_operations(id,created_at) VALUES(?1,?2)').bind(operation,now),
 env.DB.prepare(`INSERT INTO trip_coverage_awards(id,trip_id,account_id,funding_source_id,award_type,amount,award_date,status,reason,approved_by_session_id,created_at,updated_at)
 VALUES(?1,?2,?3,?4,'scholarship',?5,?6,'approved',?7,?8,?9,?9)`).bind(awardId,data.account.trip_id,accountId,source,amount,now.slice(0,10),reason,session.id,now),
 ...allocations.map(a=>env.DB.prepare('INSERT INTO trip_award_applications(award_id,charge_id,amount) VALUES(?1,?2,?3)').bind(awardId,a.chargeId,a.amount)),
 fundingStatusStatement(env,accountId,now),auditStatement(env,'trip_coverage_award',awardId,'allocated',{accountId,amount,reason})]);
 return adminJson({id:awardId});
}

async function budgetReview(request:Request,env:AdminEnv,tripId:string) {
 await authenticate(request,env,request.method==='POST');
 const trip=await env.DB.prepare('SELECT * FROM trips WHERE id=?1').bind(tripId).first<Row>();
 if(!trip)throw new AdminError(404,'NOT_FOUND','Trip not found.');
 const lines=(await env.DB.prepare('SELECT * FROM trip_cost_items WHERE trip_id=?1').bind(tripId).all<import('./ministry-budget').BudgetLine>()).results;
 const accounts=(await env.DB.prepare("SELECT id,name FROM trip_accounts WHERE trip_id=?1 AND status='active' AND account_type='individual'").bind(tripId).all<{id:string;name:string}>()).results;
 const changes:{accountId:string;accountName:string;costId:string;chargeId:string|null;title:string;before:number;after:number;applied:number}[]=[];
 for(const acct of accounts){
  const charges=await openCharges(env,acct.id,true);
  for(const item of lines){
   if(item.account_id && item.account_id!==acct.id)continue;
   const inactive=!item.bill_to_traveler||item.payment_status==='canceled';
   if(item.needs_estimate&&!inactive)continue;
   const after=inactive?0:perTravelerAmount(item,Number(trip.paying_traveler_count));
   const charge=charges.find(c=>c.cost_item_id===item.id && c.budget_managed===1);
   if(charge?.status==='waived')continue;
   const before=charge?.status==='canceled'?0:charge?.amount??0;
   if(cents(before)!==cents(after))changes.push({accountId:acct.id,accountName:acct.name,costId:item.id,chargeId:charge?.id??null,title:item.description,before,after,applied:charge?.applied??0});
  }
 }
 const snapshot=JSON.stringify({updated:trip.updated_at,lines,changes});
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(snapshot));
 const revision=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 if(request.method==='GET')return adminJson({changes,revision,unfinished:lines.filter(l=>l.needs_estimate).length});
 const body=await readAdminJson(request);
 if(body.revision!==revision)throw new AdminError(409,'STALE_BUDGET','The budget or payments changed. Review the new preview.');
 if(changes.some(c=>cents(c.after)<cents(c.applied)))throw new AdminError(409,'PAID_CHARGE','A revised charge is below its payments. Resolve that payment before changing this charge.');
 const now=new Date().toISOString();const statements:D1PreparedStatement[]=[];
 for(const c of changes){
  if(c.chargeId) statements.push(env.DB.prepare("UPDATE trip_charges SET amount=?1,title=?2,status=?3,updated_at=?4 WHERE id=?5").bind(c.after||c.before,c.title,c.after===0?'canceled':c.applied>=c.after?'paid':c.applied>0?'partially_paid':'open',now,c.chargeId));
  else if(c.after>0)statements.push(env.DB.prepare(`INSERT INTO trip_charges(id,trip_id,account_id,cost_item_id,title,purpose,amount,budget_managed,created_at,updated_at)
   VALUES(?1,?2,?3,?4,?5,?6,?7,1,?8,?8)`).bind(crypto.randomUUID(),tripId,c.accountId,c.costId,c.title,lines.find(l=>l.id===c.costId)?.category_id==='category-hs-admin'?'admin_fee':'trip_payment',c.after,now));
 }
 if(statements.length)await env.DB.batch([...statements,auditStatement(env,'trip',tripId,'budget_charges_reviewed',{changes})]);
 return adminJson({updated:changes.length});
}

const MAX_DOCUMENT_BYTES=10*1024*1024;
async function limitedForm(request:Request) {
 const reader=request.body?.getReader();if(!reader)throw new AdminError(422,'FILE_REQUIRED','Choose a document.');
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_DOCUMENT_BYTES+128*1024){await reader.cancel();throw new AdminError(413,'FILE_TOO_LARGE','Use a document smaller than 10 MB.');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return new Response(bytes,{headers:{'Content-Type':request.headers.get('Content-Type')||''}}).formData();
}
export function documentMedia(filename:string,bytes:Uint8Array):string {
 const ext=filename.split('.').pop()?.toLowerCase();
 const prefix=Array.from(bytes.slice(0,5));
 if(ext==='pdf' && prefix.join(',')==='37,80,68,70,45')return 'application/pdf';
 if(['docx','xlsx','pptx'].includes(ext||'')&&bytes[0]===80&&bytes[1]===75&&bytes[2]===3&&bytes[3]===4)return 'application/octet-stream';
 if(ext==='png'&&bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10')return 'image/png';
 if(['jpg','jpeg'].includes(ext||'')&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 throw new AdminError(422,'UNSUPPORTED_FILE','Upload a PDF, Word, Excel, PowerPoint, PNG, or JPEG document matching its file extension.');
}
async function documents(request:Request,env:AdminEnv,documentId?:string,versionId?:string) {
 await authenticate(request,env,request.method!=='GET');
 if(versionId){
  const row=await env.DB.prepare('SELECT v.* FROM ministry_document_versions v JOIN ministry_documents d ON d.id=v.document_id WHERE v.id=?1 AND d.id=?2 AND d.deleted_at IS NULL').bind(versionId,documentId).first<{object_key:string;filename:string;media_type:string}>();
  if(!row)throw new AdminError(404,'NOT_FOUND','Document not found.');const object=await env.RECEIPTS.get(row.object_key);
  if(!object)throw new AdminError(404,'NOT_FOUND','Document file not found.');
  return new Response(object.body,{headers:{'Content-Type':row.media_type,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(row.filename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(request.method==='GET'){
  const rows=await env.DB.prepare(`SELECT d.*,v.id AS version_id,v.filename,v.file_size,v.created_at AS version_date
   FROM ministry_documents d LEFT JOIN ministry_document_versions v ON v.document_id=d.id
   WHERE (?1 IS NULL OR d.id=?1) ORDER BY d.updated_at DESC,v.created_at DESC`).bind(documentId??null).all();
  return adminJson({documents:rows.results});
 }
 const now=new Date().toISOString();
 if(request.method==='DELETE'||request.method==='PATCH'){
  if(!documentId)throw new AdminError(422,'ID_REQUIRED','Choose a document.');
  await env.DB.batch([env.DB.prepare('UPDATE ministry_documents SET deleted_at=?1,updated_at=?2 WHERE id=?3').bind(request.method==='DELETE'?now:null,now,documentId),auditStatement(env,'ministry_document',documentId,request.method==='DELETE'?'trashed':'restored')]);return adminJson({ok:true});
 }
 const form=await limitedForm(request);const file=form.get('file');
 if(!(file instanceof File)||!file.size||file.size>MAX_DOCUMENT_BYTES)throw new AdminError(422,'FILE_REQUIRED','Choose a document up to 10 MB.');
 const filename=file.name.replace(/[\\/\u0000-\u001f]/g,'_').slice(0,180);const bytes=new Uint8Array(await file.arrayBuffer());const media=documentMedia(filename,bytes);
 const title=line(form.get('title')||filename);const category=line(form.get('category')||'General');const tripId=form.get('tripId')?id(form.get('tripId')):null;
 if(documentId&&!await env.DB.prepare('SELECT id FROM ministry_documents WHERE id=?1 AND deleted_at IS NULL').bind(documentId).first())throw new AdminError(404,'NOT_FOUND','Document not found.');
 const docId=documentId??crypto.randomUUID();const version=crypto.randomUUID();const key=`ministry-documents/${docId}/${version}`;
 await env.RECEIPTS.put(key,bytes,{httpMetadata:{contentType:media}});
 try{await env.DB.batch([
 documentId?env.DB.prepare('UPDATE ministry_documents SET title=?1,category=?2,trip_id=?3,updated_at=?4 WHERE id=?5').bind(title,category,tripId,now,docId):env.DB.prepare('INSERT INTO ministry_documents(id,title,category,trip_id,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?5)').bind(docId,title,category,tripId,now),
 env.DB.prepare('INSERT INTO ministry_document_versions(id,document_id,object_key,filename,media_type,file_size,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7)').bind(version,docId,key,filename,media,file.size,now),auditStatement(env,'ministry_document',docId,documentId?'replaced':'uploaded',{filename,category})]);}
 catch(error){await env.RECEIPTS.delete(key);throw error;}
 return adminJson({id:docId,versionId:version},201);
}

export async function handleMinistryAdminRequest(request:Request,env:AdminEnv,path:string):Promise<Response>{
 try{
  const session=await authenticate(request,env,request.method!=='GET');
  if(path==='/admin/ministry/inbox'&&request.method==='GET')return adminJson({items:await inboxItems(env,session.user),canManage:can(session.user,'inbox',true)});
  if(path==='/admin/ministry/inbox'&&request.method==='POST')return await updateInbox(request,env,session.user);
  if(path==='/admin/ministry/travel-reserve'&&request.method==='GET'){
   const received=await env.DB.prepare(`SELECT COALESCE(SUM(a.amount),0) AS amount FROM trip_payment_applications a
    JOIN trip_payments p ON p.id=a.payment_id JOIN trip_charges c ON c.id=a.charge_id JOIN trip_cost_items i ON i.id=c.cost_item_id
    WHERE i.template_key='hs-leadership' AND p.status='received' AND p.settlement_route='through_hs'`).first<{amount:number}>();
   const spent=await env.DB.prepare(`SELECT COALESCE(SUM(actual_total),0) AS amount FROM trip_cost_items
    WHERE template_key='hs-leader-expense' AND payment_status='paid' AND settlement_route='through_hs'`).first<{amount:number}>();
   return adminJson({received:Number(received?.amount??0),spent:Number(spent?.amount??0),balance:dollars(cents(Number(received?.amount??0))-cents(Number(spent?.amount??0)))});
  }
  const docs=path.match(/^\/admin\/ministry\/documents(?:\/([a-f0-9-]{36}))?(?:\/versions\/([a-f0-9-]{36}))?$/i);
  if(docs && ['GET','POST','DELETE','PATCH'].includes(request.method))return await documents(request,env,docs[1],docs[2]);
  const acct=path.match(/^\/admin\/ministry\/accounts\/([a-f0-9-]{36})(?:\/(support|plan|apply-existing))?$/i);
  if(acct){
   if(request.method==='GET'&&!acct[2])return adminJson(await account(env,acct[1]));
   if(request.method==='POST'&&acct[2]==='support')return await applySupport(request,env,acct[1]);
   if(request.method==='POST'&&acct[2]==='apply-existing')return await applyExisting(request,env,acct[1]);
   if(request.method==='POST'&&acct[2]==='plan'){
    const body=await readAdminJson(request);if(!['self_funded','multiple_sources'].includes(String(body.plan)))throw new AdminError(422,'INVALID_PLAN','Choose a payment plan.');
    await env.DB.batch([env.DB.prepare('UPDATE trip_accounts SET payment_plan=?1 WHERE id=?2').bind(body.plan,acct[1]),auditStatement(env,'trip_account',acct[1],'payment_plan_changed',{plan:body.plan})]);return adminJson({ok:true});
   }
  }
  const review=path.match(/^\/admin\/ministry\/trips\/([a-f0-9-]{36})\/budget-review$/i);
  if(review&&['GET','POST'].includes(request.method))return await budgetReview(request,env,review[1]);
  throw new AdminError(404,'NOT_FOUND','Not found.');
 }catch(error){if(error instanceof AdminError)return adminJson({error:error.message,code:error.code},error.status,error.headers);console.error(JSON.stringify({event:'ministry_error',message:error instanceof Error?error.message:'Unknown error'}));return adminJson({error:'The change could not be completed. Refresh and try again.',code:'MINISTRY_ERROR'},500);}
}
