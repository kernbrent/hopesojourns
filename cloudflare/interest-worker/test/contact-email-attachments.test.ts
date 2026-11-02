import {afterEach,expect,it,vi} from 'vitest';
import {ministryFixture} from './ministry-fixture';
import {handleContactEmail} from '../src/contact-email';
import {signatureKey} from '../src/gift-thanks';
const fixtures:Awaited<ReturnType<typeof ministryFixture>>[]=[];
afterEach(()=>{vi.unstubAllGlobals();fixtures.splice(0).forEach(f=>f.sqlite.close());});
async function setup(){const f=await ministryFixture();fixtures.push(f);Object.assign(f.env,{ENVIRONMENT:'production',MMT_EMAIL_PROVIDER:'resend',MMT_EMAIL_DELIVERY_MODE:'live',RESEND_API_KEY:'test-only'});f.files.set(signatureKey,new Uint8Array([1,2]));const fetchMock=vi.fn(async()=>new Response('{"id":"provider"}'));vi.stubGlobal('fetch',fetchMock);const body={sendId:crypto.randomUUID(),personIds:[],to:['test@example.test'],subject:'Documents',message:'Please review.'};const call=(suffix:string,body?:unknown)=>handleContactEmail(f.request('/admin/contacts/emails'+suffix,body),f.env,'/admin/contacts/emails'+suffix);const form=(files:File[],email=body)=>{const form=new FormData();form.set('email',JSON.stringify(email));for(const file of files)form.append('files',file);return form;};return {...f,fetchMock,body,call,form};}
it('sends real file bytes with hidden recipients, saves metadata privately, and downloads an exact authenticated copy',async()=>{
 const f=await setup(),bytes='%PDF-1.4\nSample PDF';const form=f.form([new File([bytes],'Trip plan.pdf',{type:'application/pdf'}),new File(['PK\x03\x04sample'],'Budget.xlsx')]);
 const r=await f.call('',form);expect(r.status).toBe(200);const {email}=await r.json() as any;expect(email.attachments).toHaveLength(2);expect(JSON.stringify(email)).not.toContain('contact-email-attachments/');
 const payload=JSON.parse((f.fetchMock.mock.calls[0] as any)[1].body);expect(payload.to).toEqual(['admin@hopesojourns.com']);expect(payload.bcc).toEqual(['test@example.test']);expect(payload.attachments).toHaveLength(3);expect(Buffer.from(payload.attachments[1].content,'base64').toString()).toBe(bytes);expect(payload.attachments[2].filename).toBe('Budget.xlsx');
 const saved=String(f.sqlite.prepare('SELECT payload_json FROM contact_emails').get()!.payload_json);expect(saved).not.toContain(Buffer.from(bytes).toString('base64'));
 const download=await f.call('/'+email.id+'/attachments/0');expect(download.headers.get('content-disposition')).toContain('attachment;');expect(download.headers.get('cache-control')).toContain('no-store');expect(await download.text()).toBe(bytes);
 const unauth=new Request('http://localhost:4188/api/interest/admin/contacts/emails/'+email.id+'/attachments/0');expect((await handleContactEmail(unauth,f.env,'/admin/contacts/emails/'+email.id+'/attachments/0')).status).toBe(401);
});
it('replays the exact attachment bytes and delivery key after an uncertain attempt, and rejects changing attachments on a saved send',async()=>{
 const f=await setup();f.fetchMock.mockImplementationOnce(async()=>{throw Error('timeout');});await f.call('',f.form([new File(['%PDF-1.4 first'],'plan.pdf')]));
 expect((await f.call('',f.form([new File(['%PDF-1.4 changed'],'plan.pdf')]))).status).toBe(409);
 await f.call('/'+f.body.sendId+'/retry',{});expect(f.fetchMock).toHaveBeenCalledTimes(2);const calls=f.fetchMock.mock.calls as any;expect(calls[0][1].body).toBe(calls[1][1].body);expect(calls[0][1].headers['Idempotency-Key']).toBe(calls[1][1].headers['Idempotency-Key']);
});
it('captures documents without delivery and refuses unavailable or altered saved bytes before retrying',async()=>{
 const f=await setup();f.env.ENVIRONMENT='test';const {email}=await (await f.call('',f.form([new File(['%PDF-1.4 sample'],'plan.pdf')]))).json() as any;expect(email.status).toBe('captured');expect(f.fetchMock).not.toHaveBeenCalled();
 f.sqlite.prepare("UPDATE contact_emails SET status='failed'").run();const key=[...f.files.keys()].find(k=>k.startsWith('contact-email-attachments/'))!;f.files.set(key,new TextEncoder().encode('corrupt'));expect((await f.call('/'+email.id+'/retry',{})).status).toBe(503);expect(f.fetchMock).not.toHaveBeenCalled();
});
it('rejects unsupported types, false extensions, empty files, too many files, and oversize requests without saving or sending',async()=>{
 const f=await setup();for(const files of [[new File(['executable'],'run.exe')],[new File(['not a pdf'],'bad.pdf')],[new File([],'empty.txt')],Array.from({length:6},()=>new File(['text'],'a.txt')),[new File([new Uint8Array(5*1024*1024+1)],'large.txt')]])expect((await f.call('',f.form(files))).status).toBe(422);
 expect(f.sqlite.prepare('SELECT COUNT(*) n FROM contact_emails').get()!.n).toBe(0);expect(f.fetchMock).not.toHaveBeenCalled();
 const req=f.request('/admin/contacts/emails',f.form([]));req.headers.set('content-length',String(12*1024*1024));expect((await handleContactEmail(req,f.env,'/admin/contacts/emails')).status).toBe(413);
});

it('keeps older flat payload inline signatures separate from downloadable document attachments',async()=>{
 const f=await setup();f.env.ENVIRONMENT='test';await f.call('',f.body);const row=f.sqlite.prepare('SELECT payload_json FROM contact_emails').get()!;const legacy=JSON.parse(String(row.payload_json)).delivery;legacy.to=['test@example.test'];delete legacy.bcc;f.sqlite.prepare("UPDATE contact_emails SET payload_json=?,status='failed'").run(JSON.stringify(legacy));f.env.ENVIRONMENT='production';const r=await f.call('/'+f.body.sendId+'/retry',{});expect(r.status).toBe(200);expect((await r.json() as any).email.attachments).toEqual([]);expect(f.fetchMock).toHaveBeenCalledTimes(1);expect(JSON.parse((f.fetchMock.mock.calls[0] as any)[1].body).attachments[0].content_id).toBe('brent-signature');
});
