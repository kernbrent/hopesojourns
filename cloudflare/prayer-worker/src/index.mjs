import { handleGroups } from './groups.mjs';
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
const publicUser = u => ({ id: u.id, name: u.name, role: u.role });
// This predicate must be used for every read, including notification joins.
function visibilityFor(id,role) {
  return `(p.author_id = ${id} OR ${role} = 'admin' OR
    ((p.group_id IS NULL OR EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id=p.group_id AND gm.user_id=${id} AND gm.status='approved'))
    AND (p.audience='members' OR (p.audience='selected' AND EXISTS (SELECT 1 FROM recipients r WHERE r.post_id=p.id AND r.user_id=${id})))))`;
}
export const visibility = visibilityFor('?','?');
const visibleArgs = u => [u.id, u.role, u.id, u.id];
function cookie(value, age) { return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`; }
async function session(db, user) {
  const raw = token(), csrf = token();
  await db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').bind(await digest(raw), user.id, csrf, now() + 7 * 86400000).run();
  return json({ user: publicUser(user), csrf }, 200, { 'Set-Cookie': cookie(raw, 604800) });
}
async function body(request) {
  requireValue((request.headers.get('content-type') || '').includes('application/json'), 'Use JSON.', 415);
  const raw = await request.text();
  requireValue(raw.length <= 16000, 'This submission is too large.', 413);
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
function password(value) { requireValue(typeof value === 'string' && value.length >= 12 && value.length <= 128, 'Use a password of 12–128 characters.'); return value; }
async function rateLimit(db, key, max) {
  const time = now();
  const row = await db.prepare(`INSERT INTO login_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET
    attempts=CASE WHEN expires_at <= ? THEN 1 ELSE attempts+1 END,
    expires_at=CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`).bind(key, time + 900000, time, time).first();
  requireValue(row.attempts <= max, 'Too many attempts. Try again in 15 minutes.', 429);
}
async function api(request, env, url) {
  const db = env.DB, path = url.pathname, method = request.method;
  const config = siteConfig(env);
  if (path === '/api/site' && method === 'GET') return json(config);
  if (path === '/api/health' && method === 'GET') {
    const schema = await db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('users','posts','groups','group_members','initial_admin_setup')").first();
    requireValue(schema.count === 5, 'Portal database setup is incomplete.', 503);
    return json({service:'hope-sojourns-prayer',version:env.RELEASE_VERSION || 'local',environment:env.ENVIRONMENT || 'local',ready:true});
  }
  if (method !== 'GET') requireValue(request.headers.get('origin') === url.origin, 'Please use this portal to submit changes.', 403);
  if (path === '/api/login' && method === 'POST') {
    const data = await body(request), address = email(data.email);
    await rateLimit(db, `ip:${await digest(request.headers.get('CF-Connecting-IP') || 'local')}`, 60);
    await rateLimit(db, `email:${await digest(address)}`, 10);
    const user = await db.prepare('SELECT * FROM users WHERE email=?').bind(address).first();
    const correct = await verify(String(data.password || '').slice(0, 129), user?.password || `${'0'.repeat(64)}:${'0'.repeat(64)}`);
    requireValue(user && correct, 'Email or password is incorrect.', 401);
    await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now()).run();
    return session(db, user);
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
    const user = { id: crypto.randomUUID(), name: text(data.name, 80, 'Name'), role: invite.role };
    const stored = await passwordHash(password(data.password));
    const result = await db.batch(invite.initial ? [
      db.prepare(`INSERT INTO users (id,email,name,password,role,created_at)
        SELECT ?,email,?,?,'admin',? FROM initial_admin_setup WHERE token_hash=? AND used_at IS NULL AND expires_at>?
        AND NOT EXISTS(SELECT 1 FROM users)`).bind(user.id,user.name,stored,now(),hash,now()),
      db.prepare('UPDATE initial_admin_setup SET used_at=? WHERE token_hash=? AND EXISTS(SELECT 1 FROM users WHERE id=?)').bind(now(),hash,user.id)
    ] : [
      db.prepare(`INSERT INTO users (id,email,name,password,role,created_at)
        SELECT ?,email,?,?,role,? FROM invites WHERE token_hash=? AND used_at IS NULL AND expires_at>?`).bind(user.id, user.name, stored, now(), hash, now()),
      db.prepare('UPDATE invites SET used_at=? WHERE token_hash=? AND EXISTS(SELECT 1 FROM users WHERE id=?)').bind(now(), hash, user.id)
    ]);
    requireValue(result[0].meta.changes === 1, 'This invitation is no longer available.');
    return session(db, user);
  }
  const raw = (request.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  const auth = raw && await db.prepare(`SELECT u.*,s.csrf,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>?`).bind(await digest(raw), now()).first();
  requireValue(auth, 'Please sign in to the prayer portal.', 401);
  if (method !== 'GET') requireValue(request.headers.get('x-csrf-token') === auth.csrf, 'Your session changed. Refresh and try again.', 403);
  if (path === '/api/groups' || path.startsWith('/api/groups/')) {
    const response = await handleGroups(request,db,auth,url,{json,body,text,requireValue,rateLimit},config);
    if (response) return response;
  }
  if (path === '/api/me' && method === 'GET') return json({ user: publicUser(auth), csrf: auth.csrf });
  if (path === '/api/logout' && method === 'POST') {
    await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(auth.token_hash).run();
    return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
  }
  if (path === '/api/people' && method === 'GET') {
    return json((await db.prepare(`SELECT u.id,u.name,u.role,f.followed_id IS NOT NULL AS following,
      f.requests,f.updates,f.answered FROM users u LEFT JOIN follows f ON f.followed_id=u.id AND f.follower_id=?
      ORDER BY u.name,u.id`).bind(auth.id).all()).results);
  }
  if (path === '/api/follow' && method === 'POST') {
    const data = await body(request);
    requireValue(data.userId !== auth.id && await db.prepare('SELECT id FROM users WHERE id=?').bind(String(data.userId)).first(), 'Choose another portal member.');
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
    requireValue(!kind || kinds.includes(kind), 'Unknown post type.');
    const [stamp, beforeId = ''] = (url.searchParams.get('before') || `${Number.MAX_SAFE_INTEGER}`).split(':');
    const before = Number(stamp);
    requireValue(Number.isSafeInteger(before) && before > 0 && beforeId.length <= 36, 'Invalid page.');
    const rows = await db.prepare(`SELECT p.*,u.name AS author_name,g.name AS group_name FROM posts p JOIN users u ON u.id=p.author_id LEFT JOIN groups g ON g.id=p.group_id WHERE ${visibility}
      AND (?='' OR p.kind=?) AND (?=0 OR EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=? AND f.followed_id=p.author_id))
      AND (?='' OR p.group_id=?)
      AND (p.created_at < ? OR (p.created_at = ? AND p.id < ?)) ORDER BY p.created_at DESC,p.id DESC LIMIT 51`).bind(...visibleArgs(auth), kind || '', kind || '', +following, auth.id, groupId,groupId,before, before, beforeId).all();
    const posts = rows.results.slice(0, 50), last = posts.at(-1);
    return json({ posts, more: rows.results.length > 50, cursor: last ? `${last.created_at}:${last.id}` : null });
  }
  if (path === '/api/posts' && method === 'POST') {
    const data = await body(request), id = crypto.randomUUID(), time = now();
    const title = text(data.title, 140, 'Title'), content = text(data.body, 6000, 'Prayer text');
    requireValue(kinds.includes(data.kind), 'Choose a post type.');
    requireValue(['members','selected','admins'].includes(data.audience), 'Choose who can see this post.');
    const groupId = data.groupId ? text(data.groupId,80,'Group') : null;
    if (groupId) requireValue(await db.prepare("SELECT 1 FROM group_members WHERE group_id=? AND user_id=? AND status='approved'").bind(groupId,auth.id).first(),'Join this group before posting to it.',403);
    const recipients = data.audience === 'selected' && Array.isArray(data.recipients) ? [...new Set(data.recipients)] : [];
    requireValue(data.audience !== 'selected' || (recipients.length > 0 && recipients.length <= 50), 'Select 1–50 people.');
    for (const person of recipients) requireValue(typeof person === 'string' && person !== auth.id && await db.prepare('SELECT id FROM users WHERE id=?').bind(person).first(), 'One of the selected people is unavailable.');
    if (groupId) for (const person of recipients) requireValue(await db.prepare("SELECT 1 FROM group_members WHERE group_id=? AND user_id=? AND status='approved'").bind(groupId,person).first(),'Selected people must belong to this group.');
    const statements = [db.prepare(`INSERT INTO posts (id,author_id,title,body,kind,audience,created_at,group_id)
      SELECT ?,?,?,?,?,?,?,? WHERE ? IS NULL OR EXISTS (SELECT 1 FROM group_members WHERE group_id=? AND user_id=? AND status='approved')`).bind(id,auth.id,title,content,data.kind,data.audience,time,groupId,groupId,groupId,auth.id)];
    for (const person of recipients) statements.push(db.prepare('INSERT INTO recipients VALUES (?,?)').bind(id, person));
    const preference = { request: 'requests', update: 'updates', answered: 'answered' }[data.kind];
    statements.push(db.prepare(`INSERT INTO notifications (id,user_id,post_id,created_at)
      SELECT lower(hex(randomblob(16))),u.id,p.id,? FROM users u JOIN posts p ON p.id=?
      WHERE u.id<>p.author_id AND ${visibilityFor('u.id','u.role')} AND
      (EXISTS (SELECT 1 FROM follows f WHERE f.follower_id=u.id AND f.followed_id=p.author_id AND f.${preference}=1)
      OR EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id=p.group_id AND gm.user_id=u.id AND gm.status='approved' AND gm.${preference}=1))`).bind(time, id));
    const result = await db.batch(statements);
    requireValue(result[0].meta.changes === 1,'Your group membership changed. Refresh before posting.',403);
    return json({ id }, 201);
  }
  if (/^\/api\/posts\/[^/]+$/.test(path) && method === 'DELETE') {
    const id = path.split('/').pop();
    const result = await db.prepare('DELETE FROM posts WHERE id=? AND (author_id=? OR ?=\'admin\')').bind(id, auth.id, auth.role).run();
    requireValue(result.meta.changes, 'Post unavailable.', 404); return json({ ok: true });
  }
  if (path === '/api/notifications' && method === 'GET') {
    return json((await db.prepare(`SELECT n.id,n.read_at,n.created_at,p.id AS post_id,p.title,p.body,p.kind,p.audience,p.group_id,g.name AS group_name,u.name AS author_name
      FROM notifications n JOIN posts p ON p.id=n.post_id JOIN users u ON u.id=p.author_id LEFT JOIN groups g ON g.id=p.group_id WHERE n.user_id=? AND ${visibility}
      ORDER BY n.created_at DESC LIMIT 100`).bind(auth.id, ...visibleArgs(auth)).all()).results);
  }
  if (path === '/api/notifications/read' && method === 'POST') {
    await db.prepare('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').bind(now(), auth.id).run(); return json({ ok: true });
  }
  if (path.startsWith('/api/invites')) {
    requireValue(auth.role === 'admin', 'Admins only.', 403);
    if (path === '/api/invites' && method === 'GET') return json((await db.prepare('SELECT id,email,role,expires_at,used_at FROM invites ORDER BY expires_at DESC LIMIT 100').all()).results);
    if (path === '/api/invites' && method === 'POST') {
      const data = await body(request), address = email(data.email), rawToken = token(), id = crypto.randomUUID();
      requireValue(['member','admin'].includes(data.role), 'Choose a valid role.');
      requireValue(!await db.prepare('SELECT id FROM users WHERE email=?').bind(address).first(), 'This person already has an account.');
      await db.batch([
        db.prepare('UPDATE invites SET expires_at=? WHERE email=? AND used_at IS NULL').bind(now(), address),
        db.prepare('INSERT INTO invites VALUES (?,?,?,?,?,NULL,?)').bind(id, address, data.role, await digest(rawToken), now() + 7 * 86400000, auth.id)
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
  async fetch(request, env) {
    let response;
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) response = await api(request, env, url);
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
