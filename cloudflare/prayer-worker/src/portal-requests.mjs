import {beginPasswordRecovery} from './password-recovery.mjs';
import {profileGenders,validBirthDate} from './resource-access.mjs';
const preferences=['notify_requests','notify_updates','notify_answered'];
export function requestedProfile(data,h) {
 const {text,email,username,requireValue}=h,address=email(data.email);
 const profile={email:address,name:text(data.name,80,'Display name'),username:username(data.username,address),gender:data.gender??'',birth_date:data.birth_date??''};
 for(const [key,max] of [['phone',40],['timezone',80],['bio',500]]) {
  requireValue(data[key]===undefined || typeof data[key]==='string',`Invalid ${key}.`);
  profile[key]=(data[key]||'').trim();requireValue(profile[key].length<=max,`${key} is too long.`);
 }
 if(profile.timezone) {try {new Intl.DateTimeFormat('en',{timeZone:profile.timezone}).format();} catch {requireValue(false,'Choose a valid time zone, such as America/Chicago.');}}
 requireValue(profileGenders.includes(profile.gender),'Choose a valid gender option.');
 requireValue(validBirthDate(profile.birth_date),'Enter a valid birth date, no more than 120 years ago and not in the future.');
 for(const key of preferences) {requireValue(typeof data[key]==='boolean','Choose notification preferences.');profile[key]=data[key];}
 return profile;
}
export async function handlePublicRequests(request,db,url,h,env) {
 const path=url.pathname;
 if(request.method!=='POST' || !['/api/access-requests','/api/password-help','/api/invitation-details'].includes(path)) return null;
 const {body,json,requireValue,digest,rateLimit,text}=h,data=await body(request);
 requireValue(data && typeof data==='object' && !Array.isArray(data),'Use a request object.');
 await rateLimit(db,`portal-help-ip:${await digest(request.headers.get('CF-Connecting-IP')||'local')}`,10);
 if(path==='/api/invitation-details') {
  const hash=await digest(text(data.token,64,'Invitation'));
  const row=await db.prepare("SELECT q.profile FROM invites i JOIN portal_requests q ON q.invite_id=i.id WHERE i.token_hash=? AND i.used_at IS NULL AND i.expires_at>? AND q.status='approved'").bind(hash,Date.now()).first();
  // Ordinary invitations have no applicant profile; no account lookup is exposed.
  return json({profile:row?JSON.parse(row.profile):null});
 }
 const response=()=>json({ok:true,message:path==='/api/access-requests'?'Your request has been received. An admin will review it and contact you privately if approved.':'If an active account matches, a password-reset email will be sent to its associated address. Check your inbox and spam folder. The link expires in one hour.'},202);
 if(data.website) return response();
 const profile=path==='/api/access-requests'?requestedProfile(data,h):null;
 const identifier=profile?.email||text(data.identifier,254,'Username or email').toLowerCase();
 await rateLimit(db,`portal-help-address:${await digest(identifier)}`,3);
 const account=await db.prepare("SELECT id,email,status FROM users WHERE email=? COLLATE NOCASE OR username=? COLLATE NOCASE").bind(identifier,identifier).first();
 if(profile && account || !profile && (!account || account.status!=='active')) return response();
 if(!profile) {await beginPasswordRecovery(db,account,env,url,h);return response();}
 await db.prepare(`INSERT OR IGNORE INTO portal_requests (id,kind,email,profile,user_id,created_at) VALUES (?,?,?,?,?,?)`)
  .bind(crypto.randomUUID(),profile?'access':'password',profile?.email||account.email,JSON.stringify(profile||{}),account?.id||null,Date.now()).run();
 return response();
}
export async function handleRequestAdmin(request,db,auth,url,h) {
 if(!url.pathname.startsWith('/api/admin/portal-requests')) return null;
 const {requireValue,json,body,text,token,digest,username}=h;
 requireValue(auth.role==='admin','Portal admins only.',403);
 if(url.pathname==='/api/admin/portal-requests/count' && request.method==='GET') return json(await db.prepare("SELECT count(*) pending FROM portal_requests WHERE status='pending'").first());
 if(url.pathname==='/api/admin/portal-requests' && request.method==='GET') {
  const search=(url.searchParams.get('search')||'').slice(0,200),status=url.searchParams.get('status')||'pending';
  requireValue(['pending','approved','declined','completed','all'].includes(status),'Invalid request status.');
  const cursor=(url.searchParams.get('before')||`${Number.MAX_SAFE_INTEGER}:`).split(':'),time=Number(cursor[0]),id=cursor[1]||'';
  requireValue(Number.isSafeInteger(time)&&time>0&&id.length<=80,'Invalid page.');
  const rows=(await db.prepare(`SELECT q.*,u.is_owner FROM portal_requests q LEFT JOIN users u ON u.id=q.user_id WHERE (?='all' OR q.status=?) AND instr(lower(q.email||' '||q.profile),lower(?))>0 AND (q.created_at<? OR (q.created_at=? AND q.id<?)) ORDER BY q.created_at DESC,q.id DESC LIMIT 51`).bind(status,status,search,time,time,id).all()).results;
  const items=rows.slice(0,50).map(row=>({...row,profile:JSON.parse(row.profile)})),last=items.at(-1);
  return json({items,more:rows.length>50,cursor:last?`${last.created_at}:${last.id}`:null});
 }
 const match=/^\/api\/admin\/portal-requests\/([^/]+)\/(approve|decline|reissue)$/.exec(url.pathname);
 if(!match || request.method!=='POST') return null;
 const [,id,action]=match,data=await body(request),reason=text(data.reason,500,'Reason');
 requireValue(Number.isSafeInteger(data.revision),'Invalid revision.');
 const expected=action==='reissue'?'approved':'pending';
 const row=await db.prepare('SELECT * FROM portal_requests WHERE id=? AND status=? AND revision=?').bind(id,expected,data.revision).first();
 requireValue(row,'This request changed. Refresh and try again.',409);
 const audit=crypto.randomUUID(),time=Date.now(),writes=[];let link;
 const guard='EXISTS(SELECT 1 FROM admin_audit WHERE id=?)';
 let condition="EXISTS(SELECT 1 FROM portal_requests WHERE id=? AND status=? AND revision=?)",args=[id,expected,data.revision];
 if(action!=='decline') {
  requireValue(data.verified===true,'Verify the requester owns the associated email before approving.');
  const raw=token(),hash=await digest(raw);
  if(row.kind==='access') {
   const profile=JSON.parse(row.profile),loginName=username(profile.username,row.email);
   condition+=" AND NOT EXISTS(SELECT 1 FROM users WHERE email=? COLLATE NOCASE OR username=? COLLATE NOCASE OR email=? COLLATE NOCASE OR username=? COLLATE NOCASE)";args.push(row.email,row.email,loginName,loginName);
   const invitation=crypto.randomUUID();
   writes.push(db.prepare(`UPDATE invites SET expires_at=? WHERE email=? AND used_at IS NULL AND ${guard}`).bind(time,row.email,audit));
   writes.push(db.prepare(`INSERT INTO invites SELECT ?,?,'member',?,?,NULL,? WHERE ${guard}`).bind(invitation,row.email,hash,time+7*86400000,auth.id,audit));
   writes.push(db.prepare(`UPDATE portal_requests SET invite_id=? WHERE id=? AND ${guard}`).bind(invitation,id,audit));
   link=`${url.origin}/#invite=${raw}`;
  } else {
   condition+=" AND EXISTS(SELECT 1 FROM users WHERE id=? AND email=? AND status='active' AND (is_owner=0 OR id=?))";args.push(row.user_id,row.email,auth.id);
   writes.push(db.prepare(`DELETE FROM password_resets WHERE user_id=? AND ${guard}`).bind(row.user_id,audit));
   writes.push(db.prepare(`INSERT INTO password_resets SELECT ?,?,?,NULL,? WHERE ${guard}`).bind(hash,row.user_id,time+3600000,auth.id,audit));
   link=`${url.origin}/#reset=${raw}`;
  }
 }
 const batch=[db.prepare(`INSERT INTO admin_audit SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND role='admin' AND status='active') AND (${condition})`).bind(audit,auth.id,`${action}:${row.kind}`,'portal-request',id,reason,time,auth.id,...args),...writes,
  db.prepare(`UPDATE portal_requests SET status=?,reviewed_at=?,reviewed_by=?,revision=revision+1 WHERE id=? AND ${guard}`).bind(action==='decline'?'declined':'approved',time,auth.id,id,audit)];
 const results=await db.batch(batch);requireValue(results[0].meta.changes===1,'This request or account changed, the username is unavailable, or owner recovery requires the owner’s signed-in session. Refresh and review.',409);
 return json({ok:true,...(link?{link,kind:row.kind}:{})});
}
