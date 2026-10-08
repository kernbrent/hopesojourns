import {AdminError,adminJson,authenticate,auditStatement,readAdminJson,type AdminEnv} from './admin';
import {can,effectiveUser} from './mmt-permissions';
import {deliverInquiryEmail} from './inquiry-email';
type Row=Record<string,any>;
const rows=async(env:AdminEnv,sql:string,...args:any[])=>(await env.DB.prepare(sql).bind(...args).all<Row>()).results;
export async function handleInquiries(request:Request,env:AdminEnv,path:string):Promise<Response>{
 try{
 const edit=request.method!=='GET',session=await authenticate(request,env,edit);
 if(!can(session.user,'contacts',edit))throw new AdminError(403,'ACCESS_DENIED','Contact access is required.');
 const parts=path.slice('/admin/inquiries'.length).split('/').filter(Boolean),id=parts[0];
 if(parts[1]==='emails'&&request.method==='POST'){
 const mail=await env.DB.prepare('SELECT inquiry_id FROM inquiry_emails WHERE id=?').bind(parts[2]||'').first<Row>();
 if(!mail||mail.inquiry_id!==id)throw new AdminError(404,'NOT_FOUND','Email not found.');
 return adminJson(await deliverInquiryEmail(env,parts[2]));
 }
 if(request.method==='GET'){
 const inquiries=await rows(env,`SELECT w.*,s.person_id,p.first_name,p.last_name,p.email,s.message,s.selected_opportunities_json,t.title trip_title,u.first_name||' '||u.last_name owner_name FROM inquiry_workflows w JOIN interest_submissions s ON s.id=w.submission_id JOIN people p ON p.id=s.person_id LEFT JOIN trips t ON t.id=w.trip_id LEFT JOIN mmt_users u ON u.id=w.owner_id ${id?'WHERE w.submission_id=?':''} ORDER BY w.stage='closed',w.due_date IS NULL,w.due_date,w.created_at DESC`,...(id?[id]:[]));
 if(id&&!inquiries.length)throw new AdminError(404,'NOT_FOUND','Inquiry not found.');
 const owners=(await rows(env,"SELECT * FROM mmt_users WHERE status='active' AND hs_access=1 AND deleted_at IS NULL ORDER BY first_name,last_name")).filter(u=>can(effectiveUser(u as any,'hs'),'contacts',true)).map(u=>({id:u.id,name:u.first_name+' '+u.last_name}));
 const trips=can(session.user,'trips')?await rows(env,"SELECT id,title,start_date,status FROM trips WHERE status NOT IN ('archived','canceled','completed') ORDER BY start_date,title"):[];
 const lists=await rows(env,"SELECT DISTINCT future_list FROM inquiry_workflows WHERE future_list!='' ORDER BY future_list COLLATE NOCASE");
 const emails=id?await rows(env,'SELECT id,kind,status,error,sent_at,updated_at,payload_json FROM inquiry_emails WHERE inquiry_id=? ORDER BY updated_at DESC',id):[];
 const history=id?await rows(env,"SELECT created_at,metadata_json FROM audit_events WHERE entity_type='inquiry' AND entity_id=? ORDER BY created_at DESC",id):[];
 return adminJson({history,inquiries,owners,trips,lists:lists.map(l=>l.future_list),emails:emails.map(e=>({...e,payload_json:undefined,recipient:JSON.parse(e.payload_json).to[0],subject:JSON.parse(e.payload_json).subject})),canEdit:can(session.user,'contacts',true),canEditTrips:can(session.user,'trips',true)});
 }
 if(request.method!=='POST'||!id)throw new AdminError(405,'METHOD','Method not allowed.');
 const before=await env.DB.prepare('SELECT w.*,s.person_id FROM inquiry_workflows w JOIN interest_submissions s ON s.id=w.submission_id WHERE w.submission_id=?').bind(id).first<Row>();
 if(!before)throw new AdminError(404,'NOT_FOUND','Inquiry not found.');
 const b=await readAdminJson(request);
 if(!Number.isInteger(b.revision)||Number(b.revision)!==before.revision)throw new AdminError(409,'CONFLICT','This inquiry changed. Refresh before saving.');
 const line=(v:unknown,max:number)=>{if(typeof v!=='string'||v.length>max)throw new AdminError(422,'INVALID_FIELD','Check the required fields and text lengths.');return v.trim();};
 const route=line(b.path,20),stage=line(b.stage,20),next=line(b.nextAction,500),notes=line(b.notes,4000),reason=line(b.closeReason,500),list=line(b.futureList,180),timing=line(b.preferredTiming,300);
 if(!['general','future','journey'].includes(route)||!['new','contacted','exploring','invited','closed'].includes(stage))throw new AdminError(422,'INVALID_STATUS','Choose a valid inquiry path and stage.');
 if(stage!=='closed'&&(!b.ownerId||!b.dueDate||!next))throw new AdminError(422,'FOLLOWUP_REQUIRED','Choose a responsible person, next action, and follow-up date.');
 if(stage==='closed'&&!reason)throw new AdminError(422,'REASON_REQUIRED','Explain why this inquiry is being closed.');
 if(route==='future'&&!list)throw new AdminError(422,'LIST_REQUIRED','Name or choose a future-interest list.');
 const due=b.dueDate?line(b.dueDate,10):null;
 if(due&&(!/^\d{4}-\d{2}-\d{2}$/.test(due)||!Number.isFinite(Date.parse(due))||new Date(due).toISOString().slice(0,10)!==due))throw new AdminError(422,'INVALID_DATE','Choose a valid follow-up date.');
 if(b.ownerId){const owner=await env.DB.prepare("SELECT * FROM mmt_users WHERE id=? AND status='active' AND hs_access=1 AND deleted_at IS NULL").bind(b.ownerId).first<Row>();if(!owner||!can(effectiveUser(owner as any,'hs'),'contacts',true))throw new AdminError(422,'INVALID_OWNER','Choose an active user with contact edit access.');}
 const tripId=route==='journey'?String(b.tripId||''):null;
 if(route==='journey'&&(tripId!==before.trip_id||stage==='invited'&&before.stage!=='invited')){
 if(!can(session.user,'trips',true))throw new AdminError(403,'ACCESS_DENIED','Trip edit access is required to link a journey.');
 if(!await env.DB.prepare("SELECT id FROM trips WHERE id=? AND status NOT IN ('archived','canceled','completed')").bind(tripId).first())throw new AdminError(422,'INVALID_TRIP','Choose a planned journey.');
 }
 if(stage==='invited'&&route!=='journey')throw new AdminError(422,'INVITE_TRIP','Choose a journey before inviting this person.');
 const now=new Date().toISOString();
 // A revision guard in the transaction protects every associated write.
 const statements=[env.DB.prepare('INSERT INTO interest_intake_guards(id,valid) SELECT ?,CASE WHEN revision=? THEN 1 ELSE 0 END FROM inquiry_workflows WHERE submission_id=?').bind(crypto.randomUUID(),Number(b.revision),id),env.DB.prepare('UPDATE inquiry_workflows SET path=?,future_list=?,preferred_timing=?,trip_id=?,stage=?,owner_id=?,due_date=?,next_action=?,notes=?,close_reason=?,revision=revision+1,updated_at=? WHERE submission_id=?').bind(route,list,timing,tripId,stage,b.ownerId||null,due,next,notes,reason,now,id)];
 if(tripId&&(tripId!==before.trip_id||stage==='invited'&&before.stage!=='invited')){
 statements.push(env.DB.prepare("INSERT INTO trip_members(trip_id,person_id,role,status,directory_visible,directory_email_visible,directory_phone_visible,created_at,updated_at) VALUES(?,?,'traveler',?,0,0,0,?,?) ON CONFLICT(trip_id,person_id) DO UPDATE SET status=CASE WHEN trip_members.status='interested' AND excluded.status='invited' THEN 'invited' ELSE trip_members.status END,updated_at=excluded.updated_at").bind(tripId,before.person_id,stage==='invited'?'invited':'interested',now,now));
 }
 statements.push(auditStatement(env,'inquiry',id,'updated',{actor:session.user.id,path:route,stage,tripId,ownerId:b.ownerId,nextAction:next,notes,futureList:list,preferredTiming:timing,closeReason:reason}),env.DB.prepare('DELETE FROM ministry_inbox_states WHERE item_id=?').bind('request:'+id),env.DB.prepare('DELETE FROM interest_intake_guards'));
 try{await env.DB.batch(statements);}catch(e){if(e instanceof Error&&/CHECK constraint/.test(e.message))throw new AdminError(409,'CONFLICT','This inquiry changed. Refresh before saving.');throw e;}
 return adminJson({ok:true});
 }catch(e){if(e instanceof AdminError)return adminJson({error:e.message,code:e.code},e.status);console.error('Inquiry operation failed');return adminJson({error:'Unable to update inquiry.'},500);}
}
