import {handleReaction,decorateReactions} from './reactions.mjs';
import {handlePublicRequests,handleRequestAdmin} from './portal-requests.mjs';
import { handleGroups } from './groups.mjs';
import {handleAdmin} from './admin.mjs';
import {handleResources} from './resources.mjs';
import {profileGenders,validBirthDate} from './resource-access.mjs';
import { siteConfig } from './site-config.mjs';
const COOKIE = '__Host-hs_prayer';
const kinds = ['request', 'update', 'answered'];
const encoder = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
export const digest = async value => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
export const token = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export async function passwordHash(password, salt = token()) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return `${salt}:${hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 100000 }, key, 256))}`;
}
async function verify(password, stored) {
  const candidate = await passwordHash(password, stored.split(':')[0]);
  let diff = candidate.length ^ stored.length;
  for (let i = 0; i < candidate.length; i++) diff |= candidate.charCodeAt(i) ^ (stored.charCodeAt(i) || 0);
  return diff === 0;
}
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
function requireValue(condition, message, status = 400) { if (!condition) throw new HttpError(status, message); }
const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers });
const now = () => Date.now();
const publicUser = u => ({ id:u.id,name:u.name,role:u.role,list_view:u.list_view||'expanded',access_level:u.access_level||'full',owner:!!u.is_owner,username:u.username||u.email,email:u.email,
 phone:u.phone||'',timezone:u.timezone||'',bio:u.bio||'',gender:u.gender||'',birth_date:u.birth_date||'',notify_requests:u.notify_requests!==0,notify_updates:u.notify_updates!==0,notify_answered:u.notify_answered!==0 });
