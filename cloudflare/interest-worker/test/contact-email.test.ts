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
it('renders and delivers a sanitized responsive newsletter with a plain-text alternative and one standard footer',async()=>{
 const f=await setup();
 const html='<html><head><style>@media(max-width:640px){.email-shell{width:100%!important}}</style></head><body><table class="email-shell" width="640"><tr><td style="padding:24px"><h1>Hope Sojourns News</h1><img src="https://hopesojourns.com/assets/hope-sojourns-logo.png" alt="Hope Sojourns"><a href="https://hopesojourns.com/giving/#donate">Become a Founding Partner</a></td></tr></table><script>alert(1)</script><img src="javascript:alert(1)" onerror="alert(1)"><iframe src="https://example.test">bad frame</iframe><form action="https://example.test"><input name="password"></form></body></html>';
 const preview=await (await f.call('/render',{html})).json() as any;
 expect(preview.html).toContain('@media(max-width:640px)');expect(preview.html).toContain('style="padding:24px"');expect(preview.html).toContain('data:image/png;base64,AQID');
 const draftPath=preview.previewUrl.replace('/api/interest/admin/contacts/emails','');
 const draft=await f.call(draftPath,undefined,'GET');expect(draft.headers.get('content-type')).toContain('text/html');expect(draft.headers.get('content-security-policy')).toContain("style-src 'unsafe-inline'");expect(draft.headers.get('content-security-policy')).toContain("frame-ancestors 'self'; sandbox");expect(draft.headers.get('cache-control')).toBe('no-store, private');expect(await draft.text()).toBe(preview.html);
 for(const unsafe of ['<script','onerror','javascript:','<iframe','<form','<input'])expect(preview.html).not.toContain(unsafe);
 expect(f.fetchMock).not.toHaveBeenCalled();expect(f.sqlite.prepare('SELECT COUNT(*) n FROM contact_emails').get()!.n).toBe(0);
 const body={...f.body,format:'html',html,message:'Hope Sojourns News\nBecome a Founding Partner: https://hopesojourns.com/giving/#donate'};
 const result=await (await f.call('',body)).json() as any;expect(result.email.format).toBe('html');expect(result.email.status).toBe('sent');
 const sent=JSON.parse((f.fetchMock.mock.calls[0] as any)[1].body);
 expect(sent.html).toContain('<h1>Hope Sojourns News</h1>');expect(sent.html).not.toContain('&lt;h1');expect(sent.text).toContain(body.message);expect(sent.html.match(/WitLooL™/g)).toHaveLength(1);expect(sent.html).toContain('cid:brent-signature');expect(sent.bcc).toEqual(['manual@example.test','one@example.test']);
 const copy=await (await f.call('/'+body.sendId+'/preview',undefined,'GET')).json() as any;expect(copy.html).toContain('data:image/png;base64,AQID');
 const savedPath='/admin/contacts/emails/'+body.sendId+'/preview';const savedDocument=await handleContactEmail(f.request(savedPath+'?document=1',undefined,'GET'),f.env,savedPath);expect(savedDocument.headers.get('content-type')).toContain('text/html');expect(await savedDocument.text()).toBe(copy.html);
 expect((await f.call('',{...body,html:html.replace('Hope Sojourns News','Changed newsletter')})).status).toBe(409);
});
it('replaces draft previews and expires them without exposing another editor’s draft',async()=>{
 const f=await setup(),first=await (await f.call('/render',{html:'<p>First</p>'})).json() as any,second=await (await f.call('/render',{html:'<p>Second</p>'})).json() as any;
 const suffix=(url:string)=>url.replace('/api/interest/admin/contacts/emails','');
 expect((await f.call(suffix(first.previewUrl),undefined,'GET')).status).toBe(404);
 const key='contact-email-previews/primary.json',bytes=f.files.get(key)!;const stored=JSON.parse(new TextDecoder().decode(bytes));stored.expiresAt=0;f.files.set(key,new TextEncoder().encode(JSON.stringify(stored)));
 expect((await f.call(suffix(second.previewUrl),undefined,'GET')).status).toBe(404);expect(f.files.has(key)).toBe(false);
 const next=await (await f.call('/render',{html:'<p>Private preview</p>'})).json() as any;
 f.sqlite.exec(`INSERT INTO mmt_users(id,username,first_name,last_name,email,must_change_password,permissions_json,registered_at,updated_at) VALUES('other','othereditor','Other','Editor','other@example.test',0,'{"contacts":"edit"}','2026','2026'); UPDATE admin_sessions SET user_id='other' WHERE id='test-session';`);
 expect((await f.call(suffix(next.previewUrl),undefined,'GET')).status).toBe(404);expect(f.fetchMock).not.toHaveBeenCalled();
});
it('captures formatted newsletters without live delivery and preserves exact HTML on uncertain retries',async()=>{
 const f=await setup(),body={...f.body,format:'html',html:'<p>January in Mexico</p>'};
 f.fetchMock.mockImplementationOnce(async()=>{throw Error('timeout');});
 expect((await (await f.call('',body)).json() as any).email.status).toBe('uncertain');
 f.files.set(signatureKey,new Uint8Array([9]));await f.call('/'+body.sendId+'/retry',{});
 expect((f.fetchMock.mock.calls[1] as any)[1].body).toBe((f.fetchMock.mock.calls[0] as any)[1].body);
 f.env.ENVIRONMENT='test';expect((await (await f.call('',{...body,sendId:crypto.randomUUID(),subject:'Capture'})).json() as any).email.status).toBe('captured');expect(f.fetchMock).toHaveBeenCalledTimes(2);
});
it('rejects invalid HTML, invalid format and missing alternatives before saving or delivery',async()=>{
 const f=await setup();
 for(const changes of [{format:'other'},{format:'html'},{format:'html',html:'<script>only script</script>'},{format:'html',html:'x'.repeat(80001)},{format:'html',html:'<p>Hello</p>',message:''}])expect((await f.call('',{...f.body,...changes})).status).toBe(422);
 expect(f.fetchMock).not.toHaveBeenCalled();expect(f.sqlite.prepare('SELECT COUNT(*) n FROM contact_emails').get()!.n).toBe(0);
});
it('keeps selected and manually added recipients in BCC with only the ministry address in To and preserves the signed footer',async()=>{
 const f=await setup();expect((await f.call('',f.body)).status).toBe(200);expect(f.fetchMock).toHaveBeenCalledTimes(1);
 const [url,init]=f.fetchMock.mock.calls[0] as any;expect(url).toBe('https://api.resend.com/emails');const payload=JSON.parse(init.body);
 expect(payload.from).toBe('Hope Sojourns <admin@hopesojourns.com>');expect(payload.reply_to).toBe('admin@hopesojourns.com');expect(payload.to).toEqual(['admin@hopesojourns.com']);expect(payload.bcc).toEqual(['manual@example.test','one@example.test']);expect(payload).not.toHaveProperty('cc');expect(payload).not.toHaveProperty('recipients');
 for(const address of payload.bcc){expect(payload.html).not.toContain(address);expect(payload.text).not.toContain(address);}
 expect(payload.html).toContain('Hello &lt;friends&gt; &amp; neighbors<br>A second line.');expect(payload.html).toContain('cid:brent-signature');expect(payload.attachments[0].content).toBe('AQID');expect(payload.html.match(/WitLooL™/g)).toHaveLength(1);expect(payload.text.match(/WitLooL™/g)).toHaveLength(1);expect(payload.text).toContain('https://www.christiansteps.net');
 expect(f.sqlite.prepare('SELECT COUNT(*) n FROM contact_email_people').get()!.n).toBe(2);
 const history=await (await f.call('',undefined,'GET')).json() as any;expect(history.emails[0].status).toBe('sent');expect(history.emails[0].message).toContain('Brent Kern');expect(history.emails[0].to).toEqual(payload.bcc);expect(history.emails[0].visibleTo).toEqual(payload.to);expect(history.emails[0].privateRecipients).toBe(true);expect(history.emails[0]).not.toHaveProperty('payload_json');
});
it('does not duplicate the ministry address in BCC when it is also selected',async()=>{
 const f=await setup();await f.call('',{...f.body,to:['admin@hopesojourns.com','manual@example.test']});
 const payload=JSON.parse((f.fetchMock.mock.calls[0] as any)[1].body);expect(payload.to).toEqual(['admin@hopesojourns.com']);expect(payload.bcc).toEqual(['manual@example.test']);
 const history=await (await f.call('',undefined,'GET')).json() as any;expect(history.emails[0].to).toEqual(['admin@hopesojourns.com','manual@example.test']);
});
it('blocks old unresolved visible group emails without modifying their saved payload or resending',async()=>{
 const f=await setup();f.env.ENVIRONMENT='test';await f.call('',f.body);
 const row=f.sqlite.prepare('SELECT payload_json FROM contact_emails').get() as any;
 const saved=JSON.parse(row.payload_json),legacy=JSON.stringify({...saved.delivery,to:saved.recipients,bcc:undefined});
 f.sqlite.prepare("UPDATE contact_emails SET payload_json=?,status='uncertain'").run(legacy);
 expect((await f.call('/'+f.body.sendId+'/retry',{})).status).toBe(409);expect(f.fetchMock).not.toHaveBeenCalled();
 expect(f.sqlite.prepare('SELECT payload_json FROM contact_emails').get()!.payload_json).toBe(legacy);
 const history=await (await f.call('',undefined,'GET')).json() as any;expect(history.emails[0].privateRecipients).toBe(false);expect(history.emails[0].retryAllowed).toBe(false);expect(history.emails[0].to).toEqual(saved.recipients);
 f.sqlite.prepare("UPDATE contact_emails SET status='sent'").run();expect((await f.call('/'+f.body.sendId+'/retry',{})).status).toBe(200);expect(f.fetchMock).not.toHaveBeenCalled();
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
 expect((await f.call('/render',{html:'<p>Not allowed</p>'})).status).toBe(403);
 f.sqlite.exec(`UPDATE mmt_users SET permissions_json='{}' WHERE id='reader'`);expect((await f.call('',undefined,'GET')).status).toBe(403);
 expect((await f.call('/'+f.body.sendId+'/preview',undefined,'GET')).status).toBe(403);
});
it('fails clearly when the standard signature is missing and reports provider rejections without claiming delivery',async()=>{
 const f=await setup();f.files.delete(signatureKey);expect((await f.call('',f.body)).status).toBe(503);expect(f.fetchMock).not.toHaveBeenCalled();
 f.files.set(signatureKey,new Uint8Array([1]));f.fetchMock.mockImplementationOnce(async()=>new Response('{}',{status:422}));const result=await (await f.call('',f.body)).json() as any;expect(result.email.status).toBe('failed');expect(result.email.error).toContain('provider rejected');
});

