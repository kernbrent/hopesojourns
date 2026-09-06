const loading = document.querySelector("#trip-account-loading");
const errorPanel = document.querySelector("#trip-account-error");
const statement = document.querySelector("#trip-account-statement");
function node(tag, className, text) { const item = document.createElement(tag); if (className) item.className = className; if (text !== undefined) item.textContent = String(text); return item; }
function money(value) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0)); }
function dateLabel(value) { if (!value) return "No date"; return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`)); }
function titleCase(value) { return String(value || "").replace(/_/g, " ").replace(/\b\w/g, character => character.toUpperCase()); }
function metric(label, value) { const card = node("article"); card.append(node("span", "", label), node("strong", "", value)); return card; }
function row(title, detail, amount) { const item = node("article", "trip-account-row"); const copy = node("div"); copy.append(node("h3", "", title), node("p", "", detail)); item.append(copy, node("strong", "", amount)); return item; }
function renderList(selector, items, mapper, emptyMessage) { const list = document.querySelector(selector); list.replaceChildren(); items.forEach(item => list.append(mapper(item))); if (!items.length) list.append(row(emptyMessage, "", "—")); }
function render(data) {
  loading.hidden = true; statement.hidden = false;
  document.querySelector("#trip-account-code").textContent = data.account.trip_code;
  document.querySelector("#trip-account-name").textContent = data.account.name;
  document.querySelector("#trip-account-trip").textContent = `${data.account.trip_title} · ${data.account.location}${data.account.start_date ? ` · ${dateLabel(data.account.start_date)}` : ""}`;
  document.title = `${data.account.name} | Trip Account`;
  document.querySelector("#trip-account-summary").replaceChildren(metric("Charges", money(data.summary.charges)), metric("Payments", money(data.summary.payments)), metric("Support credits", money(data.summary.awards)), metric("Balance", money(data.summary.balance)));
  renderList("#trip-account-charges", data.charges, item => row(item.title, `${dateLabel(item.due_date)} · ${titleCase(item.status)} · ${money(item.applied_total)} applied`, money(item.amount)), "No charges have been added.");
  renderList("#trip-account-payments", data.payments, item => row(`${titleCase(item.payment_method)} payment`, `${dateLabel(item.transaction_date)} · ${titleCase(item.status)}${item.external_reference ? ` · ${item.external_reference}` : ""}`, money(item.amount)), "No payments have been recorded.");
  renderList("#trip-account-awards", data.awards, item => row(titleCase(item.award_type), `${dateLabel(item.award_date)} · ${item.funding_source_name}${item.reason ? ` · ${item.reason}` : ""}`, money(item.amount)), "No scholarships or support credits have been added.");
  renderList("#trip-account-requests", data.paymentRequests, item => row(item.title, `${dateLabel(item.due_date)} · ${titleCase(item.status)} · Online PayPal/Venmo payment will be enabled after ChristianSteps integration.`, money(item.amount_requested)), "No open payment requests.");
}
async function load() { const token = new URLSearchParams(location.search).get("access") || ""; if (!token) { loading.hidden = true; errorPanel.hidden = false; return; } try { const response = await fetch(`/api/interest/private-account/${encodeURIComponent(token)}`, { headers: { Accept: "application/json" }, credentials: "omit", referrerPolicy: "no-referrer" }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Ask your Hope Sojourns leader for a new private link."); render(result); } catch (error) { loading.hidden = true; errorPanel.hidden = false; document.querySelector("#trip-account-error-message").textContent = error.message; } }
document.querySelector("#trip-account-print").addEventListener("click", () => window.print());
load();
