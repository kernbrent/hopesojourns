import {afterEach,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {handleAdminRequest} from '../src/admin';
import {ministryFixture} from './ministry-fixture';
const fixtures:Awaited<ReturnType<typeof ministryFixture>>[]=[];
afterEach(()=>fixtures.splice(0).forEach(f=>f.sqlite.close()));
const path='/admin/developer-guide';
it('reuses an existing footer when session updates mount navigation again',()=>{
 const source=readFileSync(new URL('../../../admin/mmt-navigation.js',import.meta.url),'utf8');
 const body=source.slice(source.indexOf(' function mountGuideFooter(){'),source.indexOf(' function unmount(){'));
 const children:any[]=[];
 const footer={querySelector:(selector:string)=>children.find(x=>selector.includes('developer')?x.dataset.mmtDeveloperGuideLink:x.dataset.mmtGuideLink),append:(node:any)=>children.push(node)};
 const footers:any[]=[];
 const document={querySelector:(selector:string)=>selector.includes('.mmt-guide-footer')?footers[0]:null,body:{append:(node:any)=>footers.push(node)},createElement:(tag:string)=>tag==='footer'?footer:{dataset:{},after:(node:any)=>children.push(node)}};
 const mount=new Function('document','user','guideFooter',body+';return mountGuideFooter;')(document,{is_admin:true});
 mount();mount();expect(footers).toHaveLength(1);expect(children).toHaveLength(2);
});
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