it('updates Last Contacted only for actual recipient contacts, including shared and manually added addresses',async()=>{
 const f=await setup();
 f.sqlite.prepare("UPDATE people SET email='manual@example.test' WHERE id='invalid'").run();
 f.sqlite.prepare("UPDATE people SET last_contacted_at='2026-01-01',last_contacted_note='Earlier phone call'").run();
 const result=await (await f.call('',{...f.body,subject:'Payment Options for Your Mexico Trip'})).json() as any;
 expect(result.email.status).toBe('sent');
 for(const id of ['one','two','invalid'])expect(f.sqlite.prepare('SELECT last_contacted_at,last_contacted_note FROM people WHERE id=?').get(id)).toEqual({last_contacted_at:result.email.sentAt,last_contacted_note:'Email sent: Payment Options for Your Mexico Trip'});
 expect(f.sqlite.prepare("SELECT last_contacted_at,last_contacted_note FROM people WHERE id='blank'").get()).toEqual({last_contacted_at:'2026-01-01',last_contacted_note:'Earlier phone call'});
});

it('does not mark selected contacts whose addresses were removed from the final email',async()=>{
 const f=await setup();await f.call('',{...f.body,to:['manual@example.test']});
 expect(f.sqlite.prepare('SELECT COUNT(*) n FROM people WHERE last_contacted_at IS NOT NULL OR last_contacted_note IS NOT NULL').get()!.n).toBe(0);
});

