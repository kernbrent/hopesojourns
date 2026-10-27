import type {AdminEnv} from './admin';

export type Mail={id:string;request_hash:string;payload_json:string;status:string;attempt_key:string;started_at:string|null;updated_at:string;created_at:string;sent_at:string|null;error:string|null};
export function savedMail(mail:Mail){const saved=JSON.parse(mail.payload_json);return {payload:saved.delivery||saved,recipients:saved.recipients||saved.to,privateRecipients:!!saved.delivery};}
export function publicMail(mail:Mail){const {payload:p,recipients,privateRecipients}=savedMail(mail);return {id:mail.id,from:'admin@hopesojourns.com',to:recipients,visibleTo:privateRecipients?['admin@hopesojourns.com']:p.to,privateRecipients,retryAllowed:privateRecipients||p.to.length===1,subject:p.subject,message:p.text,status:mail.status,error:mail.error,createdAt:mail.created_at,sentAt:mail.sent_at};}

// Keep the original contact associations even when an address is edited later.
export async function contactEmailActivity(env:AdminEnv,personIds:string[]){
 if(!personIds.length)return new Map<string,{lastEmailSentAt:string|null;emailSentCount:number;awaitingInterestId:string|null}>();
 const result=await env.DB.prepare(`SELECT p.id,
 (SELECT MAX(e.sent_at) FROM contact_email_people cp JOIN contact_emails e ON e.id=cp.email_id WHERE cp.person_id=p.id AND e.status='sent') lastEmailSentAt,
 (SELECT COUNT(*) FROM contact_email_people cp JOIN contact_emails e ON e.id=cp.email_id WHERE cp.person_id=p.id AND e.status='sent') emailSentCount,
 (SELECT s.id FROM interest_submissions s LEFT JOIN inquiry_workflows w ON w.submission_id=s.id
  WHERE s.person_id=p.id AND COALESCE(w.stage,'new')!='closed'
  AND NOT EXISTS(SELECT 1 FROM contact_email_people cp JOIN contact_emails e ON e.id=cp.email_id WHERE cp.person_id=p.id AND e.status='sent' AND e.sent_at>=s.created_at)
  AND NOT EXISTS(SELECT 1 FROM submission_replies r WHERE r.submission_id=s.id AND r.delivery_status='sent')
  ORDER BY s.created_at DESC,s.id DESC LIMIT 1) awaitingInterestId
 FROM people p WHERE p.id IN(SELECT value FROM json_each(?))`).bind(JSON.stringify(personIds)).all<{id:string;lastEmailSentAt:string|null;emailSentCount:number;awaitingInterestId:string|null}>();
 return new Map(result.results.map(row=>[row.id,row]));
}

export async function contactEmails(env:AdminEnv,options:{personId?:string;sentOnly?:boolean;page?:number}={}){
 const page=options.page||1,pageSize=30;
 const where=[options.personId?'EXISTS(SELECT 1 FROM contact_email_people cp WHERE cp.email_id=e.id AND cp.person_id=?)':'1=1',options.sentOnly?"e.status='sent'":'1=1'].join(' AND ');
 const args=options.personId?[options.personId]:[];
 const count=await env.DB.prepare(`SELECT COUNT(*) total FROM contact_emails e WHERE ${where}`).bind(...args).first<{total:number}>();
 const rows=await env.DB.prepare(`SELECT e.* FROM contact_emails e WHERE ${where} ORDER BY ${options.sentOnly?'e.sent_at':'e.created_at'} DESC,e.id DESC LIMIT ? OFFSET ?`).bind(...args,pageSize,(page-1)*pageSize).all<Mail>();
 return {emails:rows.results.map(publicMail),pagination:{page,pageSize,total:count?.total||0,pages:Math.max(1,Math.ceil((count?.total||0)/pageSize))}};
}
