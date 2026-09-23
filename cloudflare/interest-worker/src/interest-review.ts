import {AdminError,adminJson,authenticate,auditStatement,readAdminJson,type AdminEnv} from './admin';
import {can} from './mmt-permissions';
import {matchPhone} from './phone';
import type {InterestSubmission} from './index';
type Row=Record<string,unknown>;
type Trip={id:string;invite_id:string|null};
export const receipt=(id:string)=>({success:true,submissionId:id,message:'Thank you. Your information was received. A Hope Sojourns team member will follow up with you.'});
const email=(v:unknown)=>typeof v==='string'?v.normalize('NFKC').trim().toLocaleLowerCase('en-US'):'';
const phone=(v:unknown)=>{if(typeof v!=='string'||!v.trim())return null;const d=matchPhone(v);return d?.length===11&&d.startsWith('1')?d.slice(1):d;};
const name=(v:string)=>v.normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g,' ').trim();
export async function findContactMatches(env:AdminEnv,input:{email?:unknown;phone?:unknown}){
 const revision=(await env.DB.prepare('SELECT revision FROM contact_match_revision WHERE id=1').first<{revision:number}>())!.revision;
 const e=email(input.email),p=phone(input.phone);
 const contacts=(await env.DB.prepare('SELECT id,first_name,last_name,email,phone,contact_preference,field_of_study,organization,contact_status,updated_at FROM people ORDER BY last_name_normalized,first_name_normalized,id').all<Row>()).results;
 return {revision,matches:contacts.flatMap<Row & {matchBy:string}>(c=>{const byEmail=!!e&&email(c.email)===e,byPhone=!!p&&phone(c.phone)===p;return byEmail||byPhone?[{...c,matchBy:byEmail&&byPhone?'both':byEmail?'email':'phone'}]:[]})};
}
const guard=(env:AdminEnv,revision:number)=>env.DB.prepare('INSERT INTO interest_intake_guards(id,valid) SELECT ?,CASE WHEN revision=? THEN 1 ELSE 0 END FROM contact_match_revision WHERE id=1').bind(crypto.randomUUID(),revision);
function personInsert(env:AdminEnv,id:string,input:InterestSubmission,now:string,intentional=false){return env.DB.prepare(`INSERT INTO people(id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,phone,phone_normalized,contact_preference,field_of_study,created_at,updated_at,approved_duplicate) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,input.firstName,input.lastName,input.firstNameNormalized,input.lastNameNormalized,input.email,input.emailNormalized,input.phone,input.phoneNormalized,input.contactPreference,input.fieldOfStudy,now,now,intentional?1:0);}
function attach(env:AdminEnv,intake:Row,input:InterestSubmission,personId:string,now:string){
 const ids=JSON.parse(String(intake.opportunity_ids_json)) as string[];
 const statements=[env.DB.prepare(`INSERT INTO interest_submissions(id,person_id,idempotency_key,request_fingerprint,selected_opportunities_json,preferred_timing,message,source_page,consent_at,result_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(intake.id,personId,intake.idempotency_key,intake.request_fingerprint,JSON.stringify(input.opportunities),input.preferredTiming,input.message,intake.source_page,intake.created_at,JSON.stringify(receipt(String(intake.id))),intake.created_at,now),
 ...ids.map(id=>env.DB.prepare("INSERT OR IGNORE INTO interests(id,person_id,opportunity_id,submission_id,status,created_at,updated_at) VALUES(?,?,?,?,'new',?,?)").bind(crypto.randomUUID(),personId,id,intake.id,now,now)),
 ...ids.map(id=>env.DB.prepare('INSERT OR IGNORE INTO contact_trips(person_id,opportunity_id,created_at) VALUES(?,?,?)').bind(personId,id,now)),
 env.DB.prepare("INSERT OR IGNORE INTO contact_types(person_id,contact_type,created_at) VALUES(?,'prospective_traveler',?)").bind(personId,now)];
 if(intake.trip_id){statements.push(env.DB.prepare("INSERT OR IGNORE INTO trip_interests(id,trip_id,person_id,submission_id,invite_id,status,created_at,updated_at) VALUES(?,?,?,?,?,'interested',?,?)").bind(crypto.randomUUID(),intake.trip_id,personId,intake.id,intake.invite_id,now,now),env.DB.prepare("INSERT OR IGNORE INTO trip_members(trip_id,person_id,role,status,directory_visible,directory_email_visible,directory_phone_visible,created_at,updated_at) VALUES(?,?,'traveler','interested',0,0,0,?,?)").bind(intake.trip_id,personId,now,now));if(intake.invite_id)statements.push(env.DB.prepare('UPDATE trip_invites SET use_count=use_count+1,updated_at=? WHERE id=?').bind(now,intake.invite_id));}
 return statements;
}
async function prior(env:AdminEnv,input:InterestSubmission,fingerprint:string){
 const found=await env.DB.prepare('SELECT * FROM interest_intake WHERE idempotency_key=? OR request_fingerprint=? ORDER BY idempotency_key=? DESC LIMIT 1').bind(input.idempotencyKey,fingerprint,input.idempotencyKey).first<Row>();
 if(found&&found.idempotency_key===input.idempotencyKey&&found.request_fingerprint!==fingerprint)throw new AdminError(409,'IDEMPOTENCY_KEY_REUSED','This form session was already used. Refresh the page and try again.');return found;
}
export async function receiveInterest(env:AdminEnv,input:InterestSubmission,fingerprint:string,opportunities:{id:string}[],trip:Trip|null,source:string|null){
 for(let attempt=0;attempt<4;attempt++){
 const existing=await prior(env,input,fingerprint);if(existing)return receipt(String(existing.id));
 const {revision,matches}=await findContactMatches(env,input),id=crypto.randomUUID(),now=new Date().toISOString(),personId=matches.length?null:crypto.randomUUID();
 const intake={id,idempotency_key:input.idempotencyKey,request_fingerprint:fingerprint,opportunity_ids_json:JSON.stringify(opportunities.map(o=>o.id)),trip_id:trip?.id||null,invite_id:trip?.invite_id||null,source_page:source,created_at:now};
 const statements=[guard(env,revision),env.DB.prepare('INSERT INTO interest_intake(id,idempotency_key,request_fingerprint,payload_json,opportunity_ids_json,trip_id,invite_id,source_page,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,input.idempotencyKey,fingerprint,JSON.stringify({...input,inviteToken:null}),intake.opportunity_ids_json,intake.trip_id,intake.invite_id,source,matches.length?'pending':'accepted',now)];
 if(personId)statements.push(personInsert(env,personId,input,now),...attach(env,intake,input,personId,now),env.DB.prepare("UPDATE interest_intake SET person_id=?,resolved_at=?,decision='automatic_new' WHERE id=?").bind(personId,now,id));
 statements.push(auditStatement(env,'interest_intake',id,matches.length?'review_required':'automatic_new',{personId,matchIds:matches.map(m=>m.id)}),env.DB.prepare('DELETE FROM interest_intake_guards'));
 try{await env.DB.batch(statements);return receipt(id);}catch(error){const saved=await prior(env,input,fingerprint);if(saved)return receipt(String(saved.id));if(!(error instanceof Error)||!/CHECK constraint|UNIQUE constraint/.test(error.message)||attempt===3)throw error;}
 }
 throw new AdminError(409,'RETRY','Please submit again.');
}
const fields={firstName:'first_name',lastName:'last_name',email:'email',phone:'phone',contactPreference:'contact_preference',fieldOfStudy:'field_of_study'} as const;
export async function handleInterestReview(request:Request,env:AdminEnv,path:string):Promise<Response>{
 try{
 const write=request.method!=='GET',session=await authenticate(request,env,write);if(!can(session.user,'contacts',write))throw new AdminError(403,'ACCESS_DENIED','Contact access is required.');
 const id=path.split('/').pop()!,intake=await env.DB.prepare('SELECT * FROM interest_intake WHERE id=?').bind(id).first<Row>();if(!intake)throw new AdminError(404,'NOT_FOUND','Submission not found.');
 const input=JSON.parse(String(intake.payload_json)) as InterestSubmission;
 const current=await findContactMatches(env,input);
 if(!write){const history=(await env.DB.prepare("SELECT event_type,metadata_json,created_at FROM audit_events WHERE entity_type='interest_intake' AND entity_id=? ORDER BY created_at").bind(id).all()).results;return adminJson({intake:{id,status:intake.status,submitted:input,tripId:intake.trip_id,createdAt:intake.created_at,decision:intake.decision,personId:intake.person_id},...current,canReview:can(session.user,'contacts',true)&&(!intake.trip_id||can(session.user,'trips',true)),history});}
 if(request.method!=='POST')throw new AdminError(405,'METHOD','Method not allowed.');
 const b=await readAdminJson(request),action=String(b.action);if(!['new','update','reject'].includes(action))throw new AdminError(422,'INVALID_ACTION','Choose Add as new, Update existing, or Reject.');
 const selected=Array.isArray(b.fields)?[...new Set(b.fields.map(String))].sort():[];if(selected.some(k=>!Object.hasOwn(fields,k)))throw new AdminError(422,'INVALID_FIELDS','Choose only the listed submitted fields.');
 const decision=JSON.stringify({action,personId:action==='update'?b.personId:null,fields:action==='update'?selected:[]});
 const already=await env.DB.prepare('SELECT decision_json FROM interest_intake_decisions WHERE intake_id=?').bind(id).first<{decision_json:string}>();
 if(already){if(already.decision_json!==decision)throw new AdminError(409,'RESOLVED','This submission already has a different decision.');return adminJson({ok:true,replayed:true,personId:intake.person_id});}
 if(intake.status!=='pending')throw new AdminError(409,'RESOLVED','This submission is already resolved.');
 if(action!=='reject'&&intake.trip_id&&!can(session.user,'trips',true))throw new AdminError(403,'ACCESS_DENIED','Trip edit access is required to attach these interests.');
 if(action!=='reject'&&Number(b.revision)!==current.revision)throw new AdminError(409,'MATCHES_CHANGED','Contacts changed since this review opened. Refresh and review the current matches.');
 if(action==='new'&&b.confirmSeparate!==true)throw new AdminError(422,'CONFIRM_SEPARATE','Confirm that you intend to create a separate contact.');
 const personId=action==='new'?crypto.randomUUID():action==='update'?String(b.personId):null;
 if(action==='update'&&!current.matches.some(m=>m.id===personId))throw new AdminError(422,'CHOOSE_MATCH','Choose one of the matching contacts.');
 const now=new Date().toISOString(),statements:D1PreparedStatement[]=[env.DB.prepare('INSERT INTO interest_intake_decisions(intake_id,decision_json,reviewer_id,decided_at) VALUES(?,?,?,?)').bind(id,decision,session.user.id,now)];
 if(action!=='reject')statements.push(guard(env,current.revision));
 if(action==='new')statements.push(personInsert(env,personId!,input,now,true));
 if(action==='update'&&selected.length){const assigns:string[]=[],values:unknown[]=[];for(const key of selected){assigns.push(fields[key as keyof typeof fields]+'=?');values.push(input[key as keyof InterestSubmission]);if(key==='firstName'||key==='lastName'){assigns.push((key==='firstName'?'first_name_normalized':'last_name_normalized')+'=?');values.push(name(String(input[key])));}if(key==='email'){assigns.push('email_normalized=?');values.push(email(input.email));}if(key==='phone'){assigns.push('phone_normalized=?');values.push(matchPhone(input.phone));}}
 statements.push(env.DB.prepare('UPDATE people SET '+assigns.join(',')+',updated_at=? WHERE id=?').bind(...values,now,personId));}
 if(personId)statements.push(...attach(env,intake,input,personId,now));
 statements.push(env.DB.prepare('UPDATE interest_intake SET status=?,person_id=?,resolved_at=?,reviewer_id=?,decision=? WHERE id=?').bind(action==='reject'?'rejected':'accepted',personId,now,session.user.id,action,id),auditStatement(env,'interest_intake',id,'review_decision',{reviewerId:session.user.id,decision:action,fields:selected,personId,decidedAt:now,matchIds:current.matches.map(m=>m.id)}),env.DB.prepare('DELETE FROM ministry_inbox_states WHERE item_id=?').bind('duplicate:'+id),env.DB.prepare('DELETE FROM interest_intake_guards'));
 try{await env.DB.batch(statements);}catch(error){const saved=await env.DB.prepare('SELECT decision_json FROM interest_intake_decisions WHERE intake_id=?').bind(id).first<{decision_json:string}>();if(saved?.decision_json===decision){const resolved=await env.DB.prepare('SELECT person_id FROM interest_intake WHERE id=?').bind(id).first<Row>();return adminJson({ok:true,replayed:true,personId:resolved?.person_id});}if(saved||error instanceof Error&&/CHECK constraint|UNIQUE constraint/.test(error.message))throw new AdminError(409,'CONFLICT','The submission or matching contacts changed. Refresh before deciding.');throw error;}
 return adminJson({ok:true,personId});
 }catch(e){if(e instanceof AdminError)return adminJson({error:e.message,code:e.code},e.status);console.error('Interest review failed',e instanceof Error?e.message:'Unknown error');return adminJson({error:'Unable to review this submission.'},500);}
}
