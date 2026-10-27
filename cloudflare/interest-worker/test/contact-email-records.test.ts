import {afterEach,expect,it,vi} from 'vitest';
import {ministryFixture} from './ministry-fixture';
import {receiveInterest} from '../src/interest-review';
import {validateSubmissionPayload} from '../src/index';
import {handleAdminRequest} from '../src/admin';
import {handleContactEmail} from '../src/contact-email';
import {contactEmailActivity} from '../src/contact-email-records';
import {handleMinistryAdminRequest} from '../src/ministry-admin';
import {signatureKey} from '../src/gift-thanks';
const fixtures:Awaited<ReturnType<typeof ministryFixture>>[]=[];
afterEach(()=>{vi.unstubAllGlobals();fixtures.splice(0).forEach(f=>f.sqlite.close());});
async function setup(){
 const f=await ministryFixture();fixtures.push(f);f.env.ENVIRONMENT='test';f.files.set(signatureKey,new Uint8Array([1]));
 const input=validateSubmissionPayload({firstName:'Test',lastName:'History',email:'history@example.test',phone:'9725550123',contactPreference:'email',preferredTiming:'Next year',message:'I am interested',opportunities:['trip-athens'],consent:true,idempotencyKey:crypto.randomUUID()});
 const receipt=await receiveInterest(f.env,input,'new-'+crypto.randomUUID(),[{id:'trip-athens'}],null,null);
 const personId=String(f.sqlite.prepare('SELECT person_id FROM interest_submissions WHERE id=?').get(receipt.submissionId)!.person_id);
 const mail=async()=>{const path='/admin/contacts/emails';const response=await handleContactEmail(f.request(path,{sendId:crypto.randomUUID(),personIds:[],to:['history@example.test'],subject:'Saved history copy',message:'Hello!\nA full message.'}),f.env,path);expect(response.status).toBe(200);return (await response.json() as any).email;};
 const inbox=(query='')=>handleMinistryAdminRequest(f.request('/admin/ministry/inbox'+query),f.env,'/admin/ministry/inbox');
 const live=()=>{Object.assign(f.env,{ENVIRONMENT:'production',MMT_EMAIL_PROVIDER:'resend',MMT_EMAIL_DELIVERY_MODE:'live',RESEND_API_KEY:'test-only'});vi.stubGlobal('fetch',vi.fn(async()=>Response.json({id:'accepted'})));};
 return {...f,personId,inquiryId:receipt.submissionId,mail,inbox,live};
}
it('keeps interest awaiting a reply for acknowledgment, capture, failure and uncertain sends; clears it only after acceptance',async()=>{
 const f=await setup(),activity=async()=>(await contactEmailActivity(f.env,[f.personId])).get(f.personId)!;
 expect((await activity()).awaitingInterestId).toBe(f.inquiryId);
 await f.mail();expect((await activity()).awaitingInterestId).toBe(f.inquiryId);expect((await activity()).emailSentCount).toBe(0);
 f.live();vi.stubGlobal('fetch',vi.fn(async()=>Response.json({}, {status:422})));await f.mail();expect((await activity()).awaitingInterestId).toBe(f.inquiryId);
 vi.stubGlobal('fetch',vi.fn(async()=>{throw Error('timeout');}));const uncertain=await f.mail();expect((await activity()).awaitingInterestId).toBe(f.inquiryId);
 f.live();await handleContactEmail(f.request('/admin/contacts/emails/'+uncertain.id+'/retry',{}),f.env,'/admin/contacts/emails/'+uncertain.id+'/retry');
 expect(await activity()).toMatchObject({awaitingInterestId:null,emailSentCount:1,lastEmailSentAt:expect.any(String)});
 f.sqlite.prepare('UPDATE interest_submissions SET created_at=? WHERE id=?').run('2099-01-01T00:00:00Z',f.inquiryId);expect((await activity()).awaitingInterestId).toBe(f.inquiryId);
});
it('links manual recipients to contact history and provides a complete sent copy in Inbox without adding an action notice',async()=>{
 const f=await setup();f.live();const mail=await f.mail();
 const path='/admin/people/'+f.personId,response=await handleAdminRequest(f.request(path),f.env,path);expect(response.status).toBe(200);
 const detail=(await response.json() as any).person;expect(detail.emailSentCount).toBe(1);expect(detail.contactEmails[0]).toMatchObject({id:mail.id,sentAt:mail.sentAt});
 expect(detail.contactEmails[0].message).toContain('Brent Kern');expect(detail.awaitingInterestId).toBeNull();
 const list=await (await handleAdminRequest(f.request('/admin/people'),f.env,'/admin/people')).json() as any;expect(list.people.find((p:any)=>p.id===f.personId).lastEmailSentAt).toBe(mail.sentAt);
 const copies=await (await f.inbox('?show=emails_sent')).json() as any;expect(copies.emails[0]).toMatchObject({id:mail.id,subject:'Saved history copy',visibleTo:['admin@hopesojourns.com'],to:['history@example.test']});expect(copies.emails[0].message).toContain('A full message.');expect(copies.emails[0]).not.toHaveProperty('payload_json');
 const normal=await (await f.inbox()).json() as any;expect(normal.items.some((item:any)=>item.id===mail.id)).toBe(false);
});
it('paginates recipient-specific history and sent copies without treating test captures as sent, and protects copies with both inbox and contacts access',async()=>{
 const f=await setup();await f.mail();expect((await (await f.inbox('?show=emails_sent')).json() as any).emails).toHaveLength(0);
 f.live();const sent=await f.mail();const raw=f.sqlite.prepare('SELECT * FROM contact_emails WHERE id=?').get(sent.id) as any;
 for(let i=0;i<30;i++){const id=crypto.randomUUID();f.sqlite.prepare("INSERT INTO contact_emails(id,request_hash,payload_json,status,attempt_key,created_by,created_at,updated_at,sent_at) VALUES(?,?,?,'sent',?,'primary','2026','2026','2026')").run(id,'hash-'+i,raw.payload_json,id);f.sqlite.prepare('INSERT INTO contact_email_people VALUES(?,?)').run(id,f.personId);}
 const page=await (await f.inbox('?show=emails_sent&page=2')).json() as any;expect(page.pagination).toMatchObject({page:2,total:31,pages:2});expect(page.emails).toHaveLength(1);
 const history=await (await handleContactEmail(f.request('/admin/contacts/emails?personId='+f.personId+'&page=2'),f.env,'/admin/contacts/emails')).json() as any;expect(history.pagination.total).toBe(32);expect(history.emails).toHaveLength(2);
 f.sqlite.exec(`INSERT INTO mmt_users(id,username,first_name,last_name,email,must_change_password,permissions_json,registered_at,updated_at) VALUES('reader','historyreader','Test','Reader','reader@example.test',0,'{"inbox":"read"}','2026','2026'); UPDATE admin_sessions SET user_id='reader' WHERE id='test-session';`);
 expect((await f.inbox('?show=emails_sent')).status).toBe(403);
 f.sqlite.prepare('UPDATE mmt_users SET permissions_json=? WHERE id=?').run('{"contacts":"read"}','reader');expect((await f.inbox('?show=emails_sent')).status).toBe(403);
 f.sqlite.prepare('UPDATE mmt_users SET permissions_json=? WHERE id=?').run('{"inbox":"read","contacts":"read"}','reader');expect((await f.inbox('?show=emails_sent')).status).toBe(200);
});
