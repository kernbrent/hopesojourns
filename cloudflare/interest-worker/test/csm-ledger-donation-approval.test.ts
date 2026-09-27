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

  const response = await handleCsmDelivery(delivery(ledgerDonation(crypto.randomUUID())), fixture.env);
  expect(response.status).toBe(202);
  const inbox = await response.json() as { inboxId: string; status: string };
  expect(inbox.status).toBe("needs_match");
  const listPath = "/admin/csm-inbox";
  const list = await handleCsmAdminRequest(fixture.request(listPath), fixture.env, listPath);
  const listBody = await list.json() as { messages: { candidates: { id: string }[] }[] };
  expect(listBody.messages[0]?.candidates.map(person => person.id)).toContain(existingId);

  const approvalPath = `/admin/csm-inbox/${inbox.inboxId}/approve`;
  const approval = await handleCsmAdminRequest(fixture.request(approvalPath, {
    donor: { firstName: "Brent", lastName: "Kern", email: "brent@example.test", phone: null },
  }), fixture.env, approvalPath);
  expect(approval.status).toBe(200);
  const result = await approval.json() as { personId: string; createdPerson: boolean };
  expect(result.personId).toBe(existingId);
  expect(result.createdPerson).toBe(false);
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
    donor: { firstName: "Brent", lastName: "Kern", email: "brent@example.test" },
  }), fixture.env, path);
  expect(response.status).toBe(409);
  expect((await response.json() as { code: string }).code).toBe("DONOR_CHOICE_REQUIRED");
  expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM financial_transactions").get()).toEqual({ count: 0 });
  const chosen = await handleCsmAdminRequest(fixture.request(path, { personId: personIds[0] }), fixture.env, path);
  expect(chosen.status).toBe(200);
  expect((await chosen.json() as { personId: string }).personId).toBe(personIds[0]);
});

it("still creates a new donor when no existing identity matches", async () => {
  const fixture = await ministryFixture();
  Object.assign(fixture.env, { CSM_DISTRIBUTION_SECRET: "test-secret", ENVIRONMENT: "test" });
  const inbox = await (await handleCsmDelivery(delivery(ledgerDonation(crypto.randomUUID())), fixture.env)).json() as { inboxId: string };
  const path = `/admin/csm-inbox/${inbox.inboxId}/approve`;
  const response = await handleCsmAdminRequest(fixture.request(path, {
    donor: { firstName: "Brent", lastName: "Kern", email: "brent@example.test" },
  }), fixture.env, path);
  expect(response.status).toBe(200);
  expect((await response.json() as { createdPerson: boolean }).createdPerson).toBe(true);
  expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM people").get()).toEqual({ count: 1 });
  expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM financial_transactions").get()).toEqual({ count: 1 });
});
