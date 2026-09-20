import { expect, it } from 'vitest';
import { ministryFixture } from './ministry-fixture';
import { handleTripAdminRequest, handleTripPublicRequest } from '../src/trip-platform';

async function setup() {
  const f = await ministryFixture();
  f.env.ADMIN_SESSION_SECRET = 'test-only-high-entropy-secret-for-trip-password-display';
  const created = await handleTripAdminRequest(f.request('/admin/trips', { title: 'Credential test', location: 'Mexico City', status: 'draft' }), f.env, '/admin/trips');
  const { id } = await created.json() as { id: string };
  const path = `/admin/trips/${id}/portal-credential`;
  const call = (body?: unknown) => handleTripAdminRequest(f.request(path, body), f.env, path);
  const workspace = () => handleTripAdminRequest(f.request(`/admin/trips/${id}`), f.env, `/admin/trips/${id}`);
  const login = (password: string) => handleTripPublicRequest(f.request('/portal/login', { loginId: 'CREDENTIAL-TEST', password }), f.env, '/portal/login');
  return { ...f, id, path, call, workspace, login };
}

it('stores only an encrypted display copy, reveals on demand, and preserves login/session revocation', async () => {
  const f = await setup(), password = 'Test password <&> 2027';
  expect((await f.call({ loginId: 'CREDENTIAL-TEST', password })).status).toBe(200);
  const stored = f.sqlite.prepare('SELECT encrypted_password FROM trip_portal_passwords WHERE trip_id=?').get(f.id)!;
  expect(stored.encrypted_password).not.toContain(password);
  const workspace = await f.workspace();
  const payload = await workspace.json() as any;
  expect(payload.portalCredential).toEqual({ canReveal: true, available: true });
  expect(JSON.stringify(payload)).not.toContain(password);
  const revealed = await f.call();
  expect(revealed.status).toBe(200);
  expect(revealed.headers.get('cache-control')).toContain('no-store');
  expect(await revealed.json()).toEqual({ password });
  expect((await f.login(password)).status).toBe(200);
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_portal_sessions').get()?.n).toBe(1);
  const replacement = 'Replacement trip password';
  expect((await f.call({ loginId: 'CREDENTIAL-TEST', password: replacement })).status).toBe(200);
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM trip_portal_sessions').get()?.n).toBe(0);
  expect((await f.login(password)).status).toBe(401);
  expect((await f.login(replacement)).status).toBe(200);
  expect(await (await f.call()).json()).toEqual({ password: replacement });
  expect(JSON.stringify(f.sqlite.prepare('SELECT * FROM audit_events').all())).not.toContain(replacement);
});

it('keeps older hash-only credentials usable until they are saved again', async () => {
  const f = await setup(), password = 'Older trip password';
  await f.call({ loginId: 'CREDENTIAL-TEST', password });
  f.sqlite.prepare('DELETE FROM trip_portal_passwords WHERE trip_id=?').run(f.id);
  expect((await f.login(password)).status).toBe(200);
  expect((await (await f.workspace()).json() as any).portalCredential.available).toBe(false);
  expect((await f.call()).status).toBe(409);
  await f.call({ loginId: 'CREDENTIAL-TEST', password });
  expect(await (await f.call()).json()).toEqual({ password });
});

it('denies reveal to read-only and unauthenticated users and keeps CSRF enforcement on updates', async () => {
  const f = await setup();
  await f.call({ loginId: 'CREDENTIAL-TEST', password: 'Private trip password' });
  const noCsrf = f.request(f.path, { loginId: 'CREDENTIAL-TEST', password: 'Unwanted replacement' });
  noCsrf.headers.delete('x-csrf-token');
  expect((await handleTripAdminRequest(noCsrf, f.env, f.path)).status).toBe(403);
  const anonymous = f.request(f.path); anonymous.headers.delete('cookie');
  expect((await handleTripAdminRequest(anonymous, f.env, f.path)).status).toBe(401);
  f.sqlite.exec(`INSERT INTO mmt_users(id,username,first_name,last_name,email,phone,country,is_admin,permissions_json,status,must_change_password,registered_at,updated_at)
    VALUES('reader','reader','Read','Only','reader@example.test','','US',0,'{"trips":"read"}','active',0,'2026','2026'); UPDATE admin_sessions SET user_id='reader'`);
  expect((await f.call()).status).toBe(403);
  expect((await (await f.workspace()).json() as any).portalCredential).toEqual({ canReveal: false, available: false });
});

it('fails gracefully after encryption key changes without affecting traveler sign-in', async () => {
  const f = await setup(), password = 'Still valid trip password';
  await f.call({ loginId: 'CREDENTIAL-TEST', password });
  f.env.ADMIN_SESSION_SECRET = 'rotated-test-only-encryption-secret';
  expect((await f.call()).status).toBe(409);
  expect((await f.login(password)).status).toBe(200);
  await f.call({ loginId: 'CREDENTIAL-TEST', password });
  expect(await (await f.call()).json()).toEqual({ password });
});
