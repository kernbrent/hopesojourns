import {afterEach,expect,it,vi} from 'vitest';
import {ministryFixture} from './ministry-fixture';
import {handleContactEmail} from '../src/contact-email';
import {signatureKey} from '../src/gift-thanks';
const fixtures:Awaited<ReturnType<typeof ministryFixture>>[]=[];
afterEach(()=>{vi.unstubAllGlobals();fixtures.splice(0).forEach(f=>f.sqlite.close());});
async function setup(){
 const f=await ministryFixture();fixtures.push(f);
 Object.assign(f.env,{ENVIRONMENT:'production',MMT_EMAIL_PROVIDER:'resend',MMT_EMAIL_DELIVERY_MODE:'live',RESEND_API_KEY:'test-only'});
 f.files.set(signatureKey,new Uint8Array([1,2,3]));
 for(const [id,email] of [['one','One@example.test'],['two','one@example.test'],['blank',''],['invalid','bad-address']])f.sqlite.prepare("INSERT INTO people(id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,created_at,updated_at) VALUES(?,'Test',?,'test',?,?,?,'2026','2026')").run(id,id,id,email,email.toLowerCase());
 const fetchMock=vi.fn(async()=>new Response(JSON.stringify({id:'provider-id'}),{status:200}));vi.stubGlobal('fetch',fetchMock);
 const call=(suffix='',body?:unknown,method?:string)=>handleContactEmail(f.request('/admin/contacts/emails'+suffix,body,method),f.env,'/admin/contacts/emails'+suffix);
 const body={sendId:crypto.randomUUID(),personIds:['one','two','blank'],to:['one@example.test','ONE@example.test','manual@example.test'],subject:'Group update',message:'Hello <friends> & neighbors\nA second line.'};
 return {...f,call,body,fetchMock};
}
it('previews deduplicated current addresses, skipped contacts, fixed sender and the standard footer without sending',async()=>{
 const f=await setup(),r=await f.call('/preview',{personIds:['one','two','blank','invalid']});expect(r.status).toBe(200);
 const p=await r.json() as any;expect(p.to).toEqual(['one@example.test']);expect(p.skipped).toEqual(['Test blank','Test invalid']);expect(p.from).toBe('admin@hopesojourns.com');expect(p.footerHtml).toContain('Hope Sojourns oval logo');expect(p.footerHtml).toContain('Brent Kern’s signature');expect(p.footerHtml).toContain('WitLooL™');expect(f.fetchMock).not.toHaveBeenCalled();
});
it('sends one message with all edited recipients in To and appends the signed footer once in HTML and text',async()=>{
 const f=await setup();expect((await f.call('',f.body)).status).toBe(200);expect(f.fetchMock).toHaveBeenCalledTimes(1);
 const [url,init]=f.fetchMock.mock.calls[0] as any;expect(url).toBe('https://api.resend.com/emails');const payload=JSON.parse(init.body);
 expect(payload.from).toBe('Hope Sojourns <admin@hopesojourns.com>');expect(payload.reply_to).toBe('admin@hopesojourns.com');expect(payload.to).toEqual(['manual@example.test','one@example.test']);expect(payload).not.toHaveProperty('bcc');
 expect(payload.html).toContain('Hello &lt;friends&gt; &amp; neighbors<br>A second line.');expect(payload.html).toContain('cid:brent-signature');expect(payload.attachments[0].content).toBe('AQID');expect(payload.html.match(/WitLooL™/g)).toHaveLength(1);expect(payload.text.match(/WitLooL™/g)).toHaveLength(1);expect(payload.text).toContain('https://www.christiansteps.net');
 expect(f.sqlite.prepare('SELECT COUNT(*) n FROM contact_email_people').get()!.n).toBe(2);
 const history=await (await f.call('',undefined,'GET')).json() as any;expect(history.emails[0].status).toBe('sent');expect(history.emails[0].message).toContain('Brent Kern');expect(history.emails[0]).not.toHaveProperty('payload_json');
});
it('captures test messages and their standard footer without contacting the provider',async()=>{
 const f=await setup();f.env.ENVIRONMENT='test';const r=await (await f.call('',f.body)).json() as any;expect(r.email.status).toBe('captured');expect(r.email.message).toContain('Working in the Light of our Lord');expect(f.fetchMock).not.toHaveBeenCalled();
});
it('reuses the exact saved payload and key after an uncertain response even if the signature changes',async()=>{
 const f=await setup();f.fetchMock.mockImplementationOnce(async()=>{throw new Error('timeout');});
 const first=await (await f.call('',f.body)).json() as any;expect(first.email.status).toBe('uncertain');f.files.set(signatureKey,new Uint8Array([9,9]));
 expect((await f.call('',{...f.body,sendId:crypto.randomUUID()})).status).toBe(409);
 const second=await (await f.call('/'+f.body.sendId+'/retry',{})).json() as any;expect(second.email.status).toBe('sent');
 const calls=f.fetchMock.mock.calls as any;expect(calls[1][1].body).toBe(calls[0][1].body);expect(calls[1][1].headers['Idempotency-Key']).toBe(calls[0][1].headers['Idempotency-Key']);
 await f.call('',f.body);await f.call('/'+f.body.sendId+'/retry',{});expect(f.fetchMock).toHaveBeenCalledTimes(2);
 expect((await f.call('',{...f.body,subject:'Changed'})).status).toBe(409);
});
it('rejects concurrent attempts and refuses uncertain retries after the provider deduplication window',async()=>{
 const f=await setup();let finish!:(r:Response)=>void;f.fetchMock.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));
 const pending=f.call('',f.body);await vi.waitFor(()=>expect(f.fetchMock).toHaveBeenCalledTimes(1));
 expect((await f.call('/'+f.body.sendId+'/retry',{})).status).toBe(409);finish(new Response('{}',{status:503}));await pending;
 f.sqlite.prepare("UPDATE contact_emails SET started_at='2020-01-01T00:00:00Z'").run();expect((await f.call('/'+f.body.sendId+'/retry',{})).status).toBe(409);expect(f.fetchMock).toHaveBeenCalledTimes(1);
});
it('validates recipients, content and selection before sending and never accepts a custom sender',async()=>{
 const f=await setup();
 for(const changes of [{to:[]},{to:['good@example.test\r\nBcc: other@example.test']},{to:Array.from({length:51},(_,i)=>`test${i}@example.test`)},{subject:'Bad\nheader'},{subject:''},{message:' '},{personIds:['missing']}])expect((await f.call('',{...f.body,...changes})).status).toBeGreaterThanOrEqual(400);
 expect(f.fetchMock).not.toHaveBeenCalled();expect((await f.call('',{...f.body,from:'spoof@example.test'})).status).toBe(200);expect(JSON.parse((f.fetchMock.mock.calls[0] as any)[1].body).from).toBe('Hope Sojourns <admin@hopesojourns.com>');
});
it('requires authentication, CSRF and contact edit permission for sending and retrying',async()=>{
 const f=await setup();
 const noAuth=new Request('http://localhost/api/interest/admin/contacts/emails',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(f.body)});expect((await handleContactEmail(noAuth,f.env,'/admin/contacts/emails')).status).toBe(401);
 const noCsrf=f.request('/admin/contacts/emails',f.body);noCsrf.headers.delete('x-csrf-token');expect((await handleContactEmail(noCsrf,f.env,'/admin/contacts/emails')).status).toBe(403);
 f.sqlite.exec(`INSERT INTO mmt_users(id,username,first_name,last_name,email,must_change_password,permissions_json,registered_at,updated_at) VALUES('reader','emailreader','Test','Reader','reader@example.test',0,'{"contacts":"read"}','2026','2026'); UPDATE admin_sessions SET user_id='reader' WHERE id='test-session';`);
 expect((await f.call('',f.body)).status).toBe(403);expect((await f.call('/'+f.body.sendId+'/retry',{})).status).toBe(403);expect((await f.call('',undefined,'GET')).status).toBe(200);expect(f.fetchMock).not.toHaveBeenCalled();
 f.sqlite.exec(`UPDATE mmt_users SET permissions_json='{}' WHERE id='reader'`);expect((await f.call('',undefined,'GET')).status).toBe(403);
});
it('fails clearly when the standard signature is missing and reports provider rejections without claiming delivery',async()=>{
 const f=await setup();f.files.delete(signatureKey);expect((await f.call('',f.body)).status).toBe(503);expect(f.fetchMock).not.toHaveBeenCalled();
 f.files.set(signatureKey,new Uint8Array([1]));f.fetchMock.mockImplementationOnce(async()=>new Response('{}',{status:422}));const result=await (await f.call('',f.body)).json() as any;expect(result.email.status).toBe('failed');expect(result.email.error).toContain('provider rejected');
});