it.each(['capture','rejected','uncertain','unconfigured'])('preserves existing contact dates and notes for %s email',async mode=>{
 const f=await setup();
 f.sqlite.prepare("UPDATE people SET last_contacted_at='2026-01-01',last_contacted_note='Earlier phone call'").run();
 if(mode==='capture')f.env.ENVIRONMENT='test';
 if(mode==='rejected')f.fetchMock.mockImplementationOnce(async()=>new Response('{}',{status:422}));
 if(mode==='uncertain')f.fetchMock.mockImplementationOnce(async()=>{throw Error('timeout');});
 if(mode==='unconfigured')f.env.MMT_EMAIL_DELIVERY_MODE='capture';
 await f.call('',f.body);
 expect(f.sqlite.prepare("SELECT COUNT(*) n FROM people WHERE last_contacted_at='2026-01-01' AND last_contacted_note='Earlier phone call'").get()!.n).toBe(4);
});

it('updates activity once after an accepted retry and keeps later contact edits on repeated requests',async()=>{
 const f=await setup();f.fetchMock.mockImplementationOnce(async()=>{throw Error('timeout');});
 await f.call('',f.body);
 expect(f.sqlite.prepare("SELECT last_contacted_at FROM people WHERE id='one'").get()!.last_contacted_at).toBeNull();
 const result=await (await f.call('/'+f.body.sendId+'/retry',{})).json() as any;
 expect(f.sqlite.prepare("SELECT last_contacted_at,last_contacted_note FROM people WHERE id='one'").get()).toEqual({last_contacted_at:result.email.sentAt,last_contacted_note:'Email sent: Group update'});
 f.sqlite.prepare("UPDATE people SET last_contacted_note='Follow-up phone call' WHERE id='one'").run();
 await f.call('',f.body);await f.call('/'+f.body.sendId+'/retry',{});
 expect(f.sqlite.prepare("SELECT last_contacted_note FROM people WHERE id='one'").get()!.last_contacted_note).toBe('Follow-up phone call');
 expect(f.fetchMock).toHaveBeenCalledTimes(2);
});

