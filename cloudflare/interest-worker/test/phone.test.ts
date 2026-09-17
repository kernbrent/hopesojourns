import {afterEach,expect,it} from 'vitest';
import {storedPhone,matchPhone} from '../src/phone';
import {ministryFixture} from './ministry-fixture';
const fixtures:Awaited<ReturnType<typeof ministryFixture>>[]=[];
afterEach(()=>fixtures.splice(0).forEach(f=>f.sqlite.close()));
it('stores US numbers as 10 digits without truncating international numbers or extensions',()=>{
 expect(storedPhone('+1 (972) 555-0123')).toBe('9725550123');expect(matchPhone('972-555-0123')).toBe('9725550123');
 expect(storedPhone('+44 20 7946 0958')).toBe('+44 20 7946 0958');expect(storedPhone('972-555-0123 ext 42')).toBe('972-555-0123 ext 42');
 expect(storedPhone('123456789','US')).toBe('123456789');expect(storedPhone('212 555 0199','France')).toBe('212 555 0199');
});
it('normalizes future database writes and match keys, preserving foreign numbers',async()=>{
 const f=await ministryFixture();fixtures.push(f);
 const sql="INSERT INTO people(id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,phone,phone_normalized,country,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)";
 f.sqlite.prepare(sql).run('us','Test','Person','test','person','test@example.test','test@example.test','+1 (972) 555-0123','19725550123','US','now','now');
 expect(f.sqlite.prepare("SELECT phone,phone_normalized FROM people WHERE id='us'").get()).toMatchObject({phone:'9725550123',phone_normalized:'9725550123'});
 f.sqlite.prepare("UPDATE people SET phone='+44 20 7946 0958',country='UK' WHERE id='us'").run();expect(f.sqlite.prepare("SELECT phone FROM people WHERE id='us'").get()).toMatchObject({phone:'+44 20 7946 0958'});
});
