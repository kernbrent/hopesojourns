import {afterEach,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {ministryFixture} from './ministry-fixture';
const fixtures:Awaited<ReturnType<typeof ministryFixture>>[]=[];
it('enrolls eligible contacts only, applies named/country/email exclusions, and preserves other roles',async()=>{
 const f=await ministryFixture('0062_newsletter_contact_type.sql');fixtures.push(f);
 const cases=[
  ['USA reader','Ordinary','Reader','USA','usa@example.test',true],
  ['US reader','Another','Reader','United States','us@example.test',true],
  ['US abbreviation','US','Reader','US','us2@example.test',true],
  ['US full name','Full','Reader','United States of America','full@example.test',true],
  ['unknown country','Unknown','Reader','','unknown@example.test',true],
  ['foreign','Foreign','Reader','Greece','foreign@example.test',false],
  ['missing email','Missing','Email','USA','',false],
  ['whitespace email','Blank','Email','USA',' \t\r\n ',false],
  ['Ahrmad','Ahrmad','Unknown','USA','a@example.test',false],
  ['Ahmad variant','Ahmad','Unknown','USA','a2@example.test',false],
  ['James unknown','James','???','USA','j1@example.test',false],
  ['James Bryant','James','Bryant','','j2@example.test',true],
  ['Moises','Moises','Unknown','USA','m@example.test',false],
  ['Nassus','Nassus','Unknown','USA','n@example.test',false],
  ['Nassos variant','Nassos','Unknown','USA','n2@example.test',false],
  ['Artur','Artur','Cipllaka','USA','artur@example.test',false],
  ['Dimitris','Dimitris','Kontopoulos','USA','d@example.test',false],
  ['another Artur','Artur','Different','USA','other-artur@example.test',true],
 ] as const;
 for(const [id,first,last,country,email] of cases){
  f.sqlite.prepare('INSERT INTO people(id,first_name,last_name,first_name_normalized,last_name_normalized,country,email,email_normalized,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,first,last,first.toLowerCase(),last.toLowerCase(),country,email,email.toLowerCase(),'original','original');
  f.sqlite.prepare("INSERT INTO contact_types VALUES(?,'volunteer','original')").run(id);
 }
 // An excluded person explicitly loses only Newsletter, not their other categories.
 f.sqlite.prepare("INSERT INTO contact_types VALUES('foreign','newsletter','original')").run();
 f.sqlite.exec('BEGIN;'+readFileSync(new URL('../migrations/0063_initial_newsletter_enrollment.sql',import.meta.url),'utf8')+'COMMIT;');
 for(const [id,,,,,eligible] of cases){
  const types=f.sqlite.prepare('SELECT contact_type FROM contact_types WHERE person_id=?').all(id).map(x=>x.contact_type);
  expect(types.includes('newsletter'),id).toBe(eligible);expect(types,id).toContain('volunteer');
 }
 const events=f.sqlite.prepare("SELECT metadata_json FROM audit_events WHERE event_type='newsletter_initial_enrollment'").all();
 expect(events).toHaveLength(cases.filter(x=>x[5]).length+1);
 expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
 expect(f.sqlite.prepare("SELECT name FROM sqlite_master WHERE name='newsletter_release_audience'").get()).toBeUndefined();
 // Future edits stay manual: removing a category does not automatically re-enroll anyone.
 f.sqlite.prepare("DELETE FROM contact_types WHERE person_id='USA reader' AND contact_type='newsletter'").run();
 expect(f.sqlite.prepare("SELECT 1 FROM contact_types WHERE person_id='USA reader' AND contact_type='newsletter'").get()).toBeUndefined();
});
afterEach(()=>fixtures.splice(0).forEach(f=>f.sqlite.close()));
