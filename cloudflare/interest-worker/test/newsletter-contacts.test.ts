import {afterEach, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {ministryFixture} from './ministry-fixture';
import {handleAdminRequest} from '../src/admin';
import {parseContactImportFile,validateContactImportRow} from '../src/contact-import';
const fixtures:Awaited<ReturnType<typeof ministryFixture>>[]=[];
afterEach(()=>fixtures.splice(0).forEach(f=>f.sqlite.close()));
it('preserves contact assignments, managed access, and every trigger across the category migration',async()=>{
 const f=await ministryFixture('0061_contact_emails.sql');fixtures.push(f);
 const id=crypto.randomUUID();
 f.sqlite.prepare("INSERT INTO people(id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,created_at,updated_at) VALUES(?,'News','Reader','news','reader','news@example.test','news@example.test','now','now')").run(id);
 f.sqlite.prepare("UPDATE mmt_users SET hs_person_id=? WHERE id='primary'").run(id);
 f.sqlite.prepare("INSERT INTO contact_types VALUES(?,'volunteer','original'),(?,'donor','original')").run(id,id);
 const before=f.sqlite.prepare('SELECT * FROM contact_types ORDER BY person_id,contact_type').all();
 const normalize=(rows:Record<string,unknown>[])=>rows.map(row=>({...row,sql:String(row.sql).replace(/\r\n/g,'\n')}));
 const triggers=normalize(f.sqlite.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all());
 f.sqlite.exec('BEGIN;'+readFileSync(new URL('../migrations/0062_newsletter_contact_type.sql',import.meta.url),'utf8')+'COMMIT;');
 expect(f.sqlite.prepare('SELECT * FROM contact_types ORDER BY person_id,contact_type').all()).toEqual(before);
 expect(normalize(f.sqlite.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all())).toEqual(triggers);
 expect(f.sqlite.prepare("SELECT volunteer_access FROM mmt_users WHERE id='primary'").get()?.volunteer_access).toBe(1);
 expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM contact_types WHERE contact_type='newsletter'").get()?.n).toBe(0);
 f.sqlite.prepare("INSERT INTO contact_types VALUES(?,'newsletter','now')").run(id);
 expect(()=>f.sqlite.prepare("INSERT INTO contact_types VALUES(?,'invalid','now')").run(id)).toThrow();
 f.sqlite.prepare("DELETE FROM contact_types WHERE person_id=? AND contact_type='volunteer'").run(id);
 expect(f.sqlite.prepare("SELECT volunteer_access FROM mmt_users WHERE id='primary'").get()?.volunteer_access).toBe(0);
 expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});
it('creates Newsletter contacts and filters the list without including other contacts',async()=>{
 const f=await ministryFixture();fixtures.push(f);
 const path='/admin/people';
 for(const [firstName,contactTypes] of [['Subscriber',['newsletter','volunteer']],['Other',['other']]] as const){
  const response=await handleAdminRequest(f.request(path,{firstName,lastName:'Example',email:firstName.toLowerCase()+'@example.test',contactTypes,areas:[],languages:[],tripIds:[]}),f.env,path);
  expect(response.status).toBe(201);
 }
 const response=await handleAdminRequest(f.request(path+'?contactType=newsletter'),f.env,path);
 expect(response.status).toBe(200);
 const data=await response.json() as {people:{firstName:string,contactTypes:string[]}[]};
 expect(data.people).toHaveLength(1);expect(data.people[0]).toMatchObject({firstName:'Subscriber',contactTypes:expect.arrayContaining(['newsletter','volunteer'])});
});
it('accepts Newsletter alongside other contact categories on spreadsheet import',()=>{
 const csv='First Name,Last Name,Email,Cell Phone,Contact Types\nNews,Reader,news@example.test,,Newsletter; Volunteer';
 const parsed=parseContactImportFile('contacts.csv',new TextEncoder().encode(csv));
 const result=validateContactImportRow(parsed.rows[0],[]);
 expect(result.errors).toEqual([]);expect(result.input?.contactTypes).toEqual(['newsletter','volunteer']);
});