// This predicate must be used for every read, including notification joins.
function visibilityFor(id,role,access) {
  return `(${role}='admin' OR p.is_global=1 OR (${access}='full' AND
    (p.author_id=${id} OR ((p.group_id IS NULL OR EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id=p.group_id AND gm.user_id=${id} AND gm.status='approved'))
    AND (p.audience='members' OR (p.audience='selected' AND EXISTS (SELECT 1 FROM recipients r WHERE r.post_id=p.id AND r.user_id=${id})))))))`;
}
export const visibility = visibilityFor('?','?','?');
const visibleArgs = u => [u.role,u.access_level||'full',u.id,u.id,u.id];
function cookie(value, age) { return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`; }
async function session(db, user) {
  const raw = token(), csrf = token();
  const created=await db.prepare("INSERT INTO sessions SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND status='active')").bind(await digest(raw), user.id, csrf, now() + 7 * 86400000,user.id).run();
  requireValue(created.meta.changes===1,'This account is not available for sign-in.',401);
  return json({ user: publicUser(user), csrf }, 200, { 'Set-Cookie': cookie(raw, 604800) });
}
async function body(request) {
  requireValue((request.headers.get('content-type') || '').includes('application/json'), 'Use JSON.', 415);
  const raw = await request.text();
  requireValue(raw.length <= (/^\/api\/(?:admin\/)?resources(?:\/|$)/.test(new URL(request.url).pathname)?400000:16000), 'This submission is too large.', 413);
  try { return JSON.parse(raw); } catch { throw new HttpError(400, 'Invalid JSON.'); }
}
function text(value, max, label) {
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max, `${label} is required (maximum ${max} characters).`);
  return value.trim();
}
function email(value) {
  const result = text(value, 254, 'Email').toLowerCase();
  requireValue(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result), 'Enter a valid email address.'); return result;
}
function password(value) { requireValue(typeof value === 'string' && value.length >= 12 && value.length <= 128, 'Use a password of 12â€“128 characters.'); return value; }
function username(value,address,owner=false) {
  const name=(typeof value==='string' && value.trim()?value:address).trim().toLowerCase();
  requireValue(name===address.toLowerCase() || /^[a-z0-9][a-z0-9._-]{2,39}$/.test(name),'Use 3â€“40 letters, numbers, dots, underscores, or dashes, or use your own email.');
  requireValue(name!=='admin' || owner,'The username admin is reserved for the primary owner.');
  return name;
}
async function rateLimit(db, key, max) {
  const time = now();
  const row = await db.prepare(`INSERT INTO login_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET
    attempts=CASE WHEN expires_at <= ? THEN 1 ELSE attempts+1 END,
    expires_at=CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`).bind(key, time + 900000, time, time).first();
  requireValue(row.attempts <= max, 'Too many attempts. Try again in 15 minutes.', 429);
}
async function api(request, env, url, ctx) {
  const db = env.DB, path = url.pathname, method = request.method;
  const config = siteConfig(env);
  if (path === '/api/site' && method === 'GET') return json(config);
  if (path === '/api/health' && method === 'GET') {
    const schema = await db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('users','posts','groups','group_members','initial_admin_setup','password_resets','admin_audit','resources','resource_categories','resource_tags','resource_images','portal_requests','post_hearts','resource_thumbs')").first();
    requireValue(schema.count === 14, 'Portal database setup is incomplete.', 503);
    return json({service:'hope-sojourns-prayer',version:env.RELEASE_VERSION || 'local',environment:env.ENVIRONMENT || 'local',ready:true});
  }
  if (method !== 'GET') requireValue(request.headers.get('origin') === url.origin, 'Please use this portal to submit changes.', 403);
  const requestHelp=await handlePublicRequests(request,db,url,{json,body,text,email,username,requireValue,digest,rateLimit,token,password,passwordHash,session,defer:ctx?.waitUntil?promise=>ctx.waitUntil(promise):null},env);
  if(requestHelp) return requestHelp;
  if (path === '/api/login' && method === 'POST') {
    const data = await body(request), identifier=text(data.identifier ?? data.email,254,'Username or email').toLowerCase();
    await rateLimit(db, `ip:${await digest(request.headers.get('CF-Connecting-IP') || 'local')}`, 60);
    const user = await db.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE OR email=? COLLATE NOCASE').bind(identifier,identifier).first();
    const limitKey=`email:${await digest(user?.email || identifier)}`;
    await rateLimit(db, limitKey, 10);
    const correct = await verify(String(data.password || '').slice(0, 129), user?.password || `${'0'.repeat(64)}:${'0'.repeat(64)}`);
    requireValue(user && user.status==='active' && correct, 'Email or password is incorrect, or this account is unavailable.', 401);
    await db.prepare('DELETE FROM login_limits WHERE key=?').bind(limitKey).run();
    await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now()).run();
    return session(db, user);
  }
  if(path==='/api/reset-password' && method==='POST') {
    const data=await body(request);
    await rateLimit(db,`reset:${await digest(request.headers.get('CF-Connecting-IP')||'local')}`,20);
    const hash=await digest(text(data.token,64,'Reset link')),stored=await passwordHash(password(data.password));
    const reset=await db.prepare("SELECT r.user_id,u.email FROM password_resets r JOIN users u ON u.id=r.user_id WHERE r.token_hash=? AND r.used_at IS NULL AND r.expires_at>? AND u.status='active'").bind(hash,now()).first();
    requireValue(reset,'This password reset has expired or is no longer available. Ask a portal admin for a new link.');
    const time=now();
    const result=await db.batch([
      db.prepare("UPDATE users SET password=? WHERE id=? AND status='active' AND EXISTS(SELECT 1 FROM password_resets WHERE token_hash=? AND used_at IS NULL AND expires_at>?)").bind(stored,reset.user_id,hash,now()),
      db.prepare('UPDATE password_resets SET used_at=? WHERE token_hash=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND password=?)').bind(time,hash,reset.user_id,stored),
      db.prepare('DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM password_resets WHERE token_hash=? AND used_at=?)').bind(reset.user_id,hash,time),
      db.prepare('UPDATE password_resets SET used_at=? WHERE user_id=? AND used_at IS NULL AND EXISTS(SELECT 1 FROM password_resets WHERE token_hash=? AND used_at=?)').bind(time,reset.user_id,hash,time),
      db.prepare("UPDATE portal_requests SET status='completed',revision=revision+1 WHERE kind='password' AND user_id=? AND status='approved' AND EXISTS(SELECT 1 FROM password_resets WHERE token_hash=? AND used_at=?)").bind(reset.user_id,hash,time),
      db.prepare('DELETE FROM login_limits WHERE key=? AND EXISTS(SELECT 1 FROM password_resets WHERE token_hash=? AND used_at=?)').bind(`email:${await digest(reset.email)}`,hash,time)
    ]);
    requireValue(result[0].meta.changes===1,'This password reset is no longer available.');
    return json({ok:true});
  }
  if (path === '/api/accept' && method === 'POST') {
    const data = await body(request);
    await rateLimit(db, `accept:${await digest(request.headers.get('CF-Connecting-IP') || 'local')}`, 20);
    const hash = await digest(text(data.token, 64, 'Invitation'));
    let invite = await db.prepare('SELECT * FROM invites WHERE token_hash=? AND used_at IS NULL AND expires_at>?').bind(hash, now()).first();
    if (!invite) {
      const initial = await db.prepare('SELECT * FROM initial_admin_setup WHERE token_hash=? AND used_at IS NULL AND expires_at>? AND NOT EXISTS(SELECT 1 FROM users)').bind(hash,now()).first();
      if (initial) invite = {...initial,role:'admin',initial:true};
    }
    requireValue(invite, 'This invitation has expired or was already used. Ask an admin for a new one.');
    requireValue(!await db.prepare('SELECT id FROM users WHERE email=?').bind(invite.email).first(), 'This email already has an account. Sign in instead.');
    const approvedRequest=!invite.initial && await db.prepare("SELECT id,profile FROM portal_requests WHERE invite_id=? AND status='approved'").bind(invite.id).first();
    const applicant=approvedRequest?JSON.parse(approvedRequest.profile):null;
    const loginName=username(invite.initial && invite.email==='kernbrent@gmail.com'?'admin':data.username||applicant?.username,invite.email,!!invite.initial);
    requireValue(!await db.prepare('SELECT id FROM users WHERE username=? COLLATE NOCASE OR email=? COLLATE NOCASE').bind(loginName,loginName).first(),'That username is already in use.');
    const user = { id: crypto.randomUUID(), name: text(data.name, 80, 'Name'), email:invite.email,username:loginName,role: invite.initial?'admin':'member',is_owner:invite.initial?1:0 };
    const stored = await passwordHash(password(data.password));
    const result = await db.batch(invite.initial ? [
      db.prepare(`INSERT INTO users (id,email,name,password,role,created_at,is_owner,username)
        SELECT ?,email,?,?,'admin',?,1,? FROM initial_admin_setup WHERE token_hash=? AND used_at IS NULL AND expires_at>?
        AND NOT EXISTS(SELECT 1 FROM users)`).bind(user.id,user.name,stored,now(),loginName,hash,now()),
      db.prepare('UPDATE initial_admin_setup SET used_at=? WHERE token_hash=? AND EXISTS(SELECT 1 FROM users WHERE id=?)').bind(now(),hash,user.id)
    ] : [
      db.prepare(`INSERT INTO users (id,email,name,password,role,created_at,username)
        SELECT ?,email,?,?,'member',?,? FROM invites WHERE token_hash=? AND used_at IS NULL AND expires_at>?`).bind(user.id, user.name, stored, now(),loginName, hash, now()),
      ...(applicant?[
        db.prepare('UPDATE users SET phone=?,timezone=?,bio=?,gender=?,birth_date=?,notify_requests=?,notify_updates=?,notify_answered=? WHERE id=?').bind(applicant.phone,applicant.timezone,applicant.bio,applicant.gender,applicant.birth_date,+applicant.notify_requests,+applicant.notify_updates,+applicant.notify_answered,user.id),
        db.prepare("UPDATE portal_requests SET status='completed',revision=revision+1 WHERE id=? AND EXISTS(SELECT 1 FROM users WHERE id=?)").bind(approvedRequest.id,user.id)
      ]:[]),
      db.prepare('UPDATE invites SET used_at=? WHERE token_hash=? AND EXISTS(SELECT 1 FROM users WHERE id=?)').bind(now(), hash, user.id)
    ]);
    requireValue(result[0].meta.changes === 1, 'This invitation is no longer available.');
    return session(db, await db.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first());
  }
  const raw = (request.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  const auth = raw && await db.prepare(`SELECT u.*,s.csrf,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'`).bind(await digest(raw), now()).first();
  requireValue(auth, 'Please sign in to the prayer portal.', 401);
  if (method !== 'GET') requireValue(request.headers.get('x-csrf-token') === auth.csrf, 'Your session changed. Refresh and try again.', 403);
  // Provisional accounts may only read Global prayers, eligible resources, and their own account.
  if(auth.access_level==='provisional') {
    const allowed=(method==='GET' && (['/api/me','/api/posts','/api/resources','/api/resource-categories'].includes(path) || /^\/api\/resources\/[^/]+\/image$/.test(path))) ||
      (method==='POST' && ['/api/profile','/api/logout','/api/preferences'].includes(path));
    requireValue(allowed,'Admin approval is required for this feature.',403);
  }
  if(path==='/api/preferences' && method==='POST') {
    const data=await body(request);
    requireValue(['expanded','collapsed'].includes(data.list_view),'Choose Expanded or Collapsed.');
    const result=await db.prepare("UPDATE users SET list_view=? WHERE id=? AND status='active'").bind(data.list_view,auth.id).run();
    requireValue(result.meta.changes===1,'Your account is no longer available.',401);
    return json({list_view:data.list_view});
  }
  const reaction=await handleReaction(request,db,auth,url,{json,body,requireValue,rateLimit,visibility,visibleArgs});
  if(reaction) return reaction;
  if(/^\/api\/(?:admin\/)?(?:resources|resource-categories|resource-review-count)(?:\/|$)/.test(path)) {
    const response=await handleResources(request,db,auth,url,{json,body,text,requireValue,rateLimit,assets:env.ASSETS});
    if(response) return response;
  }
  if(path.startsWith('/api/admin/')) {
    const requestAdmin=await handleRequestAdmin(request,db,auth,url,{json,body,text,requireValue,digest,token,username});
    if(requestAdmin) return requestAdmin;
    const response=await handleAdmin(request,db,auth,url,{json,body,text,requireValue,digest,token,username});
    if(response) return response;
  }
  if (path === '/api/groups' || path.startsWith('/api/groups/')) {
    const response = await handleGroups(request,db,auth,url,{json,body,text,requireValue,rateLimit},config);
    if (response) return response;
  }
  if (path === '/api/me' && method === 'GET') return json({ user: publicUser(auth), csrf: auth.csrf });
  if(path==='/api/profile' && method==='POST') {
    const data=await body(request),loginName=username(data.username,auth.email,!!auth.is_owner),name=text(data.name,80,'Display name');
    const phone=typeof data.phone==='string'?data.phone.trim():'',zone=typeof data.timezone==='string'?data.timezone.trim():'',bio=typeof data.bio==='string'?data.bio.trim():'';
    requireValue(phone.length<=40 && zone.length<=80 && bio.length<=500,'Phone, time zone, or introduction is too long.');
    if(zone) {try {new Intl.DateTimeFormat('en',{timeZone:zone}).format();} catch {throw new HttpError(400,'Choose a valid time zone, such as America/Chicago.');}}
    const gender=data.gender ?? auth.gender ?? '',birthDate=data.birth_date ?? auth.birth_date ?? '';
    requireValue(profileGenders.includes(gender),'Choose a valid gender option.');
    requireValue(validBirthDate(birthDate),'Enter a valid birth date, no more than 120 years ago and not in the future.');
    for(const key of ['notify_requests','notify_updates','notify_answered']) requireValue(typeof data[key]==='boolean','Choose notification preferences.');
    requireValue(!await db.prepare('SELECT id FROM users WHERE id<>? AND (username=? COLLATE NOCASE OR email=? COLLATE NOCASE)').bind(auth.id,loginName,loginName).first(),'That username is already in use.');
    const result=await db.prepare("UPDATE users SET username=?,name=?,phone=?,timezone=?,bio=?,gender=?,birth_date=?,notify_requests=?,notify_updates=?,notify_answered=? WHERE id=? AND status='active'").bind(loginName,name,phone,zone,bio,gender,birthDate,+data.notify_requests,+data.notify_updates,+data.notify_answered,auth.id).run();
    requireValue(result.meta.changes===1,'Your account is no longer available.',401);
    return json({user:publicUser(await db.prepare('SELECT * FROM users WHERE id=?').bind(auth.id).first())});
  }
  if (path === '/api/logout' && method === 'POST') {
    await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(auth.token_hash).run();
    return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
  }
  if (path === '/api/people' && method === 'GET') {
    return json((await db.prepare(`SELECT u.id,u.name,u.role,u.bio,CASE WHEN instr(coalesce(u.username,''),'@')=0 THEN u.username ELSE NULL END AS username,f.followed_id IS NOT NULL AS following,
      f.requests,f.updates,f.answered FROM users u LEFT JOIN follows f ON f.followed_id=u.id AND f.follower_id=?
      WHERE u.status='active' AND u.access_level='full' ORDER BY u.name,u.id`).bind(auth.id).all()).results);
  }
  if (path === '/api/follow' && method === 'POST') {
    const data = await body(request);
    requireValue(data.userId !== auth.id && await db.prepare("SELECT id FROM users WHERE id=? AND status='active' AND access_level='full'").bind(String(data.userId)).first(), 'Choose another portal member.');
    requireValue(typeof data.following === 'boolean', 'Choose whether to follow this person.');
    if (!data.following) await db.prepare('DELETE FROM follows WHERE follower_id=? AND followed_id=?').bind(auth.id, data.userId).run();
    else {
      for (const key of ['requests','updates','answered']) requireValue(typeof data[key] === 'boolean', 'Choose the post types to follow.');
      await db.prepare(`INSERT INTO follows VALUES (?,?,?,?,?) ON CONFLICT(follower_id,followed_id)
        DO UPDATE SET requests=excluded.requests,updates=excluded.updates,answered=excluded.answered`).bind(auth.id, data.userId, +data.requests, +data.updates, +data.answered).run();
    }
    return json({ ok: true });
  }
  if (path === '/api/posts' && method === 'GET') {
    const kind = url.searchParams.get('kind'), following = url.searchParams.get('following') === '1';
    const groupId = url.searchParams.get('group') || '';
    const globalOnly=url.searchParams.get('global')==='1';
    requireValue(!kind || kinds.includes(kind), 'Unknown post type.');
    const [stamp, beforeId = ''] = (url.searchParams.get('before') || `${Number.MAX_SAFE_INTEGER}`).split(':');
    const before = Number(stamp);
    requireValue(Number.isSafeInteger(before) && before > 0 && beforeId.length <= 36, 'Invalid page.');
    const rows = await db.prepare(`SELECT p.*,u.name AS author_name,g.name AS group_name FROM posts p JOIN users u ON u.id=p.author_id LEFT JOIN groups g ON g.id=p.group_id WHERE ${visibility}
      AND (?='' OR p.kind=?) AND (?=0 OR EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=? AND f.followed_id=p.author_id))
      AND (?='' OR p.group_id=?) AND (?=0 OR p.is_global=1)
      AND (p.created_at < ? OR (p.created_at = ? AND p.id < ?)) ORDER BY p.created_at DESC,p.id DESC LIMIT 51`).bind(...visibleArgs(auth), kind || '', kind || '', +following, auth.id, groupId,groupId,+globalOnly,before, before, beforeId).all();
    const posts = rows.results.slice(0, 50), last = posts.at(-1);
    await decorateReactions(db,posts,'posts',auth.id);
    return json({ posts, more: rows.results.length > 50, cursor: last ? `${last.created_at}:${last.id}` : null });
  }
  if (path === '/api/posts' && method === 'POST') {
    const data = await body(request), id = crypto.randomUUID(), time = now();
    const title = text(data.title, 140, 'Title'), content = text(data.body, 6000, 'Prayer text');
    requireValue(kinds.includes(data.kind), 'Choose a post type.');
    requireValue(['members','selected','admins'].includes(data.audience), 'Choose who can see this post.');
    const groupId = data.groupId ? text(data.groupId,80,'Group') : null;
    requireValue(data.global===undefined || typeof data.global==='boolean','Choose Global visibility.');
    const globalPost=data.global===true;
    requireValue(!globalPost || (!groupId && data.audience==='members' && (!data.recipients || data.recipients.length===0)),'Global prayers must be shared with everyone without a group or selected recipients.');
    if (groupId) requireValue(await db.prepare("SELECT 1 FROM group_members WHERE group_id=? AND user_id=? AND status='approved'").bind(groupId,auth.id).first(),'Join this group before posting to it.',403);
    const recipients = data.audience === 'selected' && Array.isArray(data.recipients) ? [...new Set(data.recipients)] : [];
    requireValue(data.audience !== 'selected' || (recipients.length > 0 && recipients.length <= 50), 'Select 1â€“50 people.');
    for (const person of recipients) requireValue(typeof person === 'string' && person !== auth.id && await db.prepare("SELECT id FROM users WHERE id=? AND status='active'").bind(person).first(), 'One of the selected people is unavailable.');
    if (groupId) for (const person of recipients) requireValue(await db.prepare("SELECT 1 FROM group_members WHERE group_id=? AND user_id=? AND status='approved'").bind(groupId,person).first(),'Selected people must belong to this group.');
    const statements = [db.prepare(`INSERT INTO posts (id,author_id,title,body,kind,audience,created_at,group_id,is_global)
      SELECT ?,?,?,?,?,?,?,?,? WHERE ? IS NULL OR EXISTS (SELECT 1 FROM group_members WHERE group_id=? AND user_id=? AND status='approved')`).bind(id,auth.id,title,content,data.kind,data.audience,time,groupId,+globalPost,groupId,groupId,auth.id)];
    for (const person of recipients) statements.push(db.prepare('INSERT INTO recipients VALUES (?,?)').bind(id, person));
    const preference = { request: 'requests', update: 'updates', answered: 'answered' }[data.kind];
    statements.push(db.prepare(`INSERT INTO notifications (id,user_id,post_id,created_at)
      SELECT lower(hex(randomblob(16))),u.id,p.id,? FROM users u JOIN posts p ON p.id=?
      WHERE u.id<>p.author_id AND u.status='active' AND u.notify_${preference}=1 AND ${visibilityFor('u.id','u.role','u.access_level')} AND
      (EXISTS (SELECT 1 FROM follows f WHERE f.follower_id=u.id AND f.followed_id=p.author_id AND f.${preference}=1)
      OR EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id=p.group_id AND gm.user_id=u.id AND gm.status='approved' AND gm.${preference}=1))`).bind(time, id));
    const result = await db.batch(statements);
    requireValue(result[0].meta.changes === 1,'Your group membership changed. Refresh before posting.',403);
    return json({ id }, 201);
  }
  if(/^\/api\/posts\/[^/]+\/global$/.test(path) && method==='POST') {
    const data=await body(request),id=path.split('/')[3],reason=text(data.reason,500,'Reason');
    requireValue(typeof data.global==='boolean' && data.confirmed===true,'Confirm the visibility change.');
    const audit=crypto.randomUUID(),guard='EXISTS(SELECT 1 FROM admin_audit WHERE id=?)';
    const result=await db.batch([
      db.prepare(`INSERT INTO admin_audit SELECT ?,?,'global-visibility','post',?,?,? WHERE EXISTS(SELECT 1 FROM posts WHERE id=? AND (author_id=? OR EXISTS(SELECT 1 FROM users WHERE id=? AND role='admin' AND status='active'))) AND EXISTS(SELECT 1 FROM users WHERE id=? AND status='active' AND access_level='full')`).bind(audit,auth.id,id,reason,now(),id,auth.id,auth.id,auth.id),
      db.prepare(`UPDATE posts SET is_global=?,group_id=NULL,audience='members' WHERE id=? AND ${guard}`).bind(+data.global,id,audit),
      db.prepare(`DELETE FROM recipients WHERE post_id=? AND ${guard}`).bind(id,audit),
      db.prepare(`DELETE FROM notifications WHERE post_id=? AND ${guard}`).bind(id,audit)
    ]);
    requireValue(result[0].meta.changes===1,'Post unavailable or your access changed.',404);
    return json({ok:true});
  }
  if (/^\/api\/posts\/[^/]+$/.test(path) && method === 'DELETE') {
    const id = path.split('/').pop();
    const target=await db.prepare('SELECT author_id FROM posts WHERE id=?').bind(id).first();
    if(auth.role==='admin' && target && target.author_id!==auth.id) throw new HttpError(400,'Use Admin â†’ All prayers to remove another personâ€™s prayer with an audit reason.');
    const result = await db.prepare('DELETE FROM posts WHERE id=? AND (author_id=? OR ?=\'admin\')').bind(id, auth.id, auth.role).run();
    requireValue(result.meta.changes, 'Post unavailable.', 404); return json({ ok: true });
  }
  if (path === '/api/notifications' && method === 'GET') {
    const rows=(await db.prepare(`SELECT n.id,n.read_at,n.created_at,p.id AS post_id,p.title,p.body,p.kind,p.audience,p.is_global,p.group_id,g.name AS group_name,u.name AS author_name
      FROM notifications n JOIN posts p ON p.id=n.post_id JOIN users u ON u.id=p.author_id LEFT JOIN groups g ON g.id=p.group_id WHERE n.user_id=? AND ${visibility}
      ORDER BY n.created_at DESC LIMIT 100`).bind(auth.id, ...visibleArgs(auth)).all()).results;
    await decorateReactions(db,rows,'posts',auth.id);return json(rows);
  }
  if (path === '/api/notifications/read' && method === 'POST') {
    await db.prepare('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').bind(now(), auth.id).run(); return json({ ok: true });
  }
  if (path.startsWith('/api/invites')) {
    requireValue(auth.role === 'admin', 'Admins only.', 403);
    if (path === '/api/invites' && method === 'GET') return json((await db.prepare('SELECT id,email,role,expires_at,used_at FROM invites ORDER BY expires_at DESC LIMIT 100').all()).results);
    if (path === '/api/invites' && method === 'POST') {
      const data = await body(request), address = email(data.email), rawToken = token(), id = crypto.randomUUID();
      requireValue(data.role===undefined || data.role==='member', 'Invitations create regular members. Grant admin access after the person joins.');
      requireValue(!await db.prepare('SELECT id FROM users WHERE email=?').bind(address).first(), 'This person already has an account.');
      await db.batch([
        db.prepare('UPDATE invites SET expires_at=? WHERE email=? AND used_at IS NULL').bind(now(), address),
        db.prepare('INSERT INTO invites VALUES (?,?,?,?,?,NULL,?)').bind(id, address, 'member', await digest(rawToken), now() + 7 * 86400000, auth.id)
      ]);
      return json({ id, link: `${url.origin}/#invite=${rawToken}` }, 201);
    }
    if (/^\/api\/invites\/[^/]+$/.test(path) && method === 'DELETE') {
      await db.prepare('UPDATE invites SET expires_at=? WHERE id=? AND used_at IS NULL').bind(now(), path.split('/').pop()).run(); return json({ ok: true });
    }
  }
  throw new HttpError(404, 'Page unavailable.');
}
export default {
  async fetch(request, env, ctx) {
    let response;
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) response = await api(request, env, url, ctx);
      else if (['/','/index.html','/app.js','/portal.css','/styles.css',siteConfig(env).logoPath,'/favicon.ico'].includes(url.pathname)) response = await env.ASSETS.fetch(request);
      else response = json({ error: 'Page unavailable.' }, 404);
    } catch (error) {
      response = json({ error: error.status ? error.message : 'We could not complete that request. Please try again.' }, error.status || 500);
    }
    const result = new Response(response.body, response);
    for (const [name,value] of Object.entries({
      'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer',
      'X-Frame-Options':'DENY', 'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      'Strict-Transport-Security':'max-age=31536000'
    })) result.headers.set(name,value);
    return result;
  }
};
