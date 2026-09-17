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
});