it('limits the email note to 50 characters and preserves newer contact activity',async()=>{
 const f=await setup();f.sqlite.prepare("UPDATE people SET last_contacted_at='2099-01-01',last_contacted_note='Newer contact' WHERE id='two'").run();
 await f.call('',{...f.body,subject:'A very long subject about trip preparation and payments that exceeds the note limit'});
 const note=f.sqlite.prepare("SELECT last_contacted_note FROM people WHERE id='one'").get()!.last_contacted_note as string;
 expect(note).toBe('Email sent: A very long subject about trip prepara');expect(note.length).toBe(50);
 expect(f.sqlite.prepare("SELECT last_contacted_at,last_contacted_note FROM people WHERE id='two'").get()).toEqual({last_contacted_at:'2099-01-01',last_contacted_note:'Newer contact'});
});

it('rolls back sent status and contact activity together when finalization fails',async()=>{
 const f=await setup(),batch=f.env.DB.batch.bind(f.env.DB);
 vi.spyOn(f.env.DB,'batch').mockImplementation(statements=>batch(statements.some(s=>(s as any).sql.includes('UPDATE people SET last_contacted_at'))?[...statements,f.env.DB.prepare('INSERT INTO nonexistent_table VALUES(1)')]:statements));
 expect((await f.call('',f.body)).status).toBe(500);
 expect(f.sqlite.prepare('SELECT status,sent_at FROM contact_emails').get()).toEqual({status:'sending',sent_at:null});
 expect(f.sqlite.prepare('SELECT COUNT(*) n FROM people WHERE last_contacted_at IS NOT NULL OR last_contacted_note IS NOT NULL').get()!.n).toBe(0);
});
