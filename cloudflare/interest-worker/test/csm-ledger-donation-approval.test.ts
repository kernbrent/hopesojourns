import { expect, it } from "vitest";
import { ministryFixture } from "./ministry-fixture";
import { handleCsmAdminRequest, handleCsmDelivery } from "../src/csm-distribution";

function ledgerDonation(incomeId: string, email: string | null = null) {
  return {
    schemaVersion: 1, messageId: crypto.randomUUID(),
    idempotencyKey: `HopeSojourns:ledger-income:${incomeId}`, sourceRevision: 1,
    sentAt: "2026-09-27T05:00:00.000Z", destination: "HopeSojourns", product: "HopeSojourns",
    displayName: "Brent Kern", masterDonorId: `ledger-income:${incomeId}`,
    party: { role: "donor", displayName: "Brent Kern", email, phone: null, address: null },
    transaction: {
      sourceRecordId: `ledger-income:${incomeId}`, paypalTransactionId: incomeId,
      paypalReferenceId: null, eventCode: "LEDGER_DONATION", eventDate: "2026-09-26T12:00:00.000Z",
      status: "Completed", direction: "received", currency: "USD", gross: 500, fee: 0, net: 500,
      itemName: "Holy Day Offering", itemId: null,
    },
    ledgerIncome: { incomeId, paymentMethod: "Check", paymentReference: "3580" },
  };
}

function delivery(message: unknown) {
  return new Request("https://csm.internal/internal/csm-distribution", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSM-Distribution-Secret": "test-secret" },
    body: JSON.stringify(message),
  });
}

it("links a direct-bank gift without a source email to an existing HS donor exactly once", async () => {
  const fixture = await ministryFixture();
  Object.assign(fixture.env, { CSM_DISTRIBUTION_SECRET: "test-secret", ENVIRONMENT: "test" });
  const existingId = crypto.randomUUID();
  fixture.sqlite.prepare(`INSERT INTO people
    (id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    existingId, "Brent", "Kern", "brent", "kern", "brent@example.test", "brent@example.test", "2026", "2026",
  );

  fixture.sqlite.prepare("INSERT INTO contact_types VALUES(?,'potential_donor','2026'),(?,'volunteer','2026'),(?,'traveler','2026')").run(existingId,existingId,existingId);
  const types=()=>fixture.sqlite.prepare('SELECT contact_type FROM contact_types WHERE person_id=? ORDER BY contact_type').all(existingId).map(row=>row.contact_type);
  const response = await handleCsmDelivery(delivery(ledgerDonation(crypto.randomUUID())), fixture.env);
  expect(response.status).toBe(202);
  const inbox = await response.json() as { inboxId: string; status: string };
  expect(inbox.status).toBe("needs_match");
  expect(types()).toEqual(["potential_donor","traveler","volunteer"]);
  const listPath = "/admin/csm-inbox";
  const list = await handleCsmAdminRequest(fixture.request(listPath), fixture.env, listPath);
  const listBody = await list.json() as { messages: { candidates: { id: string }[] }[] };
  expect(listBody.messages[0]?.candidates.map(person => person.id)).toContain(existingId);

  const approvalPath = `/admin/csm-inbox/${inbox.inboxId}/approve`;
  const approval = await handleCsmAdminRequest(fixture.request(approvalPath, {
    confirmDonor: true, donor: { firstName: "Brent", lastName: "Kern", email: "brent@example.test", phone: null },
  }), fixture.env, approvalPath);
  expect(approval.status).toBe(200);
  const result = await approval.json() as { personId: string; createdPerson: boolean };
  expect(result.personId).toBe(existingId);
  expect(result.createdPerson).toBe(false);
  expect(types()).toEqual(["donor","traveler","volunteer"]);
  expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM people").get()).toEqual({ count: 1 });
  expect(fixture.sqlite.prepare("SELECT person_id, amount, charitable_amount, payment_type FROM ledger_entries WHERE source_type='csm'").get())
    .toEqual({ person_id: existingId, amount: 500, charitable_amount: 500, payment_type: "Check" });
  expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM financial_transactions").get()).toEqual({ count: 1 });
  expect((await handleCsmAdminRequest(fixture.request(approvalPath, { personId: existingId }), fixture.env, approvalPath)).status).toBe(200);
  expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM financial_transactions").get()).toEqual({ count: 1 });
});

it("requires a choice when multiple HS contacts share the submitted identity", async () => {
  const fixture = await ministryFixture();
  Object.assign(fixture.env, { CSM_DISTRIBUTION_SECRET: "test-secret", ENVIRONMENT: "test" });
  const personIds: string[] = [];
  for (const approvedDuplicate of [0, 1]) {
    const personId = crypto.randomUUID();
    personIds.push(personId);
    fixture.sqlite.prepare(`INSERT INTO people
      (id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,approved_duplicate,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      personId, "Brent", "Kern", "brent", "kern", "brent@example.test", "brent@example.test",
      approvedDuplicate, "2026", "2026",
    );
  }
  const inbox = await (await handleCsmDelivery(delivery(ledgerDonation(crypto.randomUUID())), fixture.env)).json() as { inboxId: string };
  const path = `/admin/csm-inbox/${inbox.inboxId}/approve`;
  const response = await handleCsmAdminRequest(fixture.request(path, {
    confirmDonor: true, donor: { firstName: "Brent", lastName: "Kern", email: "brent@example.test" },
  }), fixture.env, path);
  expect(response.status).toBe(409);
  expect((await response.json() as { code: string }).code).toBe("DONOR_CHOICE_REQUIRED");
  expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM financial_transactions").get()).toEqual({ count: 0 });
  const chosen = await handleCsmAdminRequest(fixture.request(path, { personId: personIds[0], confirmDonor: true }), fixture.env, path);
  expect(chosen.status).toBe(200);
  expect((await chosen.json() as { personId: string }).personId).toBe(personIds[0]);
});

