import {afterEach,expect,it} from 'vitest';
import {ministryFixture} from './ministry-fixture';
import {saveSplit,splitSnapshot,internalDonationSplits} from '../src/donation-splits';
import {handleLedgerAdminRequest} from '../src/ledger-admin';
const fixtures:Awaited<ReturnType<typeof ministryFixture>>[]=[];
afterEach(()=>fixtures.splice(0).forEach(f=>f.sqlite.close()));
async function setup(){const f=await ministryFixture();fixtures.push(f);f.sqlite.exec(`INSERT INTO ledger_entries(id,source_type,import_key,content_fingerprint,transaction_date,entry_type,payment_type,budget_category,amount,name,charitable_amount,gross,fee,net,created_at,updated_at) VALUES('split-test','manual','split-test','test','2026-09-17','income','PayPal','Donations',291,'Transfer agent',300,300,-9,291,'now','now')`);return f;}
const rows=[{firstName:'Alice',lastName:'Example',email:'alice@example.test',date:'2025-12-31',amountCents:10000,note:'First gift'},{firstName:'Bob',lastName:'Example',email:'bob@example.test',date:'2026-09-16',amountCents:20000,note:''}];
it('allocates gross to donors, preserves net and original payer, supports three donors and undo',async()=>{
 const f=await setup();const first=await saveSplit(f.env,'split-test',{revision:0,parentVersion:'now',allocations:rows},'admin');
 expect(first.allocations).toHaveLength(2);expect(first.parent.amount).toBe(291);expect(first.parent.name).toBe('Transfer agent');
 expect(f.sqlite.prepare('SELECT SUM(charitable_amount) AS total,COUNT(*) AS n FROM donation_gifts').get()).toMatchObject({total:300,n:2});
 expect(f.sqlite.prepare("SELECT SUM(charitable_amount) AS total FROM donation_gifts WHERE transaction_date<'2026-01-01'").get()).toMatchObject({total:100});
 expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM ledger_entries').get()?.n).toBe(1);
 const third=await saveSplit(f.env,'split-test',{revision:1,parentVersion:'now',allocations:[rows[0],{...rows[1],amountCents:15000},{...rows[0],firstName:'Carol',email:'carol@example.test',amountCents:5000}]},'admin');expect(third.allocations).toHaveLength(3);
 const undo=await saveSplit(f.env,'split-test',{revision:2,parentVersion:'now',allocations:[]},'admin');expect(undo.history).toHaveLength(3);expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM donation_gifts').get()?.n).toBe(1);
});
it('rejects incorrect totals, negatives, fractional cents, invalid dates and stale saves without creating donors',async()=>{
 const f=await setup();for(const bad of [[rows[0]],[rows[0],{...rows[1],amountCents:1}],[{...rows[0],amountCents:-1},rows[1]],[{...rows[0],amountCents:0.1},rows[1]],[{...rows[0],date:'2026-02-30'},rows[1]]])await expect(saveSplit(f.env,'split-test',{revision:0,parentVersion:'now',allocations:bad},'admin')).rejects.toMatchObject({status:422});
 expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM donation_splits').get()?.n).toBe(0);
 await saveSplit(f.env,'split-test',{revision:0,parentVersion:'now',allocations:rows},'admin');
 await expect(saveSplit(f.env,'split-test',{revision:0,parentVersion:'now',allocations:rows},'admin')).rejects.toMatchObject({status:409});
 expect(()=>f.sqlite.exec("UPDATE ledger_entries SET charitable_amount=500 WHERE id='split-test'")).toThrow();
});
it('requires authenticated finance and contact permissions, CSRF, and the internal service secret',async()=>{
 const f=await setup();const p='/admin/ledger/entries/split-test/donor-splits';
 expect((await handleLedgerAdminRequest(new Request('http://localhost'+p),f.env,p)).status).toBe(401);
 const req=f.request(p,{revision:0,parentVersion:'now',allocations:rows},'PUT');req.headers.delete('x-csrf-token');expect((await handleLedgerAdminRequest(req,f.env,p)).status).toBe(403);
 expect((await internalDonationSplits(new Request('http://localhost/internal/donation-splits',{method:'POST'}),f.env)).status).toBe(401);
 expect((await splitSnapshot(f.env,'split-test')).revision).toBe(0);
});
import {currentGivingSummary,handleCsmDelivery,handleCsmAdminRequest} from '../src/csm-distribution';
it('carries allocations through inbox approval and lets CSM edit the same approved split',async()=>{
 const f=await ministryFixture();fixtures.push(f);f.env.CSM_DISTRIBUTION_SECRET='test-secret';
 const message={schemaVersion:1,messageId:'split-message',idempotencyKey:'HopeSojourns:SPLIT:T0006:1',sourceRevision:1,sentAt:'2026-09-17T12:00:00.000Z',destination:'HopeSojourns',product:'HopeSojourns',displayName:'Transfer Agent',masterDonorId:'master-transfer',party:{role:'donor',displayName:'Transfer Agent',email:'transfer@example.test',phone:null,address:null},transaction:{sourceRecordId:'SPLIT:T0006',paypalTransactionId:'SPLIT',paypalReferenceId:null,eventCode:'T0006',eventDate:'2026-09-17T12:00:00.000Z',status:'Completed',direction:'received',currency:'USD',gross:300,fee:-9,net:291,itemName:'Hope Sojourns Donation',itemId:'HopeSojourns'},donorAllocations:rows,donorSplitRevision:1};
 const delivery=await handleCsmDelivery(new Request('http://localhost/internal/csm-distribution',{method:'POST',headers:{'Content-Type':'application/json','X-CSM-Distribution-Secret':'test-secret'},body:JSON.stringify(message)}),f.env);
 expect(delivery.status).toBe(202);
 const inbox=f.sqlite.prepare('SELECT id FROM csm_distribution_inbox').get()!;
 const path=`/admin/csm-inbox/${inbox.id}/approve`;
 const approved=await handleCsmAdminRequest(f.request(path,{donor:{firstName:'Transfer',lastName:'Agent',email:'transfer@example.test'}}),f.env,path);
 expect(await approved.json()).toMatchObject({success:true,status:'approved'});
 expect(f.sqlite.prepare('SELECT COUNT(*) AS n,SUM(amount) AS total FROM ledger_entries').get()).toMatchObject({n:1,total:291});
 expect(f.sqlite.prepare('SELECT COUNT(*) AS n,SUM(charitable_amount) AS total FROM donation_gifts').get()).toMatchObject({n:2,total:300});
 const givingSummary=await currentGivingSummary(f.env,new Date('2026-09-18T00:00:00.000Z'));
 expect(givingSummary).toEqual({year:2026,grossReceived:300,netReceived:291,donations:1,givers:1});
 const call=(body:unknown)=>internalDonationSplits(new Request('http://localhost/internal/donation-splits',{method:'POST',headers:{'Content-Type':'application/json','X-CSM-Distribution-Secret':'test-secret'},body:JSON.stringify(body)}),f.env);
 const result=await (await call({sourceIds:['SPLIT:T0006']})).json() as any;
 const snapshot=result.snapshots['SPLIT:T0006'];expect(snapshot.revision).toBe(1);
 const edit=await call({sourceIds:['SPLIT:T0006'],operation:'save',revision:1,parentVersion:snapshot.parent.updated_at,allocations:[{...rows[0],amountCents:12000},{...rows[1],amountCents:18000}],actor:'CSM test administrator'});
 expect(edit.status).toBe(200);
 expect(f.sqlite.prepare('SELECT SUM(charitable_amount) AS total FROM donation_gifts').get()?.total).toBe(300);
 expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM donation_split_history').get()?.n).toBe(2);
});

