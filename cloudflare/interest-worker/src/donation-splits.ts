import {AdminError,adminJson,authenticate,readAdminJson,secureEqual,type AdminEnv} from './admin';
import {can} from './mmt-permissions';
import {validateAllocations,type DonationAllocation} from './donation-allocation';
type Parent={id:string;charitable_amount:number;amount:number;gross:number|null;fee:number|null;net:number|null;name:string;transaction_date:string;entry_type:string;updated_at:string};
export async function splitSnapshot(env:AdminEnv,id:string){
 const parent=await env.DB.prepare('SELECT id,charitable_amount,amount,gross,fee,net,name,transaction_date,entry_type,updated_at FROM ledger_entries WHERE id=?').bind(id).first<Parent>();
 if(!parent)throw new AdminError(404,'NOT_FOUND','Donation not found.');
 const split=await env.DB.prepare('SELECT * FROM donation_splits WHERE entry_id=?').bind(id).first<{revision:number;allocations_json:string}>();
 const history=await env.DB.prepare('SELECT revision,allocations_json,updated_at,actor FROM donation_split_history WHERE entry_id=? ORDER BY revision DESC LIMIT 50').bind(id).all();
 return {parent,totalCents:Math.round(parent.charitable_amount*100),revision:split?.revision||0,allocations:JSON.parse(split?.allocations_json||'[]') as DonationAllocation[],history:history.results};
}
export async function saveSplit(env:AdminEnv,id:string,body:Record<string,unknown>,actor:string){
 const snapshot=await splitSnapshot(env,id);
 if(snapshot.parent.entry_type!=='income'||snapshot.totalCents<=0)throw new AdminError(422,'NOT_DONATION','Only income with a charitable amount can be split.');
 if(!Number.isInteger(body.revision)||body.revision!==snapshot.revision)throw new AdminError(409,'STALE_SPLIT','This split changed. Close and reopen it before saving.');
 if(body.parentVersion!==snapshot.parent.updated_at)throw new AdminError(409,'STALE_DONATION','This donation changed. Close and reopen it before saving.');
 let rows:DonationAllocation[];try{rows=validateAllocations(body.allocations,snapshot.totalCents);}catch(e){throw new AdminError(422,'INVALID_SPLIT',(e as Error).message);}
 const statements:D1PreparedStatement[]=[env.DB.prepare(`INSERT INTO donation_split_guards(value) SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM ledger_entries WHERE id=? AND updated_at=?) OR COALESCE((SELECT revision FROM donation_splits WHERE entry_id=?),0)!=?`).bind(id,snapshot.parent.updated_at,id,snapshot.revision)],now=new Date().toISOString();
 statements.push(...await allocationContacts(env,rows,now));
 // The optimistic update and all contact inserts are one atomic D1 batch.
 statements.push(env.DB.prepare(`INSERT INTO donation_splits(entry_id,revision,allocations_json,updated_at,actor) VALUES(?,?,?,?,?) ON CONFLICT(entry_id) DO UPDATE SET revision=excluded.revision,allocations_json=excluded.allocations_json,updated_at=excluded.updated_at,actor=excluded.actor WHERE donation_splits.revision=?`).bind(id,snapshot.revision+1,JSON.stringify(rows),now,actor,snapshot.revision));
 // Force rollback, including contact creation, when a concurrent save won.
 statements.push(env.DB.prepare(`INSERT INTO donation_split_guards(value) SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM donation_splits WHERE entry_id=? AND revision=? AND updated_at=? AND actor=?)`).bind(id,snapshot.revision+1,now,actor));
 try{await env.DB.batch(statements);}catch{throw new AdminError(409,'SPLIT_CHANGED','The donation or split changed. Close and reopen it before saving.');}
 return splitSnapshot(env,id);
}
export async function donationSplits(request:Request,env:AdminEnv,id:string){
 const session=await authenticate(request,env,request.method==='PUT');
 if(!can(session.user,'contacts',request.method==='PUT'))throw new AdminError(403,'ACCESS_DENIED','Donor access is required to view or edit splits.');
 if(request.method==='GET'){
  const snapshot=await splitSnapshot(env,id);
  const people=await env.DB.prepare('SELECT id,first_name,last_name,email FROM people ORDER BY first_name,last_name LIMIT 5000').all();
  return adminJson({...snapshot,people:people.results});
 }
 return adminJson(await saveSplit(env,id,await readAdminJson(request),session.user_id));
}
export async function internalDonationSplits(request:Request,env:AdminEnv){
 try{
  if(request.method!=='POST'||!env.CSM_DISTRIBUTION_SECRET||!await secureEqual(request.headers.get('X-CSM-Distribution-Secret')||'',env.CSM_DISTRIBUTION_SECRET))throw new AdminError(401,'UNAUTHORIZED','Unauthorized.');
  const body=await readAdminJson(request);
  const ids=body.sourceIds;
  if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>typeof id!=='string'||id.length>180))throw new AdminError(422,'INVALID_IDS','Choose valid source records.');
  const records=await env.DB.prepare(`SELECT l.*,s.revision,s.allocations_json,json_extract(i.payload_json,'$.transaction.sourceRecordId') AS source_id FROM ledger_entries l LEFT JOIN donation_splits s ON s.entry_id=l.id JOIN financial_transactions f ON f.id=l.financial_transaction_id JOIN csm_distribution_inbox i ON i.id=f.source_inbox_id WHERE i.status='approved' AND json_extract(i.payload_json,'$.transaction.sourceRecordId') IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all<Parent & {source_id:string;revision:number|null;allocations_json:string|null}>();
  if(body.operation==='save'){
   if(ids.length!==1||records.results.length!==1)throw new AdminError(409,'NOT_READY','The HS donation is not available for editing yet.');
   return adminJson(await saveSplit(env,records.results[0]!.id,body,typeof body.actor==='string'?body.actor.slice(0,120):'CSM administrator'));
  }
  if(body.includePeople===true&&ids.length!==1)throw new AdminError(422,'INVALID_IDS','Open one donation at a time.');
  const people=body.includePeople===true?(await env.DB.prepare('SELECT id,first_name,last_name,email FROM people ORDER BY first_name,last_name LIMIT 5000').all()).results:undefined;
  const snapshots:Record<string,unknown>={};
  for(const row of records.results){
   if(people)snapshots[row.source_id]={...await splitSnapshot(env,row.id),people};
   else {const {source_id,revision,allocations_json,...parent}=row;snapshots[source_id]={parent,totalCents:Math.round(parent.charitable_amount*100),revision:revision||0,allocations:JSON.parse(allocations_json||'[]'),history:[]};}
  }
  return adminJson({snapshots});
 }catch(e){if(e instanceof AdminError)return adminJson({error:e.message,code:e.code},e.status);return adminJson({error:'Unable to load donation allocations.'},500);}
}

export async function allocationContacts(env:AdminEnv,rows:DonationAllocation[],now:string){
 const statements:D1PreparedStatement[]=[];
 if(!rows.length)return statements;
 type Person={id:string;first_name:string;last_name:string;email:string};
 // One lookup for the entire split keeps large splits within D1 query limits.
 const candidates=await env.DB.prepare(`SELECT p.id,p.first_name,p.last_name,p.email FROM people p WHERE EXISTS (
  SELECT 1 FROM json_each(?) a WHERE p.id=json_extract(a.value,'$.personId') OR
  (p.first_name_normalized=lower(json_extract(a.value,'$.firstName')) AND p.last_name_normalized=lower(json_extract(a.value,'$.lastName')) AND p.email_normalized=json_extract(a.value,'$.email'))
 )`).bind(JSON.stringify(rows.map(row=>({...row,firstName:row.firstName.toLowerCase(),lastName:row.lastName.toLowerCase()})))).all<Person>();
 const identity=(first:string,last:string,email:string)=>JSON.stringify([first.toLowerCase(),last.toLowerCase(),email.toLowerCase()]);
 const byId=new Map(candidates.results.map(p=>[p.id,p]));
 const byIdentity=new Map(candidates.results.map(p=>[identity(p.first_name,p.last_name,p.email),p]));
 const created:Person[]=[],donors=new Set<string>();
 for(const row of rows){
  const key=identity(row.firstName,row.lastName,row.email);
  let person=row.personId?byId.get(row.personId):byIdentity.get(key);
  if(row.personId&&!person)throw new AdminError(422,'PERSON_NOT_FOUND','Choose a donor who still exists.');
  if(!person){person={id:crypto.randomUUID(),first_name:row.firstName,last_name:row.lastName,email:row.email};created.push(person);byIdentity.set(key,person);}
  row.personId=person.id;row.firstName=person.first_name;row.lastName=person.last_name;row.email=person.email;donors.add(person.id);
 }
 // Chunk bindings below D1's per-statement parameter limit; all writes join the caller's atomic batch.
 for(let i=0;i<created.length;i+=8){
  const chunk=created.slice(i,i+8);
  statements.push(env.DB.prepare(`INSERT INTO people(id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,contact_preference,record_source,contact_status,created_at,updated_at) VALUES ${chunk.map(()=>"(?,?,?,?,?,?,?,'email','manual','active',?,?)").join(',')}`).bind(...chunk.flatMap(p=>[p.id,p.first_name,p.last_name,p.first_name.toLowerCase(),p.last_name.toLowerCase(),p.email,p.email,now,now])));
 }
 const ids=[...donors];for(let i=0;i<ids.length;i+=40){const chunk=ids.slice(i,i+40);statements.push(env.DB.prepare(`INSERT OR IGNORE INTO contact_types(person_id,contact_type,created_at) VALUES ${chunk.map(()=>"(?,'donor',?)").join(',')}`).bind(...chunk.flatMap(id=>[id,now])));}
 return statements;
}
