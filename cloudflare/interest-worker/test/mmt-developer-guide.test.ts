import {afterEach,expect,it} from 'vitest';
import {handleAdminRequest} from '../src/admin';
import {ministryFixture} from './ministry-fixture';
const fixtures:Awaited<ReturnType<typeof ministryFixture>>[]=[];
afterEach(()=>fixtures.splice(0).forEach(f=>f.sqlite.close()));
const path='/admin/developer-guide';
it('protects developer documentation from anonymous and ordinary member access',async()=>{
 const f=await ministryFixture();fixtures.push(f);
 expect((await handleAdminRequest(new Request('https://hopesojourns.com/api/interest'+path),f.env,path)).status).toBe(401);
 f.sqlite.exec("INSERT INTO mmt_users(id,username,first_name,last_name,email,is_org_admin,is_admin,password_hash,registered_at,updated_at) VALUES('other-admin','other-admin','Other','Admin','admin@example.test',1,1,'configured','2026','2026')");
 f.sqlite.exec("UPDATE mmt_users SET is_admin=0,is_org_admin=0,permissions_json='{}' WHERE id='primary'");
 expect((await handleAdminRequest(f.request(path),f.env,path)).status).toBe(403);
});
it('serves private guide content to administrators with restrictive headers and no write endpoint',async()=>{
 const f=await ministryFixture();fixtures.push(f);
 f.sqlite.exec("UPDATE mmt_users SET is_admin=1 WHERE id='primary'");
 f.guides.set('mmt-developer-guide.html','<h1>Developer guide</h1><nav>Table of contents</nav>');
 const response=await handleAdminRequest(f.request(path),f.env,path);
 expect(response.status).toBe(200);expect(await response.text()).toContain('Developer guide');
 expect(response.headers.get('cache-control')).toContain('no-store');
 expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
 expect(response.headers.get('x-robots-tag')).toContain('noindex');
 expect((await handleAdminRequest(f.request(path,{}),f.env,path)).status).toBe(404);
 f.guides.delete('mmt-developer-guide.html');
 expect((await handleAdminRequest(f.request(path),f.env,path)).status).toBe(503);
});
