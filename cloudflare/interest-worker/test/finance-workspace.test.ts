import {afterEach,describe,expect,it} from 'vitest';
import {ministryFixture} from './ministry-fixture';
import {handleFinanceAdminRequest} from '../src/finance-admin';
import {handleLedgerAdminRequest} from '../src/ledger-admin';

const fixtures:Awaited<ReturnType<typeof ministryFixture>>[]=[];
async function setup(){const f=await ministryFixture();fixtures.push(f);const call=(path:string,body?:unknown,method?:string)=>handleFinanceAdminRequest(f.request('/admin/finance/'+path,body,method),f.env,'/admin/finance/'+path.split('?')[0]);return {...f,call};}
afterEach(()=>{for(const f of fixtures.splice(0))f.sqlite.close();});
const mileage={travel_date:'2026-09-17',origin:'Office',destination:'Board meeting',purpose:'Board meeting',miles:21.5,tolls:3.25};
const invoice={number:'HS-001',issued_date:'2026-09-17',due_date:'2026-10-01',bill_to:'Sample sponsor',status:'issued',lines:[{description:'Ministry support',quantity:2,unit_amount:100}]};
async function income(f:Awaited<ReturnType<typeof setup>>,amount=50){const response=await handleLedgerAdminRequest(f.request('/admin/ledger/entries',{transactionDate:'2026-09-17',entryType:'income',paymentType:'Check',budgetCategory:'General',amount,name:'Sample sponsor',transactionPurpose:'other',charitableAmount:0}),f.env,'/admin/ledger/entries');expect(response.status).toBe(201);return (await response.json() as {entryId:string}).entryId;}

