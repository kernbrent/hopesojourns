"use strict";

const API_BASE = "/api/interest";
const form = document.querySelector("#annual-summary-form");
const personSelect = document.querySelector("#annual-person");
const yearSelect = document.querySelector("#annual-year");
const status = document.querySelector("#annual-summary-status");
const signIn = document.querySelector("#annual-summary-signin");
const statement = document.querySelector("#annual-statement");
const printButton = document.querySelector("#print-summary");

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

function dateLabel(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function titleCase(value) {
  return String(value || "").replaceAll("_", " ").replace(/\b\w/g, character => character.toUpperCase());
}

async function api(path) {
  const response = await fetch(`${API_BASE}${path}`, { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
  let result = {};
  try { result = await response.json(); } catch { result = {}; }
  if (!response.ok) {
    const error = new Error(result.error || "The summary could not be loaded.");
    error.status = response.status;
    throw error;
  }
  return result;
}

function table(rows, kind) {
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "annual-empty";
    empty.textContent = kind === "giving" ? "No charitable contributions are recorded for this year." : "No travel or administrative payments are recorded for this year.";
    return empty;
  }
  const element = document.createElement("table");
  const heading = document.createElement("tr");
  ["Date", "Description", "Method", kind === "giving" ? "Designation" : "Route", "Amount"].forEach(label => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    heading.append(th);
  });
  const head = document.createElement("thead");
  head.append(heading);
  const body = document.createElement("tbody");
  rows.forEach(item => {
    const row = document.createElement("tr");
    const description = item.trip_title ? `${item.trip_title}${item.trip_code ? ` (${item.trip_code})` : ""}` : titleCase(item.transaction_purpose);
    const values = [
      dateLabel(item.transaction_date),
      description,
      item.payment_type || item.payment_method || "Not specified",
      kind === "giving" ? item.budget_category || "General" : item.settlement_route === "external" ? "Settled externally" : "Received by Hope Sojourns",
      money(item.amount),
    ];
    values.forEach(value => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    body.append(row);
  });
  element.append(head, body);
  return element;
}

function recipientAddress(person) {
  return [person.address_line_1, person.address_line_2, [person.city, person.region, person.postal_code].filter(Boolean).join(", ").replace(/, ([^,]+)$/, " $1"), person.country].filter(Boolean).join("\n");
}

function renderSummary(result) {
  const person = result.person;
  document.querySelector("#annual-statement-year").textContent = `${result.year} statement year`;
  document.querySelector("#annual-recipient-name").textContent = `${person.first_name} ${person.last_name}`;
  document.querySelector("#annual-recipient-address").textContent = recipientAddress(person);
  document.querySelector("#annual-recipient-contact").textContent = [person.email, person.phone].filter(Boolean).join(" · ");
  document.querySelector("#annual-giving-total").textContent = money(result.totals.charitable);
  document.querySelector("#annual-payments-total").textContent = money(result.totals.otherPayments);
  document.querySelector("#annual-giving-table").replaceChildren(table(result.contributions || [], "giving"));
  document.querySelector("#annual-payment-table").replaceChildren(table(result.payments || [], "payment"));
  document.querySelector("#annual-payment-totals").replaceChildren(
    Object.assign(document.createElement("span"), { textContent: `Received by HS: ${money(result.totals.paymentsReceivedByHs)}` }),
    Object.assign(document.createElement("span"), { textContent: `Settled externally: ${money(result.totals.paymentsSettledExternally)}` }),
  );
  document.querySelector("#annual-disclaimer").textContent = result.disclaimer;
  statement.hidden = false;
  printButton.disabled = false;
  document.title = `${result.year} Summary - ${person.first_name} ${person.last_name} | Hope Sojourns`;
}

async function loadContacts() {
  const contacts = [];
  let page = 1;
  let pages = 1;
  do {
    const result = await api(`/admin/people?page=${page}&pageSize=50&sort=name_asc`);
    contacts.push(...(result.people || []));
    pages = Number(result.pagination?.pages || 1);
    page += 1;
  } while (page <= pages);
  personSelect.replaceChildren(Object.assign(document.createElement("option"), { value: "", textContent: "Choose a contact" }));
  contacts.forEach(person => personSelect.append(Object.assign(document.createElement("option"), {
    value: person.id,
    textContent: `${person.firstName} ${person.lastName}${person.email ? ` · ${person.email}` : ""}`,
  })));
  const requested = new URLSearchParams(location.search).get("personId");
  if (requested && [...personSelect.options].some(option => option.value === requested)) personSelect.value = requested;
}

async function start() {
  const current = new Date().getFullYear();
  for (let year = current; year >= 2020; year -= 1) yearSelect.append(Object.assign(document.createElement("option"), { value: String(year), textContent: String(year) }));
  const requestedYear = new URLSearchParams(location.search).get("year");
  if (requestedYear && [...yearSelect.options].some(option => option.value === requestedYear)) yearSelect.value = requestedYear;
  try {
    await loadContacts();
    status.textContent = "Choose a contact and year.";
    if (personSelect.value) form.requestSubmit();
  } catch (error) {
    status.textContent = error.message;
    signIn.hidden = error.status !== 401;
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  statement.hidden = true;
  printButton.disabled = true;
  status.textContent = "Creating summary…";
  signIn.hidden = true;
  try {
    const params = new URLSearchParams(new FormData(form));
    const result = await api(`/admin/trip-platform/annual-summary?${params}`);
    renderSummary(result);
    history.replaceState({}, "", `${location.pathname}?${params}`);
    status.textContent = "Summary ready. Review it, then print or save it as a PDF.";
  } catch (error) {
    status.textContent = error.message;
    signIn.hidden = error.status !== 401;
  }
});

printButton.addEventListener("click", () => window.print());
start();
