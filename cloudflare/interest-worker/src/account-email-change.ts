import {AdminError,adminJson,auditStatement,randomToken,hashText,reserveLoginAttempts,releaseLoginAttempts,type AdminEnv} from './admin';
import {sendAccountEmail} from './account-email';
import {verifyUserPassword,type User} from './mmt-users';

const message='Check your new email address for a confirmation link. Your current email stays active until you confirm. The link expires in one hour.';
function fail(status:number,code:string,text:string):never{throw new AdminError(status,code,text);}
export async function pendingEmail(env:AdminEnv,id:string){return env.DB.prepare('SELECT new_email,expires_at FROM mmt_email_changes WHERE user_id=? AND ready=1 AND consumed_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM mmt_users u WHERE u.id=user_id AND u.email=old_email AND u.revision=user_revision AND u.deleted_at IS NULL)').bind(id,new Date().toISOString()).first();}
export async function requestEmailChange(request:Request,env:AdminEnv,u:User,b:Record<string,unknown>,p:{email:string;first_name:string;last_name:string;phone:string;country:string}){
 if(Number(b.revision)!==u.revision)fail(409,'STALE_EDIT','Refresh your profile before saving.');
 if(['first_name','last_name','phone','country'].some(k=>p[k as keyof typeof p]!==u[k as keyof User]))fail(422,'SEPARATE_PROFILE_EDIT','Save name or phone changes separately before requesting an email change.');
 const password=typeof b.currentPassword==='string'?b.currentPassword:'';
 if(!password||password.length>128)fail(422,'CURRENT_PASSWORD_REQUIRED','Enter your current password to request an email change.');
 const reserved=await reserveLoginAttempts(request,env,u.username);
 if(!await verifyUserPassword(env,u.id,password))fail(422,'INVALID_CURRENT_PASSWORD','The current password is incorrect.');
 await releaseLoginAttempts(env,reserved);
 if(await env.DB.prepare('SELECT 1 FROM mmt_users WHERE email=? AND id<>?').bind(p.email,u.id).first())fail(409,'EMAIL_UNAVAILABLE','That email address is unavailable.');
 const token=randomToken(),hash=await hashText(token),date=new Date().toISOString(),expires=new Date(Date.now()+3600000).toISOString();
 const inserted=await env.DB.prepare(`INSERT INTO mmt_email_changes(user_id,token_hash,old_email,new_email,user_revision,expires_at,created_at)
  SELECT id,?,email,?,revision,?,? FROM mmt_users WHERE id=? AND revision=? AND email=? AND status='active' AND deleted_at IS NULL AND must_change_password=0
  ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,old_email=excluded.old_email,new_email=excluded.new_email,user_revision=excluded.user_revision,expires_at=excluded.expires_at,created_at=excluded.created_at,ready=0,consumed_at=NULL,claim=NULL`).bind(hash,p.email,expires,date,u.id,u.revision,u.email).run();
 if(!inserted.meta.changes)fail(409,'STALE_EDIT','Your account changed. Refresh before requesting another link.');
 // Always use our maintained HS confirmation page, including shared CSM accounts.
 const host=new URL(request.url),origin=['localhost','127.0.0.1'].includes(host.hostname)?host.origin:env.ENVIRONMENT==='test'?'https://test.hopesojourns.com':'https://hopesojourns.com';
 const alert=await sendAccountEmail(env,{to:u.email,subject:'Your ministry portal email change was requested',text:`Hello ${u.first_name},\n\nA change of your shared ministry portal email to ${p.email} was requested after password confirmation. Your current address remains active until the new address is verified. If you did not request this, reset your password or contact your administrator immediately.\n\nThis affects both ministry portals.`},'mmt-email-alert-'+hash);
 const sent=alert&&await sendAccountEmail(env,{to:p.email,subject:'Confirm your ministry portal email address',text:`Hello ${u.first_name},\n\nConfirm this new email address for your shared ministry portal account:\n${origin}/admin/access/#emailToken=${token}\n\nChoose Confirm email address on that page. This one-use link expires in one hour. Until then, your current email remains the recovery address. If you did not request this change, do not confirm it.`},'mmt-email-verify-'+hash);
 if(!sent){await env.DB.prepare('DELETE FROM mmt_email_changes WHERE token_hash=?').bind(hash).run();fail(503,'EMAIL_CHANGE_UNAVAILABLE','Email verification could not be sent. Your recovery email is unchanged. Try again when account email is available.');}
 const ready=await env.DB.prepare('UPDATE mmt_email_changes SET ready=1 WHERE token_hash=? AND EXISTS(SELECT 1 FROM mmt_users u WHERE u.id=user_id AND u.email=old_email AND u.revision=user_revision AND u.status=\'active\' AND u.deleted_at IS NULL AND u.must_change_password=0)').bind(hash).run();
 if(!ready.meta.changes)fail(409,'STALE_EDIT','Your account changed. Request a new verification link.');
 await auditStatement(env,'mmt_user',u.id,'email_change_requested').run();
 return adminJson({message,pendingEmail:{new_email:p.email,expires_at:expires}},202);
}
export async function confirmEmailChange(env:AdminEnv,b:Record<string,unknown>){
 const token=typeof b.token==='string'?b.token:'';
 if(!/^[A-Za-z0-9_-]{40,100}$/.test(token))fail(422,'INVALID_LINK','This email confirmation link is invalid or expired.');
 const hash=await hashText(token),date=new Date().toISOString(),claim=crypto.randomUUID();
 const results=await env.DB.batch([
  env.DB.prepare(`UPDATE mmt_email_changes SET consumed_at=?,claim=? WHERE token_hash=? AND ready=1 AND consumed_at IS NULL AND expires_at>?
   AND EXISTS(SELECT 1 FROM mmt_users u WHERE u.id=user_id AND u.email=old_email AND u.revision=user_revision AND u.status='active' AND u.deleted_at IS NULL AND u.must_change_password=0)`).bind(date,claim,hash,date),
  env.DB.prepare(`UPDATE mmt_users SET email=(SELECT new_email FROM mmt_email_changes WHERE token_hash=? AND claim=?),revision=revision+1,updated_at=?
   WHERE id=(SELECT user_id FROM mmt_email_changes WHERE token_hash=? AND claim=?)`).bind(hash,claim,date,hash,claim),
  env.DB.prepare('DELETE FROM admin_sessions WHERE user_id=(SELECT user_id FROM mmt_email_changes WHERE token_hash=? AND claim=?)').bind(hash,claim),
  env.DB.prepare('DELETE FROM mmt_reset_tokens WHERE user_id=(SELECT user_id FROM mmt_email_changes WHERE token_hash=? AND claim=?)').bind(hash,claim)
 ]);
 if(!results[0].meta.changes)fail(422,'INVALID_LINK','This link expired, was already used, or your account changed. Request a new link from My profile.');
 const row=await env.DB.prepare('SELECT user_id FROM mmt_email_changes WHERE token_hash=? AND claim=?').bind(hash,claim).first<{user_id:string}>();
 await auditStatement(env,'mmt_user',row!.user_id,'email_change_confirmed').run();
 return adminJson({message:'Email address confirmed. Your other sign-ins and previous password-reset links have ended. Sign in again with your existing user name and password.'});
}