describe('HS bookkeeping extensions',()=>{
  it('requires authentication and CSRF before accessing or changing financial records',async()=>{
    const f=await setup();expect((await handleFinanceAdminRequest(new Request('http://localhost/api/interest/admin/finance/bootstrap'),f.env,'/admin/finance/bootstrap')).status).toBe(401);
    const request=f.request('/admin/finance/mileage',mileage);request.headers.delete('x-csrf-token');expect((await handleFinanceAdminRequest(request,f.env,'/admin/finance/mileage')).status).toBe(403);
  });
  it('logs organization-wide mileage without a trip, ministry, or cash ledger entry',async()=>{
    const f=await setup();expect((await f.call('mileage',mileage)).status).toBe(200);
    const data=await (await f.call('mileage')).json() as any;expect(data.entries[0]).toMatchObject({trip_id:null,ministry_id:null,miles:21.5,rate:null});expect(data.summary.missing_rates).toBe(1);
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM ledger_entries').get()).toMatchObject({n:0});
  });
  it('uses effective rates, rejects overlaps and invalid dates, and retains trashed logs',async()=>{
    const f=await setup();await f.call('mileage',mileage);expect((await f.call('rates',{label:'Approved HS rate',effective_from:'2026-01-01',effective_to:'2026-12-31',rate:.5})).status).toBe(200);
    expect((await f.call('rates',{label:'Overlap',effective_from:'2026-12-31',effective_to:'2027-01-01',rate:.7})).status).toBe(409);
    expect((await f.call('mileage',{...mileage,travel_date:'2026-02-30'})).status).toBe(422);
    const data=await (await f.call('mileage')).json() as any;expect(data.entries[0].mileage_value).toBe(10.75);
    const id=data.entries[0].id;await f.call('mileage/'+id,{},'DELETE');expect((await (await f.call('mileage')).json() as any).summary.count).toBe(0);
    await f.call('mileage/'+id,{},'PATCH');expect((await (await f.call('mileage')).json() as any).summary.count).toBe(1);
  });
  it('creates mileage batches atomically and rejects duplicate dates and broken trip links',async()=>{
    const f=await setup();expect((await f.call('mileage',{...mileage,dates:['2026-09-17','2026-09-18']})).status).toBe(200);
    expect((await f.call('mileage',{...mileage,dates:['2026-09-17','2026-09-17']})).status).toBe(422);
    expect((await f.call('mileage',{...mileage,trip_id:crypto.randomUUID()})).status).toBe(422);
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n,COUNT(DISTINCT batch_id) AS batches FROM finance_mileage').get()).toMatchObject({n:2,batches:1});
  });
  it('links installment payments once without duplicating or rewriting existing ledger data',async()=>{
    const f=await setup(),ledgerId=await income(f),before=f.sqlite.prepare('SELECT * FROM ledger_entries WHERE id=?').get(ledgerId);
    const created=await (await f.call('invoices',invoice)).json() as any;const body={ledger_id:ledgerId,operationId:crypto.randomUUID()};
    expect((await f.call('invoices/'+created.id+'/payments',body)).status).toBe(200);expect((await f.call('invoices/'+created.id+'/payments',body)).status).toBe(200);
    expect(f.sqlite.prepare('SELECT * FROM ledger_entries WHERE id=?').get(ledgerId)).toEqual(before);expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM ledger_entries').get()).toMatchObject({n:1});
    expect((await (await f.call('invoices')).json() as any).entries[0].paid_cents).toBe(5000);
    expect((await f.call('invoices/'+created.id+'/payments',{...body,operationId:crypto.randomUUID()})).status).toBe(409);
    expect((await f.call('invoices/'+created.id,{...invoice,lines:[{description:'Changed',quantity:1,unit_amount:400}]},'PUT')).status).toBe(409);
    expect(()=>f.sqlite.prepare('UPDATE ledger_entries SET amount=60 WHERE id=?').run(ledgerId)).toThrow();expect(()=>f.sqlite.prepare('DELETE FROM ledger_entries WHERE id=?').run(ledgerId)).toThrow();
  });
  it('rejects overpayments and draft payments, rolling back the application and audit together',async()=>{
    const f=await setup(),ledgerId=await income(f,300),created=await (await f.call('invoices',invoice)).json() as any;
    expect((await f.call('invoices/'+created.id+'/payments',{ledger_id:ledgerId,operationId:crypto.randomUUID()})).status).toBe(409);
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM finance_invoice_payments').get()).toMatchObject({n:0});
    const draft=await (await f.call('invoices',{...invoice,number:'HS-002',status:'draft'})).json() as any;const small=await income(f,20);
    expect((await f.call('invoices/'+draft.id+'/payments',{ledger_id:small,operationId:crypto.randomUUID()})).status).toBe(409);
  });
  it('corrects a mistaken invoice match without deleting income',async()=>{
    const f=await setup(),ledgerId=await income(f,50),created=await (await f.call('invoices',invoice)).json() as any,operationId=crypto.randomUUID();
    await f.call('invoices/'+created.id+'/payments',{ledger_id:ledgerId,operationId});
    expect((await f.call('invoices/'+created.id+'/payments/'+operationId,{},'DELETE')).status).toBe(200);
    expect(f.sqlite.prepare('SELECT amount FROM ledger_entries WHERE id=?').get(ledgerId)).toMatchObject({amount:50});
    expect((await (await f.call('invoices')).json() as any).entries[0].paid_cents).toBe(0);
  });
  it('keeps review flags separate from source ledger data and report filters accurate',async()=>{
    const f=await setup(),id=await income(f),before=f.sqlite.prepare('SELECT * FROM ledger_entries WHERE id=?').get(id);
    expect((await f.call('review/'+id,{status:'excluded',accountant_review:true,notes:'Review later'},'PUT')).status).toBe(200);
    expect(f.sqlite.prepare('SELECT * FROM ledger_entries WHERE id=?').get(id)).toEqual(before);
    expect((await (await f.call('records?status=included')).json() as any).summary.income).toBe(0);
  });
  it('reports gross gifts and net cash without counting internal transfers as income or expenses',async()=>{
    const f=await setup(),now='2026-09-17T12:00:00.000Z';
    f.sqlite.prepare(`INSERT INTO ledger_entries
      (id,source_type,import_key,content_fingerprint,transaction_date,entry_type,payment_type,expense_category,budget_category,
       amount,name,transaction_purpose,charitable_amount,currency,accounting_class,gross,fee,net,created_at,updated_at)
      VALUES('gift','manual','gift','gift','2026-09-17','income','PayPal',NULL,'General',97.52,'Example Donor','donation',100,'USD','operating',100,-2.48,97.52,?,?)`).run(now,now);
    f.sqlite.prepare(`INSERT INTO ledger_entries
      (id,source_type,import_key,content_fingerprint,transaction_date,entry_type,payment_type,expense_category,budget_category,
       amount,name,transaction_purpose,charitable_amount,currency,accounting_class,gross,fee,net,created_at,updated_at)
      VALUES('bank-transfer','manual','bank-transfer','bank-transfer','2026-09-17','expense','PayPal','Internal transfer','Balance transfer',323.89,'CSM bank','general',0,'USD','internal_transfer',-323.89,0,-323.89,?,?)`).run(now,now);
    const data=await (await f.call('records?from=2026-01-01&to=2026-12-31')).json() as any;
    expect(data.summary).toMatchObject({count:1,gross_giving:100,income:97.52,expenses:0});
    expect(data.entries.map((entry:any)=>entry.id)).toEqual(['gift']);
  });
  it('requires a planned trip for expense purpose and preserves historical links after completion',async()=>{
    const f=await setup(),id=await income(f);
    f.sqlite.prepare("UPDATE ledger_entries SET entry_type='expense',charitable_amount=0 WHERE id=?").run(id);
    for(const status of ['draft','canceled','archived','completed'])f.sqlite.prepare("INSERT INTO trips(id,code,slug,title,location,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").run(status,status,status,status,'Test',status,'2026','2026');
    const review={status:'included',expense_purpose:'trip'};
    for(const trip_id of ['', 'missing', 'canceled','archived','completed'])expect((await f.call('review/'+id,{...review,trip_id},'PUT')).status).toBe(422);
    expect((await f.call('review/'+id,{...review,trip_id:'draft'},'PUT')).status).toBe(200);
    f.sqlite.prepare("UPDATE trips SET status='completed' WHERE id='draft'").run();
    expect((await f.call('review/'+id,{...review,trip_id:'draft',notes:'Historical receipt review'},'PUT')).status).toBe(200);
    expect((await f.call('review/'+id,{status:'included',expense_purpose:'operations',trip_id:'draft'},'PUT')).status).toBe(422);
  });
  it('defaults only newly inserted ordinary expenses and filters purpose totals',async()=>{
    const f=await setup();
    const response=await handleLedgerAdminRequest(f.request('/admin/ledger/entries',{transactionDate:'2026-09-24',entryType:'expense',paymentType:'Check',expenseCategory:'Office Supply',budgetCategory:'General',amount:250,name:'Printer',transactionPurpose:'general',charitableAmount:0}),f.env,'/admin/ledger/entries');
    expect(response.status).toBe(201);const id=(await response.json() as any).entryId;
    expect((await (await f.call('records?purpose=operations')).json() as any).summary.expenses).toBe(250);
    expect((await f.call('review/'+id,{status:'included',expense_purpose:'outreach',reimbursable:true,reimbursed:true},'PUT')).status).toBe(200);
    const result=await (await f.call('records?purpose=outreach')).json() as any;
    expect(result.entries[0]).toMatchObject({expense_purpose:'outreach',reimbursable:1,reimbursed:1});
    expect((await (await f.call('records?purpose=operations')).json() as any).summary.count).toBe(0);
    await income(f,100);
    expect((await (await f.call('records?purpose=unclassified')).json() as any).summary.count).toBe(0);
  });
  it('reclassifies expenses as transfers without deleting source, receipts or review flags; rejects stale retries and income',async()=>{
    const f=await setup(),id=await income(f),gift=await income(f,100);
    f.sqlite.prepare("UPDATE ledger_entries SET entry_type='expense',charitable_amount=0 WHERE id=?").run(id);
    await f.call('review/'+id,{status:'included',expense_purpose:'operations',reimbursable:true,notes:'Keep this review'},'PUT');
    const row=(await (await f.call('records?type=expense')).json() as any).entries[0];
    const body={confirm:true,reason:'Transfer of existing funds',updated_at:row.updated_at,review_updated_at:row.review_updated_at};
    expect((await f.call('review/'+id+'/transfer',{...body,confirm:false})).status).toBe(422);
    expect((await f.call('review/'+id+'/transfer',{...body,updated_at:'stale'})).status).toBe(409);
    expect((await f.call('review/'+id+'/transfer',body)).status).toBe(200);
    expect((await f.call('review/'+id+'/transfer',body)).status).toBe(409);
    expect(f.sqlite.prepare('SELECT accounting_class,amount FROM ledger_entries WHERE id=?').get(id)).toMatchObject({accounting_class:'internal_transfer',amount:50});
    expect(f.sqlite.prepare('SELECT reimbursable,notes FROM finance_review WHERE ledger_id=?').get(id)).toMatchObject({reimbursable:1,notes:'Keep this review'});
    const result=await (await f.call('records')).json() as any;expect(result.summary).toMatchObject({income:100,expenses:0,count:1});
    expect(f.sqlite.prepare("SELECT count(*) AS n FROM audit_events WHERE event_type='reclassified_as_transfer'").get()).toMatchObject({n:1});
    expect((await f.call('review/'+gift+'/transfer',{...body,updated_at:result.entries[0].updated_at,review_updated_at:null})).status).toBe(409);
    expect((await f.call('review/'+id,{status:'included',updated_at:row.updated_at,review_updated_at:row.review_updated_at},'PUT')).status).toBe(409);
  });
  it('does not silently classify old expenses when applying the migration',async()=>{
    const f=await ministryFixture('0037_gift_thanks.sql');fixtures.push(f);
    f.sqlite.exec("INSERT INTO ledger_entries(id,source_type,import_key,content_fingerprint,transaction_date,entry_type,payment_type,budget_category,amount,created_at,updated_at) VALUES('old','manual','old','old','2026-01-01','expense','Check','General',10,'2026','2026')");
    const {readFileSync}=await import('node:fs');
    f.sqlite.exec(readFileSync(new URL('../migrations/0038_expense_purpose.sql',import.meta.url),'utf8'));
    expect(f.sqlite.prepare('SELECT count(*) AS n FROM finance_review').get()).toMatchObject({n:0});
    expect(f.sqlite.prepare("SELECT amount,entry_type FROM ledger_entries WHERE id='old'").get()).toMatchObject({amount:10,entry_type:'expense'});
  });
  it('requires finance edit access and CSRF for transfer corrections',async()=>{
    const f=await setup(),id=await income(f);const path='/admin/finance/review/'+id+'/transfer';
    const request=f.request(path,{confirm:true,reason:'Transfer'});request.headers.delete('x-csrf-token');
    expect((await handleFinanceAdminRequest(request,f.env,path)).status).toBe(403);
    f.sqlite.exec(`INSERT INTO mmt_users(id,username,first_name,last_name,email,is_org_admin,is_admin,password_hash,registered_at,updated_at) VALUES('other-admin','other-admin','Other','Admin','admin@example.test',1,1,'configured','2026','2026');UPDATE mmt_users SET is_admin=0,is_org_admin=0,permissions_json='{"finances":"read"}' WHERE id='primary'`);
    expect((await f.call('review/'+id+'/transfer',{confirm:true,reason:'Transfer'})).status).toBe(403);
  });

});
