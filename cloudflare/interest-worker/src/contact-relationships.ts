import {AdminError,adminJson,authenticate,auditStatement,readAdminJson,type AdminEnv} from './admin';
import {can} from './mmt-permissions';
const inverse=(type:string)=>type==='parent'?'child':type==='child'?'parent':type;
const types=['spouse','parent','child','sibling','other'];
export async function contactRelationships(request:Request,env:AdminEnv,personId:string){
 const session=await authenticate(request,env,request.method!=='GET');
 const person=await env.DB.prepare('SELECT id,email_shared FROM people WHERE id=?').bind(personId).first<{id:string;email_shared:number}>();
 if(!person)throw new AdminError(404,'PERSON_NOT_FOUND','This contact was not found.');
 if(request.method==='GET'){
  const rows=await env.DB.prepare(`SELECT r.person_a,r.person_b,r.relationship,p.id,p.first_name,p.last_name,p.email,p.phone
   FROM contact_relationships r JOIN people p ON p.id=CASE WHEN r.person_a=? THEN r.person_b ELSE r.person_a END
   WHERE r.person_a=? OR r.person_b=? ORDER BY p.last_name,p.first_name`).bind(personId,personId,personId).all<{person_a:string;relationship:string;id:string;first_name:string;last_name:string;email:string;phone:string|null}>();
  return adminJson({emailShared:!!person.email_shared,canEdit:can(session.user,'contacts',true),relationships:rows.results.map(p=>({id:p.id,firstName:p.first_name,lastName:p.last_name,email:p.email,phone:p.phone,relationship:p.person_a===personId?p.relationship:inverse(p.relationship)}))});
 }
 const body=await readAdminJson(request),now=new Date().toISOString();
 if(request.method==='PUT'){
  if(typeof body.emailShared!=='boolean')throw new AdminError(422,'INVALID_SHARED_EMAIL','Choose whether this email is shared.');
  await env.DB.batch([env.DB.prepare('UPDATE people SET email_shared=?,updated_at=? WHERE id=?').bind(Number(body.emailShared),now,personId),auditStatement(env,'person',personId,'shared_email_updated',{emailShared:body.emailShared})]);
  return adminJson({success:true});
 }
 if(request.method!=='POST'&&request.method!=='DELETE')throw new AdminError(405,'METHOD_NOT_ALLOWED','Method not allowed.');
 const otherId=typeof body.personId==='string'?body.personId:'';
 if(otherId===personId)throw new AdminError(422,'SELF_RELATIONSHIP','Choose a different contact.');
 if(!await env.DB.prepare('SELECT id FROM people WHERE id=?').bind(otherId).first())throw new AdminError(422,'PERSON_NOT_FOUND','Choose an existing contact.');
 const [a,b]=[personId,otherId].sort();
 if(request.method==='DELETE'){
  await env.DB.batch([env.DB.prepare('DELETE FROM contact_relationships WHERE person_a=? AND person_b=?').bind(a,b),auditStatement(env,'person',personId,'relationship_removed',{personId:otherId})]);
 }else{
  if(typeof body.relationship!=='string'||!types.includes(body.relationship))throw new AdminError(422,'INVALID_RELATIONSHIP','Choose a relationship.');
  const type=a===personId?body.relationship:inverse(body.relationship);
  await env.DB.batch([env.DB.prepare(`INSERT INTO contact_relationships(person_a,person_b,relationship,created_at,updated_at) VALUES(?,?,?,?,?)
   ON CONFLICT(person_a,person_b) DO UPDATE SET relationship=excluded.relationship,updated_at=excluded.updated_at`).bind(a,b,type,now,now),auditStatement(env,'person',personId,'relationship_saved',{personId:otherId,relationship:body.relationship})]);
 }
 return adminJson({success:true});
}
