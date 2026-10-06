import {AdminError, type AdminEnv} from './admin';
import type {User} from './mmt-users';

type Profile={first_name:string;last_name:string;email:string;phone:string;country:string};
type Contact={id:string;first_name:string;last_name:string;email:string;phone:string|null;first_name_normalized:string;last_name_normalized:string;email_normalized:string;phone_normalized:string|null;user_id:string|null};
const normalized=(s:string)=>s.trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US');
const phoneKey=(s:string)=>{const n=s.replace(/\D/g,'');return n.length===11&&n.startsWith('1')?n.slice(1):n;};
const selection=`SELECT p.*,u.id AS user_id FROM people p LEFT JOIN mmt_users u ON u.hs_person_id=p.id AND u.deleted_at IS NULL`;
export async function contactChoices(env:AdminEnv,search:string){
 const term=search.trim().slice(0,120);if(term.length<2)return [];
 // Literal substring matching avoids treating user-entered % and _ as wildcards.
 const r=await env.DB.prepare(selection+` WHERE instr(lower(p.first_name||' '||p.last_name),lower(?))>0 OR instr(p.email_normalized,lower(?))>0 OR (?<>'' AND instr(COALESCE(p.phone_normalized,''),?)>0) ORDER BY p.last_name,p.first_name,p.id LIMIT 50`).bind(term,term,phoneKey(term),phoneKey(term)).all<Contact>();
 return r.results.map(p=>({id:p.id,name:p.first_name+' '+p.last_name,email:p.email,phone:p.phone,user_id:p.user_id}));
}
export async function planPortalContact(env:AdminEnv,b:Record<string,unknown>,u:User|null,p:Profile,enabled:boolean,time:string){
 const statements:D1PreparedStatement[]=[];
 // Keep a durable link when access is removed; never repoint an established identity.
 if(u?.hs_person_id){
  if(b.hsContactId && b.hsContactId!==u.hs_person_id && b.hsContactId!=='auto')throw new AdminError(409,'CONTACT_ALREADY_LINKED','This account is already linked to a contact. Keep that link; contact profiles can be edited under People & ministry.');
  return {id:u.hs_person_id,statements};
 }
 if(!enabled)return {id:null,statements};
 const selected=String(b.hsContactId||'auto');
 if(!['auto','new'].includes(selected)){
  const c=await env.DB.prepare(selection+' WHERE p.id=?').bind(selected).first<Contact>();
  if(!c)throw new AdminError(422,'CONTACT_NOT_FOUND','Choose an existing contact or create a new one.');
  if(c.user_id)throw new AdminError(409,'CONTACT_IN_USE','This contact already has a portal account. Edit that account to restore or change access.');
  return {id:c.id,statements};
 }
 const key=phoneKey(p.phone),first=normalized(p.first_name),last=normalized(p.last_name);
 const matches=(await env.DB.prepare(selection+` WHERE p.email_normalized=? OR (p.first_name_normalized=? AND p.last_name_normalized=?) OR (?<>'' AND (p.phone_normalized=? OR (length(p.phone_normalized)=11 AND substr(p.phone_normalized,1,1)='1' AND substr(p.phone_normalized,2)=?)))`).bind(p.email,first,last,key,key,key).all<Contact>()).results;
 if(selected==='auto'&&matches.length){
  const c=matches[0];
  if(matches.length===1&&c.first_name_normalized===first&&c.last_name_normalized===last&&!c.user_id&&(c.email_normalized===p.email||phoneKey(c.phone_normalized||'')===key))return {id:c.id,statements};
  throw new AdminError(409,'CHOOSE_CONTACT','Possible existing contacts were found. Use Find contacts to choose the correct person, or explicitly choose Create a separate new contact. Shared email or phone alone does not identify a person.');
 }
 if(matches.some(c=>c.first_name_normalized===first&&c.last_name_normalized===last&&c.email_normalized===p.email))throw new AdminError(409,'CONTACT_EXISTS','A contact with this name and email already exists. Find and select that contact instead.');
 const id=crypto.randomUUID();
 statements.push(env.DB.prepare(`INSERT INTO people(id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,phone,phone_normalized,country,record_source,contact_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,'manual','active',?,?)`).bind(id,p.first_name,p.last_name,first,last,p.email,p.email,p.phone,p.phone.replace(/\D/g,''),p.country,time,time));
 return {id,statements};
}
