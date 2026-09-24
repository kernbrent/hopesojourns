import { afterEach, expect, it } from 'vitest';
import { ministryFixture } from './ministry-fixture';
import { contactGiving } from '../src/contact-giving';
import { handleAdminRequest } from '../src/admin';

const fixtures: Awaited<ReturnType<typeof ministryFixture>>[] = [];
afterEach(() => fixtures.splice(0).forEach(f => f.sqlite.close()));
async function setup() {
  const f = await ministryFixture(); fixtures.push(f);
  const personId = crypto.randomUUID(), otherId = crypto.randomUUID();
  for (const id of [personId, otherId]) f.sqlite.prepare(`INSERT INTO people
    (id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,created_at,updated_at)
    VALUES(?,'Test','Donor','test','donor',?,?,'2026','2026')`).run(id, id+'@example.test', id+'@example.test');
  function gift(id: string, date: string, amount = 100, owner: string | null = personId, type = 'income', charitable = amount) {
    f.sqlite.prepare(`INSERT INTO ledger_entries(id,source_type,import_key,content_fingerprint,transaction_date,
      entry_type,payment_type,budget_category,amount,person_id,charitable_amount,created_at,updated_at)
      VALUES(?,'manual',?,'test',?,?,'Check','Donations',?,?,?,'2026','2026')`)
      .run(id,id,date,type,amount,owner,charitable);
  }
  return {...f, personId, otherId, gift};
}

it('includes the entire rolling window, excludes unrelated and noncharitable payments, and totals before fees', async () => {
  const f = await setup();
  f.gift('start', '2024-09-23', 97, f.personId, 'income', 100);
  f.gift('today', '2026-09-23', 0.25);
  f.gift('old', '2024-09-22'); f.gift('future', '2026-09-24');
  f.gift('other', '2026-09-23', 500, f.otherId); f.gift('unlinked', '2026-09-23', 500, null);
  f.gift('expense', '2026-09-23', 20, f.personId, 'expense', 0);
  f.gift('trip-payment', '2026-09-23', 200, f.personId, 'income', 0);
  const result = await contactGiving(f.env, f.personId, new Date('2026-09-24T01:00:00Z'));
  expect(result).toMatchObject({startDate:'2024-09-23', endDate:'2026-09-23', total:100.25});
  expect(result.gifts.map(g => g.id)).toEqual(['today', 'start']);
});

it('uses original split gift dates and donor shares without also counting the parent', async () => {
  const f = await setup(); f.gift('split', '2026-09-23', 300);
  const allocations = [
    {personId:f.personId, date:'2024-09-23', amountCents:10000, note:'My share'},
    {personId:f.otherId, date:'2026-09-23', amountCents:20000, note:'Other share'},
  ];
  f.sqlite.prepare("INSERT INTO donation_splits VALUES('split',1,?,'2026','test')").run(JSON.stringify(allocations));
  const result = await contactGiving(f.env, f.personId, new Date('2026-09-23T12:00:00Z'));
  expect(result.total).toBe(100); expect(result.gifts).toHaveLength(1);
  expect(result.gifts[0]).toMatchObject({date:'2024-09-23', amount:100, note:'My share'});
});

it('handles empty giving and leap-day boundaries', async () => {
  const f = await setup();
  expect(await contactGiving(f.env, f.personId, new Date('2028-02-29T12:00:00Z')))
    .toMatchObject({startDate:'2026-02-28', endDate:'2028-02-29', total:0, gifts:[]});
});

it('exposes giving only to authenticated contact viewers who also have finance access', async () => {
  const f = await setup(), path = '/admin/people/'+f.personId;
  expect((await handleAdminRequest(new Request('http://localhost'+path), f.env, path)).status).toBe(401);
  let response = await handleAdminRequest(f.request(path), f.env, path);
  expect(response.status).toBe(200);
  expect((await response.json() as {person:{giving:unknown}}).person.giving).not.toBeNull();
  f.sqlite.exec(`INSERT INTO mmt_users(id,username,first_name,last_name,email,is_org_admin,is_admin,password_hash,registered_at,updated_at)
    VALUES('other-admin','other-admin','Other','Admin','admin@example.test',1,1,'configured','2026','2026');
    UPDATE mmt_users SET is_org_admin=0,is_admin=0,permissions_json='{"contacts":"read"}' WHERE id='primary'`);
  response = await handleAdminRequest(f.request(path), f.env, path);
  expect(response.status).toBe(200);
  expect((await response.json() as {person:{giving:unknown}}).person.giving).toBeNull();
  f.sqlite.exec(`UPDATE mmt_users SET permissions_json='{"contacts":"read","finances":"read"}' WHERE id='primary'`);
  response = await handleAdminRequest(f.request(path), f.env, path);
  expect((await response.json() as {person:{giving:unknown}}).person.giving).not.toBeNull();
});