it("still creates a new donor when no existing identity matches", async () => {
  const fixture = await ministryFixture();
  Object.assign(fixture.env, { CSM_DISTRIBUTION_SECRET: "test-secret", ENVIRONMENT: "test" });
  const inbox = await (await handleCsmDelivery(delivery(ledgerDonation(crypto.randomUUID())), fixture.env)).json() as { inboxId: string };
  const path = `/admin/csm-inbox/${inbox.inboxId}/approve`;
  const response = await handleCsmAdminRequest(fixture.request(path, {
    confirmDonor: true, donor: { firstName: "Brent", lastName: "Kern", email: "brent@example.test" },
  }), fixture.env, path);
  expect(response.status).toBe(200);
  const created=await response.json() as { createdPerson:boolean; personId:string };
  expect(created.createdPerson).toBe(true);
  expect(fixture.sqlite.prepare("SELECT contact_type FROM contact_types WHERE person_id=?").all(created.personId)).toEqual([{contact_type:'donor'}]);
  expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM people").get()).toEqual({ count: 1 });
  expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM financial_transactions").get()).toEqual({ count: 1 });
});

it('requires individual review for shared email, different names and stale saved matches',async()=>{
 const f=await ministryFixture();Object.assign(f.env,{CSM_DISTRIBUTION_SECRET:'test-secret',ENVIRONMENT:'test'});
 const id=crypto.randomUUID();
 f.sqlite.prepare("INSERT INTO people(id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,created_at,updated_at) VALUES(?,'Brent','Kern','brent','kern','family@example.test','family@example.test','now','now')").run(id);
 const m=ledgerDonation(crypto.randomUUID(),'family@example.test');
 const first=await (await handleCsmDelivery(delivery(m),f.env)).json() as any;
 expect(first.status).toBe('pending');
 f.sqlite.prepare("INSERT INTO csm_donor_links(master_donor_id,person_id,created_from_inbox_id,created_at,updated_at) VALUES(?,?,?, 'now','now')").run(m.masterDonorId,id,first.inboxId);
 f.sqlite.prepare('UPDATE people SET email_shared=1 WHERE id=?').run(id);
 const path=`/admin/csm-inbox/${first.inboxId}/approve`;
 expect((await handleCsmAdminRequest(f.request(path,{personId:id}),f.env,path)).status).toBe(409);
 const list=await (await handleCsmAdminRequest(f.request('/admin/csm-inbox'),f.env,'/admin/csm-inbox')).json() as any;
 expect(list.messages[0]).toMatchObject({requiresDonorReview:true,matchedPerson:null,status:'needs_match'});
 expect(f.sqlite.prepare('SELECT COUNT(*) n FROM ledger_entries').get()?.n).toBe(0);
 expect((await handleCsmAdminRequest(f.request(path,{personId:id,confirmDonor:true}),f.env,path)).status).toBe(200);
 f.sqlite.prepare('UPDATE people SET email_shared=0 WHERE id=?').run(id);
 const spouse=ledgerDonation(crypto.randomUUID(),'family@example.test');spouse.displayName='Jane Kern';spouse.party.displayName='Jane Kern';f.sqlite.prepare("INSERT INTO csm_donor_links(master_donor_id,person_id,created_from_inbox_id,created_at,updated_at) VALUES(?,?,?,'now','now')").run(spouse.masterDonorId,id,first.inboxId);
 expect((await (await handleCsmDelivery(delivery(spouse),f.env)).json() as any).status).toBe('needs_match');
 f.sqlite.prepare("INSERT INTO people(id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,created_at,updated_at) VALUES(?,'Jane','Kern','jane','kern','family@example.test','family@example.test','now','now')").run(crypto.randomUUID());
 expect((await (await handleCsmDelivery(delivery(ledgerDonation(crypto.randomUUID(),'family@example.test')),f.env)).json() as any).status).toBe('needs_match');
 f.sqlite.close();
});
