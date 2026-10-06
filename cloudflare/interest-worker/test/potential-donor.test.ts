import { afterEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ministryFixture } from './ministry-fixture';
import { handleAdminRequest } from '../src/admin';
import { parseContactImportFile, validateContactImportRow } from '../src/contact-import';
const fixtures: Awaited<ReturnType<typeof ministryFixture>>[]=[];
afterEach(()=>fixtures.splice(0).forEach(f=>f.sqlite.close()));
it('accepts the display label and stored value in spreadsheet imports',()=>{
 for(const label of ['Potential Donor','potential_donor']){
  const csv='First Name,Last Name,Email,Cell Phone,Contact Types\nPotential,Supporter,potential@example.test,,'+label;
  const parsed=parseContactImportFile('contacts.csv',new TextEncoder().encode(csv));
  const result=validateContactImportRow(parsed.rows[0],[]);
  expect(result.errors).toEqual([]);expect(result.input?.contactTypes).toEqual(['potential_donor']);
 }
});
it('preserves lifetime and split donors, other roles, and uncertain income while auditing zero-giving changes',async()=>{
 const f=await ministryFixture('0041_itinerary_categories.sql');fixtures.push(f);
 const person=(id:string)=>{
  f.sqlite.prepare("INSERT INTO people(id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,created_at,updated_at) VALUES(?,?, 'Example',?,'example',?,?,'2020','2020')").run(id,id,id,id+'@example.test',id+'@example.test');
  f.sqlite.prepare("INSERT INTO contact_types VALUES(?,'donor','2020')").run(id);
 };
 for(const id of ['never','old','split','income','unlinked'])person(id);
 f.sqlite.exec("INSERT INTO contact_types VALUES('never','volunteer','2020')");
 const gift=(id:string,owner:string|null,charitable:number,name:string|null=null)=>f.sqlite.prepare("INSERT INTO ledger_entries(id,source_type,import_key,content_fingerprint,transaction_date,entry_type,payment_type,budget_category,amount,person_id,charitable_amount,name,created_at,updated_at) VALUES(?,'manual',?,'test','2015-01-01','income','Check','Donations',100,?,?,?,'2020','2020')").run(id,id,owner,charitable,name);
 gift('old-gift','old',100);gift('split-gift','old',100);gift('income-gift','income',0);gift('unlinked-gift',null,100,'unlinked Example');
 f.sqlite.prepare("INSERT INTO donation_splits VALUES('split-gift',1,?,'2020','test')").run(JSON.stringify([{personId:'old',date:'2015-01-01',amountCents:5000},{personId:'split',date:'2015-01-01',amountCents:5000}]));
 f.sqlite.exec('BEGIN;'+readFileSync(new URL('../migrations/0042_potential_donor.sql',import.meta.url),'utf8')+'COMMIT;');
 const types=(id:string)=>f.sqlite.prepare('SELECT contact_type FROM contact_types WHERE person_id=? ORDER BY contact_type').all(id).map(x=>x.contact_type);
 expect(types('never')).toEqual(['potential_donor','volunteer']);
 for(const id of ['old','split','income','unlinked'])expect(types(id)).toEqual(['donor']);
 expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE event_type='contact_type_reclassified'").get()?.n).toBe(1);
 expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
 expect(()=>f.sqlite.exec("INSERT INTO contact_types VALUES('never','unknown','2020')")).toThrow();
});
it('accepts the new type through contact creation and filtering',async()=>{
 const f=await ministryFixture();fixtures.push(f);
 const create=await handleAdminRequest(f.request('/admin/people',{firstName:'Potential',lastName:'Supporter',email:'potential@example.test',contactTypes:['potential_donor','volunteer']}),f.env,'/admin/people');
 expect(create?.status).toBe(201);
 const list=await handleAdminRequest(f.request('/admin/people?contactType=potential_donor'),f.env,'/admin/people');
 expect(list?.status).toBe(200);
 const body=await list!.json() as any;
 expect(body.people.some((p:any)=>p.contactTypes.includes('potential_donor'))).toBe(true);
});


it('promotes saved gifts and later donor matching, but not transfers, expenses or non-gift income',async()=>{
 const f=await ministryFixture();fixtures.push(f);
 const person=(id:string)=>{
  f.sqlite.prepare("INSERT INTO people(id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,created_at,updated_at) VALUES(?,?,'Example',?,'example',?,?,'2020','2020')").run(id,id,id,id+'@example.test',id+'@example.test');
  f.sqlite.prepare("INSERT INTO contact_types VALUES(?,'potential_donor','2020'),(?,'leader','2020')").run(id,id);
 };
 for(const id of ['gift','later','expense','transfer','income','rollback'])person(id);
 const gift=(id:string,owner:string|null,type:string,charitable:number)=>f.sqlite.prepare("INSERT INTO ledger_entries(id,source_type,import_key,content_fingerprint,transaction_date,entry_type,payment_type,budget_category,amount,person_id,charitable_amount,created_at,updated_at) VALUES(?,'manual',?,'test','2026-10-06',?,'Check','General',100,?,?,'2026','2026')").run(id,id,type,owner,charitable);
 const types=(id:string)=>f.sqlite.prepare('SELECT contact_type FROM contact_types WHERE person_id=? ORDER BY contact_type').all(id).map(x=>x.contact_type);
 gift('gift1','gift','income',100);
 expect(types('gift')).toEqual(['donor','leader']);
 const created=f.sqlite.prepare("SELECT created_at FROM contact_types WHERE person_id='gift' AND contact_type='donor'").get();
 gift('gift2','gift','income',50);
 expect(f.sqlite.prepare("SELECT created_at FROM contact_types WHERE person_id='gift' AND contact_type='donor'").get()).toEqual(created);
 gift('unmatched',null,'income',100);
 expect(types('later')).toEqual(['leader','potential_donor']);
 f.sqlite.exec("UPDATE ledger_entries SET person_id='later' WHERE id='unmatched'");
 expect(types('later')).toEqual(['donor','leader']);
 gift('expense1','expense','expense',100);gift('transfer1','transfer','income',0);gift('income1','income','income',0);
 f.sqlite.exec("UPDATE ledger_entries SET accounting_class='internal_transfer',charitable_amount=100 WHERE id='transfer1'");
 for(const id of ['expense','transfer','income'])expect(types(id)).toEqual(['leader','potential_donor']);
 f.sqlite.exec("UPDATE ledger_entries SET charitable_amount=100 WHERE id='income1'");
 expect(types('income')).toEqual(['donor','leader']);
 f.sqlite.exec('BEGIN');gift('rollback1','rollback','income',100);f.sqlite.exec('ROLLBACK');
 expect(types('rollback')).toEqual(['leader','potential_donor']);
});
