import {afterEach,expect,it,vi} from 'vitest';
import {ministryFixture} from './ministry-fixture';
import {handleLedgerAdminRequest} from '../src/ledger-admin';
import {automaticallyThankGift,sendGiftThanks,signatureKey} from '../src/gift-thanks';
import {giftEmail,paymentLabel} from '../src/gift-email-template';
const fixtures:Awaited<ReturnType<typeof ministryFixture>>[]=[];
afterEach(()=>{vi.unstubAllGlobals();fixtures.splice(0).forEach(f=>f.sqlite.close());});
async function setup(){
 const f=await ministryFixture();fixtures.push(f);
 Object.assign(f.env,{ENVIRONMENT:'production',MMT_EMAIL_PROVIDER:'resend',MMT_EMAIL_DELIVERY_MODE:'live',RESEND_API_KEY:'test-only-key'});
 f.files.set(signatureKey,new Uint8Array([1,2,3]));
 for(const id of ['donor','other'])f.sqlite.prepare(`INSERT INTO people(id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,preferred_name,created_at,updated_at) VALUES(?,'David','Kern','david','kern',?,?,'Dave','2026','2026')`).run(id,id+'@example.test',id+'@example.test');
 f.sqlite.exec(`INSERT INTO ledger_entries(id,source_type,import_key,content_fingerprint,transaction_date,entry_type,payment_type,budget_category,amount,person_id,charitable_amount,currency,created_at,updated_at) VALUES('gift','manual','gift','test','2026-09-23','income','Personal Venmo','General',100,'donor',100,'USD','2026','2026')`);
 const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({id:'provider-123'}),{status:200}));vi.stubGlobal('fetch',fetchMock);
 const path='/admin/ledger/entries/gift/thanks/donor';
 const call=(path:string,body?:unknown,method?:string)=>handleLedgerAdminRequest(f.request(path,body,method),f.env,path);
 return {...f,fetchMock,path,call};
}
it('renders the approved template safely with the date, amount, payment method, signature, links and footer-only trademark',()=>{
 const msg=giftEmail({name:'<Dave & Joy>',amount:100,date:'2026-09-23',method:'Personal Venmo',currency:'USD'},'cid:signature');
 expect(msg.subject).toBe('Thank You for your support of Hope Sojourns');
 expect(msg.html).toContain('&lt;Dave &amp; Joy&gt;');expect(msg.html).toContain('September 23, 2026');expect(msg.html).toContain('$100.00');
 expect(msg.html).toContain('WitLooL,<br>');expect(msg.html.match(/WitLooL™/g)).toHaveLength(1);
 expect(msg.html).toContain('972-505-0171');expect(msg.html).toContain('https://www.christiansteps.net');expect(msg.html).not.toContain('overflow:hidden');
 expect(['PayPal','Personal Venmo','Check','Zelle','Cash','Bank deposit'].map(paymentLabel)).toEqual(['PayPal','Venmo','Check','Zelle','Cash','Other']);
});
it('sends once, persists sent state, and rejects concurrent requests without a second provider send',async()=>{
 const f=await setup();
 const result=await Promise.allSettled([sendGiftThanks(f.env,'gift','donor','primary'),sendGiftThanks(f.env,'gift','donor','primary')]);
 expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(f.fetchMock).toHaveBeenCalledTimes(1);
 expect((await sendGiftThanks(f.env,'gift','donor','primary')).status).toBe('sent');expect(f.fetchMock).toHaveBeenCalledTimes(1);
 const payload=JSON.parse(f.fetchMock.mock.calls[0]![1].body);expect(payload.to).toEqual(['donor@example.test']);expect(payload.from).toBe('Hope Sojourns <giving@hopesojourns.com>');expect(payload.reply_to).toBe('giving@hopesojourns.com');expect(payload.html).toContain('Dear Dave,');expect(payload.attachments[0].content_id).toBe('brent-signature');
 const response=await f.call(f.path);expect((await response.json() as {locked:boolean}).locked).toBe(true);
});
it('preview and failed validation never send, including missing email and changed gift',async()=>{
 const f=await setup();const preview=await (await f.call(f.path)).json() as {previewHash:string};
 f.sqlite.exec("UPDATE ledger_entries SET charitable_amount=75 WHERE id='gift'");
 expect((await f.call(f.path,{previewHash:preview.previewHash})).status).toBe(409);
 f.sqlite.exec("UPDATE people SET email='' WHERE id='donor'");
 await expect(sendGiftThanks(f.env,'gift','donor','primary')).rejects.toMatchObject({code:'EMAIL_REQUIRED'});expect(f.fetchMock).not.toHaveBeenCalled();
});
it('does not resend an acknowledged gift after its linked contact is changed',async()=>{
 const f=await setup();
 f.sqlite.exec("INSERT INTO gift_thanks(entry_id,person_id,status,attempt_key,payload_json,started_at,updated_at,actor) VALUES('gift','other','failed','old','{}','2026','2026','primary')");
 await sendGiftThanks(f.env,'gift','donor','primary');
 f.sqlite.exec("UPDATE ledger_entries SET person_id='other' WHERE id='gift'");
 expect((await sendGiftThanks(f.env,'gift','other','primary')).status).toBe('sent');
 expect(f.fetchMock).toHaveBeenCalledTimes(1);
 const response=await f.call('/admin/ledger/entries/gift/thanks');
 expect((await response.json() as {gifts:{status:string}[]}).gifts[0]?.status).toBe('sent');
});
it('retries a definitive failure and locks after acceptance',async()=>{
 const f=await setup();f.fetchMock.mockResolvedValueOnce(new Response('{}',{status:422}));
 expect((await sendGiftThanks(f.env,'gift','donor','primary')).status).toBe('failed');
 expect((await sendGiftThanks(f.env,'gift','donor','primary')).status).toBe('sent');expect(f.fetchMock).toHaveBeenCalledTimes(2);
});
it('reuses identical payload and key after uncertainty even when contact details changed; never retries after key expiry',async()=>{
 const f=await setup();f.fetchMock.mockRejectedValueOnce(new TypeError('network disconnected'));
 expect((await sendGiftThanks(f.env,'gift','donor','primary')).status).toBe('uncertain');
 const first=f.fetchMock.mock.calls[0]![1];f.sqlite.exec("UPDATE people SET email='changed@example.test' WHERE id='donor'");
 expect((await sendGiftThanks(f.env,'gift','donor','primary')).status).toBe('sent');
 expect(f.fetchMock.mock.calls[1]![1].body).toBe(first.body);expect(f.fetchMock.mock.calls[1]![1].headers['Idempotency-Key']).toBe(first.headers['Idempotency-Key']);
 f.sqlite.exec("UPDATE gift_thanks SET status='uncertain',started_at='2020-01-01T00:00:00Z'");
 await expect(sendGiftThanks(f.env,'gift','donor','primary')).rejects.toMatchObject({code:'THANK_YOU_LOCKED'});expect(f.fetchMock).toHaveBeenCalledTimes(2);
});
it('captures test messages without sending or marking sent, even if live credentials are present',async()=>{
 const f=await setup();f.env.ENVIRONMENT='test';
 expect((await sendGiftThanks(f.env,'gift','donor','primary')).status).toBe('captured');expect(f.fetchMock).not.toHaveBeenCalled();
 expect(f.sqlite.prepare('SELECT sent_at FROM gift_thanks').get()?.sent_at).toBeNull();
});
it('automatic mode defaults off, sends new linked gifts when enabled, and returns errors without failing gift reception',async()=>{
 const f=await setup();expect(await automaticallyThankGift(f.env,'gift','primary')).toEqual([]);
 await f.call('/admin/ledger/gift-thanks/settings',{automatic:true},'PUT');
 expect((await automaticallyThankGift(f.env,'gift','primary'))[0]).toMatchObject({status:'sent'});
 expect((await automaticallyThankGift(f.env,'gift','primary'))[0]).toMatchObject({status:'sent'});expect(f.fetchMock).toHaveBeenCalledTimes(1);
});
it('sends split shares separately and prevents later allocation changes from causing duplicate acknowledgments',async()=>{
 const f=await setup();const allocations=[{personId:'donor',date:'2026-09-01',amountCents:2500},{personId:'other',date:'2026-09-02',amountCents:7500}];
 f.sqlite.prepare("INSERT INTO donation_splits VALUES('gift',1,?,'2026','primary')").run(JSON.stringify(allocations));
 await sendGiftThanks(f.env,'gift','donor','primary');await sendGiftThanks(f.env,'gift','other','primary');
 const payload=JSON.parse(f.fetchMock.mock.calls[0]![1].body);expect(payload.text).toContain('$25.00');expect(payload.text).toContain('September 1, 2026');
 expect(()=>f.sqlite.exec("UPDATE donation_splits SET allocations_json='[]' WHERE entry_id='gift'")).toThrow(/acknowledgment/);
});
it('requires finance permissions and CSRF, and rejects non-charitable or unlinked gifts',async()=>{
 const f=await setup();
 expect((await handleLedgerAdminRequest(new Request('http://localhost'+f.path),f.env,f.path)).status).toBe(401);
 const noCsrf=f.request(f.path,{previewHash:'x'});noCsrf.headers.delete('x-csrf-token');expect((await handleLedgerAdminRequest(noCsrf,f.env,f.path)).status).toBe(403);
 f.sqlite.exec(`INSERT INTO mmt_users(id,username,first_name,last_name,email,is_org_admin,is_admin,password_hash,registered_at,updated_at) VALUES('other-admin','other-admin','Other','Admin','admin@example.test',1,1,'configured','2026','2026');UPDATE mmt_users SET is_org_admin=0,is_admin=0,permissions_json='{"finances":"read"}' WHERE id='primary'`);
 expect((await f.call(f.path,{previewHash:'x'})).status).toBe(403);
 f.sqlite.exec("UPDATE ledger_entries SET charitable_amount=0 WHERE id='gift'");await expect(sendGiftThanks(f.env,'gift','donor','primary')).rejects.toMatchObject({code:'GIFT_NOT_FOUND'});
 expect(f.fetchMock).not.toHaveBeenCalled();
});