it('supports 100 allocations atomically and requires both finance and donor edit access',async()=>{
 const f=await setup();const allocations=Array.from({length:100},(_,i)=>({...rows[0],firstName:'Donor '+i,email:`donor${i}@example.test`,amountCents:300}));
 await saveSplit(f.env,'split-test',{revision:0,parentVersion:'now',allocations},'admin');
 expect(f.sqlite.prepare('SELECT COUNT(*) AS n,SUM(charitable_amount) AS total FROM donation_gifts').get()).toMatchObject({n:100,total:300});
 f.sqlite.exec("INSERT INTO mmt_users(id,username,first_name,last_name,email,must_change_password,permissions_json,registered_at,updated_at) VALUES('limited','limited','Limited','User','limited@example.test',0,'{}','now','now'); UPDATE admin_sessions SET user_id='limited'");
 const path='/admin/ledger/entries/split-test/donor-splits';
 for(const permissions of [{finances:'edit',contacts:'blocked'},{finances:'read',contacts:'edit'},{finances:'edit',contacts:'read'}]){
  f.sqlite.prepare("UPDATE mmt_users SET permissions_json=? WHERE id='limited'").run(JSON.stringify(permissions));
  expect((await handleLedgerAdminRequest(f.request(path,{revision:1,parentVersion:'now',allocations:[]},'PUT'),f.env,path)).status).toBe(403);
 }
 f.sqlite.prepare("UPDATE mmt_users SET permissions_json=? WHERE id='limited'").run(JSON.stringify({finances:'read',contacts:'read'}));
 expect((await handleLedgerAdminRequest(f.request(path),f.env,path)).status).toBe(200);
 expect((await splitSnapshot(f.env,'split-test')).revision).toBe(1);
});
