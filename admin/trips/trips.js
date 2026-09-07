const API_BASE = "/api/interest";
const ADMIN_NAVIGATION_SESSION_KEY = "hope-sojourns-admin-navigation";
const TRIP_GUIDED_HELP_KEY = "hope-sojourns-trip-guided-help";
const ADMIN_SIDEBAR_KEY = "hope-sojourns-admin-sidebar-collapsed";

const state = {
  csrfToken: "",
  bootstrap: null,
  workspace: null,
  tripId: null,
  activeTab: "overview",
  accountLinks: new Map(),
  guidedHelp: true,
  guideSteps: [],
  guideAlertTimer: null,
  importPreview: null,
  budgetItemsExpanded: false,
};

const loginPanel = document.querySelector("#trip-admin-login");
const authLoading = document.querySelector("#trip-auth-loading");
const app = document.querySelector("#trip-admin-app");
const pageStatus = document.querySelector("#trip-page-status");
const tripListPanel = document.querySelector("#trip-list-panel");
const tripWorkspace = document.querySelector("#trip-workspace");
const tripDialog = document.querySelector("#trip-dialog");
const importDialog = document.querySelector("#trip-import-dialog");

function preventDialogBackdropDismissal() {
  document.querySelectorAll("dialog").forEach(dialog => dialog.setAttribute("closedby", "closerequest"));
  document.addEventListener("click", event => {
    if (!(event.target instanceof HTMLDialogElement) || !event.target.open) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}

function markAdminNavigation() {
  try { sessionStorage.setItem(ADMIN_NAVIGATION_SESSION_KEY, "true"); } catch { /* Storage is optional. */ }
}

const FIELD_HELP = {
  "trip-budget-plan-form": {
    payingTravelerCount: ["Paying travelers", "Enter only travelers whose payments fund the per-traveler budget. Leaders or scholarship recipients whose costs are covered should not be counted as paying travelers."],
  },
  "trip-cost-form": {
    categoryId: ["Category", "Choose where this expense belongs. Categories make trip and organization-wide financial summaries useful."],
    description: ["Description", "Name the specific item being purchased or funded so another administrator can understand the budget later."],
    expenseScope: ["Scope", "Identify whether the cost belongs to the whole trip, a group, or one individual. This describes responsibility and reporting; the Calculation field controls multiplication."],
    accountId: ["Related account", "Optionally connect the cost to a traveler, family, group, church, or sponsor account when the expense should appear in that account's financial history."],
    calculationMethod: ["Calculation", "Use Per paying traveler for an individual cost multiplied across the paying team, Fixed for a one-time total, or Percentage for the HS Leadership/Admin fee categories."],
    percentageRate: ["Percentage rate", "Enter the fee percent, such as 10 for 10%. It is applied to the individual base expenses before any percentage fees, so fees never compound on each other."],
    quantity: ["Quantity", "Enter how many units one traveler or the fixed purchase needs—for example, 7 meal days or 2 hotel nights."],
    estimatedUnitCost: ["Estimated each", "Enter the estimated price of one unit. Per-traveler rows multiply quantity × this amount × paying travelers."],
    estimatedTotal: ["Estimated total", "This is the planned total for the row. It is calculated automatically for per-traveler and percentage rows; fixed rows may be entered directly."],
    actualTotal: ["Actual total", "Enter what was truly paid or committed once known. Actuals let Hope Sojourns compare the plan with the final trip cost."],
    vendorName: ["Vendor or payee", "Enter the airline, hotel, ministry, person, or company receiving the money for reconciliation and future reference."],
    vendorMinistryId: ["Vendor organization", "Connect the payee to an organization record when one exists. This keeps partner history and trip costs tied together."],
    settlementRoute: ["Money route", "Choose Paid through HS when Hope Sojourns receives or pays the money. Choose Paid externally when a church or partner settles it without the money entering HS."],
    paymentStatus: ["Status", "Track whether the cost is only planned, committed, partially paid, paid, or canceled. Status keeps forecasts separate from completed spending."],
    paymentMethod: ["Payment method", "Record how the expense was paid—for example check, card, ACH, or partner settlement—to support reconciliation."],
    externalReference: ["Reference", "Store a confirmation, check number, invoice number, or other non-sensitive identifier that helps locate supporting records."],
    dueDate: ["Due date", "Enter when payment is expected so upcoming obligations are visible before they become urgent."],
    paidDate: ["Paid date", "Enter the actual payment date. It is required when an HS-routed cost is marked Paid because that cost enters the organization expense ledger."],
    notes: ["Notes", "Capture assumptions, restrictions, quotes, or context that does not fit another field. Never include card or bank details."],
  },
  "trip-allocation-form": {
    costItemId: ["Cost item", "Choose the expense whose funding responsibility you are assigning."],
    fundingSourceId: ["Funding source", "Choose who is expected to cover this amount, such as the traveler, Hope Sojourns, a church, sponsor, grant, or external partner."],
    amount: ["Amount", "Enter the portion assigned to this source. Multiple allocations may divide one cost among several sources."],
    status: ["Status", "Use Planned for an expectation, Confirmed for an agreed commitment, Paid when settled, or Canceled when it no longer applies."],
    notes: ["Notes", "Explain special funding arrangements, restrictions, or who confirmed the commitment."],
  },
  "trip-account-form": {
    name: ["Account name", "Use a recognizable traveler, family, group, church, or sponsor name. Every charge, credit, payment, and private statement rolls up here."],
    accountType: ["Account type", "Choose who owns the financial responsibility. The type determines whether a person or organization connection is required."],
    personId: ["Person", "Connect an individual account to the matching People record so statements and annual summaries identify the correct traveler."],
    ministryId: ["Organization", "Connect organization accounts to the matching church or ministry record."],
    billingEmail: ["Billing email", "Enter the address that should receive balance notices and statements for this account."],
    financialAccess: ["Financial access", "Private link allows a personal statement page, Email only limits delivery to messages, and Disabled prevents traveler-facing financial access."],
    status: ["Status", "Keep current accounts Active. Close finished accounts or cancel ones that should no longer be used."],
  },
  "trip-charge-form": {
    accountId: ["Account", "Choose who is expected to pay this charge."],
    title: ["Title", "Use a friendly label the traveler or payer will understand on a statement."],
    purpose: ["Purpose", "Classify the amount as trip payment, administrative fee, or other so statements remain clear."],
    amount: ["Amount", "Enter the amount currently owed. Use separate charges for installments with different due dates."],
    dueDate: ["Due date", "Set the expected payment date for reminders and payment-plan status."],
    notes: ["Notes", "Record internal context or special payment-plan instructions."],
  },
  "trip-award-form": {
    accountId: ["Account", "Choose the account receiving this support or credit."],
    fundingSourceId: ["Funding source", "Identify the fund, church, sponsor, grant, or other source covering the traveler's cost."],
    awardType: ["Type", "Distinguish leader support, scholarship, sponsor credit, fee waiver, or another form of coverage."],
    amount: ["Amount", "Enter the approved amount that reduces what this account owes without recording a traveler payment."],
    awardDate: ["Date", "Record when the support decision became effective for reporting and audit history."],
    reason: ["Reason", "Briefly document why the support was granted and any restrictions."],
  },
  "trip-payment-form": {
    accountId: ["Account", "Choose the account whose balance this payment should affect. Leave blank only for trip income not owned by one account."],
    fundingSourceId: ["Funding source", "Optionally identify who supplied the money, especially for church, sponsor, grant, or external-partner payments."],
    purpose: ["Purpose", "Distinguish travel payments, administrative fees, donations, scholarship contributions, refunds, and other money for accurate statements and giving records."],
    amount: ["Amount", "Enter the full amount received or externally settled."],
    paymentMethod: ["Payment method", "Record how the money moved, such as check, PayPal, Venmo, ACH, or external settlement."],
    settlementRoute: ["Money route", "Received by HS means the funds entered Hope Sojourns. Settled externally means a partner paid outside HS and the entry is informational."],
    transactionDate: ["Date", "Use the date the money was received or the outside settlement was confirmed."],
    externalReference: ["Reference", "Enter a check number, processor ID, or other non-sensitive reconciliation reference."],
    payerName: ["Payer name", "Record the individual or organization that actually supplied the money when it differs from the account name."],
    charitableAmount: ["Charitable portion", "Enter only the part eligible to be shown as a donation. Travel and service payments remain clearly separate on giving letters."],
    chargeId: ["Apply to charge", "Optionally match the payment to a specific installment or fee so that charge's remaining balance updates."],
    notes: ["Notes", "Capture reconciliation details or special context without including card or bank data."],
  },
  "trip-request-form": {
    accountId: ["Account", "Choose who will receive this balance notice."],
    title: ["Title", "Use a friendly description such as Second trip payment or Remaining balance."],
    amountRequested: ["Amount", "Enter the amount you are asking the account to pay now; this notice does not create another charge."],
    dueDate: ["Due date", "Tell the recipient when this requested payment should arrive."],
    message: ["Message", "Add a warm explanation, payment instructions, or contact information for questions."],
  },
};

function closeFieldHelp(except = null) {
  document.querySelectorAll(".trip-field-help-popover").forEach(popover => {
    if (popover === except) return;
    popover.hidden = true;
    popover.parentElement?.querySelector(".trip-field-help-trigger")?.setAttribute("aria-expanded", "false");
  });
}

function initializeFieldHelp() {
  Object.entries(FIELD_HELP).forEach(([formId, fields]) => {
    const form = document.getElementById(formId);
    if (!form) return;
    Object.entries(fields).forEach(([fieldName, [title, copy]]) => {
      const field = form.elements.namedItem(fieldName);
      const label = field?.closest("label");
      const heading = label?.querySelector(":scope > span");
      if (!field || !label || !heading || heading.querySelector(".trip-field-help-trigger")) return;
      heading.classList.add("trip-field-heading");
      const popoverId = `trip-help-${formId}-${fieldName}`;
      const button = node("button", "trip-field-help-trigger", "?");
      button.type = "button";
      button.setAttribute("aria-label", `Help for ${title}`);
      button.setAttribute("aria-controls", popoverId);
      button.setAttribute("aria-expanded", "false");
      const popover = node("span", "trip-field-help-popover");
      popover.id = popoverId;
      popover.hidden = true;
      popover.setAttribute("role", "note");
      popover.append(node("strong", "", title), node("span", "", copy));
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        const opening = popover.hidden;
        closeFieldHelp(opening ? popover : null);
        popover.hidden = !opening;
        button.setAttribute("aria-expanded", String(opening));
      });
      heading.append(button, popover);
    });
  });
  document.addEventListener("click", event => {
    const openPopover = [...document.querySelectorAll(".trip-field-help-popover")].find(popover => !popover.hidden);
    if (!openPopover) return;
    const trigger = openPopover.parentElement?.querySelector(".trip-field-help-trigger");
    if (!openPopover.contains(event.target) && !trigger?.contains(event.target)) closeFieldHelp();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeFieldHelp();
  });
}

function loadSidebarPreference() {
  try { return localStorage.getItem(ADMIN_SIDEBAR_KEY) === "true"; } catch { return false; }
}

function setSidebarCollapsed(collapsed) {
  document.body.classList.toggle("trip-sidebar-collapsed", collapsed);
  const toggle = document.querySelector("#trip-sidebar-toggle");
  toggle.setAttribute("aria-expanded", String(!collapsed));
  toggle.querySelector("[data-sidebar-toggle-label]").textContent = collapsed ? "Show menu" : "Hide menu";
  try { localStorage.setItem(ADMIN_SIDEBAR_KEY, String(collapsed)); } catch { /* Storage is optional. */ }
}

function initializeSidebar() {
  setSidebarCollapsed(loadSidebarPreference());
  document.querySelector("#trip-sidebar-toggle").addEventListener("click", () => {
    setSidebarCollapsed(!document.body.classList.contains("trip-sidebar-collapsed"));
  });
}

function resetPasswordVisibility(container) {
  container.querySelectorAll("[data-password-toggle]").forEach(button => {
    const input = document.querySelector(`#${button.getAttribute("aria-controls")}`);
    if (!input) return;
    input.type = "password";
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", button.getAttribute("aria-label").replace(/^Hide /, "Show "));
  });
}

function initializePasswordToggles() {
  document.querySelectorAll("[data-password-toggle]").forEach(button => {
    button.addEventListener("click", () => {
      const input = document.querySelector(`#${button.getAttribute("aria-controls")}`);
      if (!input || input.disabled) return;
      const revealing = input.type === "password";
      input.type = revealing ? "text" : "password";
      button.setAttribute("aria-pressed", String(revealing));
      button.setAttribute("aria-label", button.getAttribute("aria-label").replace(revealing ? /^Show / : /^Hide /, revealing ? "Hide " : "Show "));
      input.focus();
    });
  });
}

function showGuideAlert(message) {
  const alert = document.querySelector("#trip-guide-alert");
  alert.querySelector("span").textContent = message;
  alert.hidden = false;
  if (state.guideAlertTimer) window.clearTimeout(state.guideAlertTimer);
  state.guideAlertTimer = window.setTimeout(() => { alert.hidden = true; }, 6_000);
}

preventDialogBackdropDismissal();
document.querySelectorAll("[data-admin-navigation]").forEach(link => {
  link.addEventListener("click", markAdminNavigation);
});

function loadGuidedHelpPreference() {
  try { return localStorage.getItem(TRIP_GUIDED_HELP_KEY) !== "false"; } catch { return true; }
}

function setGuidedHelp(enabled) {
  state.guidedHelp = enabled;
  document.querySelector("#trip-guide-toggle").checked = enabled;
  try { localStorage.setItem(TRIP_GUIDED_HELP_KEY, String(enabled)); } catch { /* Storage is optional. */ }
  renderSetupGuide();
}

function initializeGuidedHelp() {
  const toggle = document.querySelector("#trip-guide-toggle");
  state.guidedHelp = loadGuidedHelpPreference();
  toggle.checked = state.guidedHelp;
  toggle.addEventListener("change", () => setGuidedHelp(toggle.checked));
  document.querySelector("#trip-guide-hide").addEventListener("click", () => setGuidedHelp(false));
  document.querySelector("#trip-guide-next").addEventListener("click", openNextGuideStep);
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

function dateLabel(value) {
  if (!value) return "Not set";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatDate(value) {
  if (!value) return "Not set";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

function dateRange(start, end) {
  if (!start && !end) return "Dates not set";
  if (!end || start === end) return dateLabel(start || end);
  return `${dateLabel(start)} – ${dateLabel(end)}`;
}

function titleCase(value) {
  return String(value || "").replace(/_/g, " ").replace(/\b\w/g, character => character.toUpperCase());
}

function setStatus(element, message, status = "") {
  if (!element) return;
  element.textContent = message;
  if (status) element.dataset.status = status;
  else element.removeAttribute("data-status");
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (options.method && options.method !== "GET" && state.csrfToken) headers.set("X-CSRF-Token", state.csrfToken);
  const response = await fetch(`${API_BASE}${path}`, { credentials: "same-origin", ...options, headers });
  let result = {};
  try { result = await response.json(); } catch { result = {}; }
  if (!response.ok) {
    if (response.status === 401 && !path.endsWith("/login")) showLogin();
    const error = new Error(result.error || "Hope Sojourns could not complete that request.");
    error.code = result.code;
    throw error;
  }
  return result;
}

function showLogin() {
  authLoading.hidden = true;
  app.hidden = true;
  loginPanel.hidden = false;
  document.querySelector("#trip-admin-password")?.focus();
}

function showApp() {
  authLoading.hidden = true;
  loginPanel.hidden = true;
  app.hidden = false;
}

async function establishSession() {
  try {
    const session = await api("/admin/session");
    state.csrfToken = session.csrfToken;
    showApp();
    await loadBootstrap();
  } catch {
    showLogin();
  }
}

function option(value, label) {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label;
  return item;
}

function fillSelect(select, entries, placeholder, valueFor, labelFor) {
  if (!select) return;
  const selected = select.value;
  select.replaceChildren(option("", placeholder));
  entries.forEach(entry => select.append(option(valueFor(entry), labelFor(entry))));
  if ([...select.options].some(item => item.value === selected)) select.value = selected;
}

function fillAllSelects() {
  if (!state.bootstrap) return;
  const { opportunities, people, ministries, fundingSources, costCategories } = state.bootstrap;
  document.querySelectorAll('select[name="opportunityId"]').forEach(select => fillSelect(select, opportunities.filter(item => item.kind === "trip"), "No public opportunity", item => item.id, item => `${item.title} — ${item.location}`));
  document.querySelectorAll('select[name="personId"]').forEach(select => fillSelect(select, people.filter(item => item.contact_status === "active"), "Choose a person", item => item.id, item => `${item.preferred_name || item.first_name} ${item.last_name} — ${item.email}`));
  document.querySelectorAll('select[name="ministryId"], select[name="vendorMinistryId"]').forEach(select => fillSelect(select, ministries.filter(item => item.status === "active"), "No organization", item => item.id, item => item.name));
  document.querySelectorAll('select[name="fundingSourceId"]').forEach(select => fillSelect(select, fundingSources.filter(item => item.status === "active"), "Choose a funding source", item => item.id, item => item.name));
  document.querySelectorAll('select[name="categoryId"]').forEach(select => fillSelect(select, costCategories.filter(item => item.status === "active"), "Choose a category", item => item.id, item => item.name));
  const accounts = state.workspace?.accounts || [];
  document.querySelectorAll('select[name="accountId"]').forEach(select => fillSelect(select, accounts.filter(item => item.status === "active"), "No account", item => item.id, item => item.name));
  const costs = state.workspace?.costs || [];
  document.querySelectorAll('select[name="costItemId"]').forEach(select => fillSelect(select, costs.filter(item => item.payment_status !== "canceled"), "Choose a cost", item => item.id, item => `${item.category_name}: ${item.description}`));
  const charges = state.workspace?.charges || [];
  document.querySelectorAll('select[name="chargeId"]').forEach(select => fillSelect(select, charges.filter(item => ["open", "partially_paid"].includes(item.status)), "Do not apply automatically", item => item.id, item => `${item.account_name}: ${item.title} (${money(Number(item.amount) - Number(item.applied_total || 0))} open)`));
}

function updateCostCategoryOptions(selectRecommendedMethod = false) {
  const form = document.querySelector("#trip-cost-form");
  if (!form || !state.bootstrap) return;
  const category = state.bootstrap.costCategories.find(item => item.id === form.elements.categoryId.value);
  const percentageOption = [...form.elements.calculationMethod.options].find(item => item.value === "percentage_of_individual");
  const isPercentageFee = ["hs_leadership", "hs_administration"].includes(category?.system_key);
  percentageOption.disabled = !isPercentageFee;
  percentageOption.textContent = isPercentageFee
    ? "Percentage of individual base"
    : "Percentage of individual base (HS Leadership/Admin only)";
  if (selectRecommendedMethod && isPercentageFee && !form.elements.id.value) {
    form.elements.calculationMethod.value = "percentage_of_individual";
  } else if (!isPercentageFee && form.elements.calculationMethod.value === "percentage_of_individual") {
    form.elements.calculationMethod.value = "per_traveler";
  }
  updateCostCalculationFields();
}

function setFormPrerequisite(formSelector, prerequisite, message) {
  const form = document.querySelector(formSelector);
  const note = form?.querySelector("[data-prerequisite]");
  const submit = form?.querySelector('button[type="submit"]');
  if (!form || !note || !submit) return;
  note.hidden = !prerequisite;
  note.textContent = prerequisite ? message : "";
  submit.disabled = prerequisite;
  if (prerequisite) {
    if (!note.id) note.id = `trip-prerequisite-${note.dataset.prerequisite}`;
    submit.setAttribute("aria-describedby", note.id);
  } else {
    submit.removeAttribute("aria-describedby");
  }
}

function renderAccountPrerequisite() {
  if (!state.bootstrap) return;
  const accountType = document.querySelector("#trip-account-form").elements.accountType.value;
  const activePeople = state.bootstrap.people.filter(item => item.contact_status === "active");
  const activeMinistries = state.bootstrap.ministries.filter(item => item.status === "active");
  if (accountType === "individual" && !activePeople.length) {
    setFormPrerequisite("#trip-account-form", true, "Please complete this traveler in People before this individual account.");
  } else if (accountType === "organization" && !activeMinistries.length) {
    setFormPrerequisite("#trip-account-form", true, "Please complete this organization in Ministries before this organization account.");
  } else {
    setFormPrerequisite("#trip-account-form", false, "");
  }
}

function renderPrerequisiteGuidance() {
  if (!state.bootstrap || !state.workspace) return;
  const activePeople = state.bootstrap.people.filter(item => item.contact_status === "active");
  const activeMinistries = state.bootstrap.ministries.filter(item => item.status === "active");
  const activeSources = state.bootstrap.fundingSources.filter(item => item.status === "active");
  const activeCategories = state.bootstrap.costCategories.filter(item => item.status === "active");
  const activeCosts = state.workspace.costs.filter(item => item.payment_status !== "canceled");
  const activeAccounts = state.workspace.accounts.filter(item => item.status === "active");

  setFormPrerequisite("#trip-member-form", !activePeople.length, "Please complete this traveler or leader in People before this team member.");
  setFormPrerequisite("#trip-organization-form", !activeMinistries.length, "Please complete this organization in Ministries before this trip connection.");
  setFormPrerequisite("#trip-cost-form", !activeCategories.length, "Please complete a cost category in Setup lists before this cost.");

  const allocationMessage = !activeCosts.length && !activeSources.length
    ? "Please complete a trip cost and funding source before this funding allocation."
    : !activeCosts.length
      ? "Please complete a trip cost before this funding allocation."
      : "Please complete a funding source in Setup lists before this funding allocation.";
  setFormPrerequisite("#trip-allocation-form", !activeCosts.length || !activeSources.length, allocationMessage);

  setFormPrerequisite("#trip-charge-form", !activeAccounts.length, "Please complete a trip account before this charge.");
  const awardMessage = !activeAccounts.length && !activeSources.length
    ? "Please complete a trip account and funding source before this support credit."
    : !activeAccounts.length
      ? "Please complete a trip account before this support credit."
      : "Please complete a funding source in Setup lists before this support credit.";
  setFormPrerequisite("#trip-award-form", !activeAccounts.length || !activeSources.length, awardMessage);
  setFormPrerequisite("#trip-request-form", !activeAccounts.length, "Please complete a trip account before this payment request.");
  renderAccountPrerequisite();
}

function tripSetupSteps() {
  if (!state.workspace) return [];
  const { trip } = state.workspace;
  return [
    { id: "dates", done: Boolean(trip.start_date && trip.end_date), title: "Enter the travel dates", copy: "Add the start and end dates so every later deadline and itinerary item has a clear frame.", action: "edit" },
    { id: "opportunity", done: Boolean(trip.opportunity_id), title: "Connect the public trip idea", copy: "Choose the broader public opportunity that should display this dated departure.", action: "edit" },
    { id: "organization", done: state.workspace.organizations.length > 0, title: "Connect a partner organization", copy: "Add the church, ministry, logistics partner, or payer connected with this trip.", tab: "team", target: "#trip-organization-form", requirements: () => state.bootstrap.ministries.some(item => item.status === "active") ? [] : ["an organization in Ministries"] },
    { id: "member", done: state.workspace.members.some(item => item.status !== "withdrawn"), title: "Add the first traveler or leader", copy: "Choose an existing Person and set the role, status, organization, and directory permissions.", tab: "team", target: "#trip-member-form", requirements: () => state.bootstrap.people.some(item => item.contact_status === "active") ? [] : ["a person in People"] },
    { id: "credentials", done: Boolean(trip.portal_login_id), title: "Set the traveler portal credentials", copy: "Create the one shared trip ID and password for common traveler information.", tab: "portal", target: "#trip-portal-form" },
    { id: "portal", done: Boolean(trip.portal_enabled), title: "Enable traveler portal access", copy: "Use Edit trip to enable the portal after the shared credentials are ready.", action: "edit", requirements: () => trip.portal_login_id ? [] : ["traveler portal credentials"] },
    { id: "content", done: state.workspace.content.length > 0, title: "Add trip content", copy: "Start with an instruction, itinerary item, devotional, resource, update, or overview.", tab: "content", target: "#trip-content-form" },
    { id: "budget", done: Boolean(trip.budget_completed_at), title: "Build and finish the trip budget", copy: "Enter the expected costs, confirm the paying-traveler count, then select Finish budget.", tab: "budget", target: "#trip-budget-plan-form", requirements: () => [...(!state.bootstrap.costCategories.some(item => item.status === "active") ? ["a cost category in Setup lists"] : []), ...(!state.workspace.costs.some(item => item.payment_status !== "canceled") ? ["at least one active budget item"] : [])] },
    { id: "allocation", done: state.workspace.allocations.some(item => item.status !== "canceled"), title: "Assign funding responsibility", copy: "Allocate a trip cost to the traveler, Hope Sojourns, a church, a sponsor, or another funding source.", tab: "budget", target: "#trip-allocation-form", requirements: () => [...(!state.workspace.costs.some(item => item.payment_status !== "canceled") ? ["a trip cost"] : []), ...(!state.bootstrap.fundingSources.some(item => item.status === "active") ? ["a funding source in Setup lists"] : [])] },
    { id: "account", done: state.workspace.accounts.some(item => item.status === "active"), title: "Create a trip account", copy: "Create the individual, family, group, organization, or sponsor account that will receive charges and payments.", tab: "accounts", target: "#trip-account-form" },
    { id: "charge", done: state.workspace.charges.some(item => item.status !== "canceled"), title: "Add a payment plan charge", copy: "Record what the traveler, group, or organization is expected to pay and when it is due.", tab: "accounts", target: "#trip-charge-form", requirements: () => state.workspace.accounts.some(item => item.status === "active") ? [] : ["a trip account"] },
    { id: "invite", done: state.workspace.invites.some(item => item.status === "active"), title: "Create a traveler invitation", copy: "Create a friendly private link that sends travelers to the correct interest form.", tab: "communications", target: "#trip-invite-form" },
    { id: "public", done: Boolean(trip.public_enabled && trip.interest_enabled), title: "Open the public trip for interest", copy: "Use Edit trip to make the dated trip visible and accept interest when its public information is ready.", action: "edit", requirements: () => [...(!(trip.start_date && trip.end_date) ? ["the travel dates"] : []), ...(!trip.opportunity_id ? ["the public trip idea"] : [])] },
  ];
}

function guideStepRequirements(step) {
  return typeof step.requirements === "function" ? step.requirements() : [];
}

function nextAvailableGuideStep(steps) {
  return steps.find(step => !step.done && guideStepRequirements(step).length === 0)
    || steps.find(step => !step.done);
}

function renderSetupGuide() {
  const guide = document.querySelector("#trip-setup-guide");
  if (!guide) return;
  if (!state.workspace || !state.guidedHelp) {
    guide.hidden = true;
    return;
  }

  const steps = tripSetupSteps();
  state.guideSteps = steps;
  const completed = steps.filter(step => step.done).length;
  const next = nextAvailableGuideStep(steps);
  const progressText = `${completed} of ${steps.length} steps complete`;
  guide.hidden = false;
  document.querySelector("#trip-setup-guide-progress").textContent = progressText;
  const meter = document.querySelector("#trip-setup-guide-meter");
  meter.max = steps.length;
  meter.value = completed;
  meter.textContent = progressText;
  document.querySelector("#trip-setup-guide-next").textContent = next ? `Next: ${next.title}` : "Setup checklist complete";
  document.querySelector("#trip-setup-guide-copy").textContent = next
    ? next.copy
    : "All setup steps are complete. You can leave guided help on for future changes or turn it off.";
  document.querySelector("#trip-guide-next").hidden = !next;

  const list = document.querySelector("#trip-setup-guide-list");
  list.replaceChildren();
  steps.forEach(step => {
    const requirements = guideStepRequirements(step);
    const item = node("li", [step.done ? "is-complete" : "", requirements.length ? "is-blocked" : ""].filter(Boolean).join(" "));
    const button = node("button", "trip-guide-step", `${step.done ? "Complete: " : "To do: "}${step.title}`);
    button.type = "button";
    button.addEventListener("click", () => openGuideStep(step));
    item.append(button);
    list.append(item);
  });
}

function openNextGuideStep() {
  const step = nextAvailableGuideStep(state.guideSteps);
  if (!step) return;
  openGuideStep(step);
}

function openGuideStep(step) {
  const requirements = guideStepRequirements(step);
  if (requirements.length) {
    const dependency = requirements.length === 1
      ? requirements[0]
      : `${requirements.slice(0, -1).join(", ")} and ${requirements.at(-1)}`;
    showGuideAlert(`Please complete ${dependency} before this step: ${step.title}.`);
    return;
  }
  if (step.action === "edit") {
    openTripDialog(state.workspace.trip);
    return;
  }
  activateTab(step.tab);
  const target = document.querySelector(step.target);
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
  target?.querySelector("input:not([type='hidden']):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])")?.focus({ preventScroll: true });
}

function serializeForm(form) {
  const result = {};
  for (const [key, value] of new FormData(form).entries()) result[key] = String(value);
  form.querySelectorAll('input[type="checkbox"]').forEach(input => { result[input.name] = input.checked; });
  return result;
}

function setFormValues(form, values, mapping = {}) {
  Object.entries(values).forEach(([key, value]) => {
    const fieldName = mapping[key] || key.replace(/_([a-z])/g, (_, character) => character.toUpperCase());
    const field = form.elements[fieldName];
    if (!field) return;
    if (field.type === "checkbox") field.checked = Boolean(Number(value) || value === true);
    else field.value = value ?? "";
  });
}

async function loadBootstrap(selectTrip = state.tripId) {
  setStatus(pageStatus, "Loading trips…");
  state.bootstrap = await api("/admin/trip-platform/bootstrap");
  fillAllSelects();
  renderTripList();
  renderSetupLists();
  if (selectTrip) await openTrip(selectTrip, false);
  setStatus(pageStatus, "");
}

function renderTripList() {
  const list = document.querySelector("#trip-list");
  const empty = document.querySelector("#trip-empty");
  list.replaceChildren();
  empty.hidden = state.bootstrap.trips.length > 0;
  state.bootstrap.trips.forEach(trip => {
    const card = node("article", "trip-list-card");
    const chips = node("div", "trip-card-meta");
    chips.append(node("span", "trip-status-pill", titleCase(trip.status)));
    if (trip.public_enabled) chips.append(node("span", "trip-chip trip-chip-public", "Public"));
    if (trip.portal_enabled) chips.append(node("span", "trip-chip", "Portal on"));
    card.append(chips, node("h3", "", trip.title), node("p", "", trip.public_summary || trip.location));
    const meta = node("div", "trip-card-meta");
    meta.append(node("span", "", dateRange(trip.start_date, trip.end_date)), node("span", "", `${Number(trip.member_count || 0)} team members`));
    card.append(meta);
    const button = node("button", "trip-button trip-button-outline", "Open trip");
    button.type = "button";
    button.addEventListener("click", () => openTrip(trip.id));
    card.append(button);
    list.append(card);
  });
}

async function openTrip(tripId, scroll = true) {
  state.tripId = tripId;
  setStatus(pageStatus, "Opening trip…");
  state.workspace = await api(`/admin/trips/${tripId}`);
  tripListPanel.hidden = true;
  tripWorkspace.hidden = false;
  renderWorkspace();
  activateTab(state.activeTab);
  if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
  setStatus(pageStatus, "");
}

function closeTrip() {
  state.tripId = null;
  state.workspace = null;
  tripWorkspace.hidden = true;
  tripListPanel.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function metric(label, value) {
  const card = node("article");
  card.append(node("span", "", label), node("strong", "", value));
  return card;
}

function financeTotals() {
  const activeCosts = state.workspace.costs.filter(item => item.payment_status !== "canceled");
  const individualBase = activeCosts.filter(item => item.calculation_method === "per_traveler").reduce((sum, item) => sum + Number(item.quantity) * Number(item.estimated_unit_cost), 0);
  const individualFees = activeCosts.filter(item => item.calculation_method === "percentage_of_individual").reduce((sum, item) => sum + Number(item.estimated_unit_cost), 0);
  const fixedCosts = activeCosts.filter(item => item.calculation_method === "fixed").reduce((sum, item) => sum + Number(item.estimated_total), 0);
  const operational = activeCosts.reduce((sum, item) => sum + Number(item.actual_total > 0 ? item.actual_total : item.estimated_total), 0);
  const actual = activeCosts.reduce((sum, item) => sum + Number(item.actual_total || 0), 0);
  const externalCost = activeCosts.filter(item => item.settlement_route === "external").reduce((sum, item) => sum + Number(item.actual_total > 0 ? item.actual_total : item.estimated_total), 0);
  const hsCost = activeCosts.filter(item => item.settlement_route === "through_hs").reduce((sum, item) => sum + Number(item.actual_total > 0 ? item.actual_total : item.estimated_total), 0);
  const hsIncome = state.workspace.payments.filter(item => item.settlement_route === "through_hs" && item.status === "received" && item.purpose !== "refund").reduce((sum, item) => sum + Number(item.amount), 0);
  const externalFunding = state.workspace.payments.filter(item => item.settlement_route === "external" && item.status === "received").reduce((sum, item) => sum + Number(item.amount), 0);
  const adminRevenue = state.workspace.payments.filter(item => item.settlement_route === "through_hs" && item.status === "received" && item.purpose === "admin_fee").reduce((sum, item) => sum + Number(item.amount), 0);
  return { individualBase, individualFees, fixedCosts, operational, actual, externalCost, hsCost, hsIncome, externalFunding, adminRevenue };
}

function setPortalCredentialLocked(locked) {
  const form = document.querySelector("#trip-portal-form");
  const loginId = form.elements.loginId;
  const password = form.elements.password;
  const save = form.querySelector("[data-save-portal-credentials]");
  const unlock = document.querySelector("#trip-portal-unlock");
  const note = form.querySelector("[data-credential-locked-note]");
  form.classList.toggle("is-locked", locked);
  loginId.disabled = locked;
  password.disabled = locked;
  password.required = !locked;
  form.querySelector('[data-password-toggle][aria-controls="trip-shared-password"]').disabled = locked;
  save.hidden = locked;
  save.textContent = state.workspace?.trip.portal_login_id ? "Update portal credentials" : "Set portal credentials";
  unlock.hidden = !locked;
  note.hidden = !locked;
  if (locked) {
    password.value = "";
    resetPasswordVisibility(form);
  }
}

function renderWorkspace() {
  const trip = state.workspace.trip;
  document.querySelector("#trip-workspace-code").textContent = trip.code;
  document.querySelector("#trip-workspace-title").textContent = trip.title;
  document.querySelector("#trip-workspace-meta").textContent = `${dateRange(trip.start_date, trip.end_date)} · ${trip.location}`;
  document.querySelector("#trip-workspace-status").textContent = titleCase(trip.status);
  document.querySelector("#trip-opportunity-title").textContent = trip.opportunity_title || "No public opportunity connected";
  document.querySelector("#trip-opportunity-copy").textContent = trip.opportunity_title
    ? `This dated departure appears with the broader ${trip.opportunity_title} opportunity when public visibility is enabled.`
    : "Connect this trip to a public opportunity so visitors can discover its dates and express interest.";
  document.querySelector("#trip-open-portal").href = `/journey/?trip=${encodeURIComponent(trip.portal_login_id || trip.code)}`;
  document.querySelector("#trip-open-public").href = `/trip/?trip=${encodeURIComponent(trip.slug)}`;
  document.querySelector("#trip-public-summary").textContent = trip.public_enabled
    ? `${trip.title} is public. ${trip.interest_enabled ? "Interest is open." : "Interest is currently closed."}`
    : `${trip.title} is still hidden from the public site.`;
  document.querySelector("#trip-portal-form").elements.loginId.value = trip.portal_login_id || trip.code;
  setPortalCredentialLocked(Boolean(trip.portal_login_id));

  const totals = financeTotals();
  const summary = document.querySelector("#trip-summary-grid");
  summary.replaceChildren(
    metric("Team", state.workspace.members.filter(item => item.status !== "withdrawn").length),
    metric("Operational cost", money(totals.operational)),
    metric("HS cash received", money(totals.hsIncome)),
    metric("Open accounts", state.workspace.accounts.filter(item => Number(item.balance) > 0).length),
  );

  const readiness = [
    [Boolean(trip.start_date && trip.end_date), "Dates entered"],
    [Boolean(trip.opportunity_id), "Connected to a public opportunity"],
    [state.workspace.members.length > 0, "Team started"],
    [Boolean(trip.budget_completed_at), trip.budget_completed_at ? "Budget finished" : state.workspace.costs.length > 0 ? "Budget in progress" : "Budget not started"],
    [Boolean(trip.portal_login_id && trip.portal_enabled), "Traveler portal ready"],
    [state.workspace.content.some(item => item.publication_status === "published"), "Published trip content available"],
  ];
  const readinessList = node("ul", "trip-readiness-list");
  readiness.forEach(([ready, label]) => {
    const item = node("li");
    item.append(node("b", "", ready ? "✓" : "·"), node("span", "", label));
    readinessList.append(item);
  });
  document.querySelector("#trip-readiness").replaceChildren(readinessList);
  document.querySelector("#trip-finance-explainer").replaceChildren(
    node("p", "trip-small-meta", `${money(totals.externalCost)} externally managed · ${money(totals.hsCost)} routed through HS`),
  );

  fillAllSelects();
  renderMembers();
  renderContent();
  renderBudget();
  renderAccounts();
  renderInvitesAndMessages();
  renderPublicContent();
  renderPrerequisiteGuidance();
  renderSetupGuide();
}

function record(title, body, metaItems = [], actions = []) {
  const template = document.querySelector("#trip-record-template");
  const article = template.content.firstElementChild.cloneNode(true);
  const main = article.querySelector(".trip-record-main");
  main.append(node("h4", "", title));
  if (body) main.append(node("p", "trip-record-body", body));
  if (metaItems.length) {
    const meta = node("div", "trip-record-meta");
    metaItems.filter(Boolean).forEach(item => meta.append(node("span", "", item)));
    main.append(meta);
  }
  const actionShell = article.querySelector(".trip-record-actions");
  actions.forEach(action => {
    const button = node("button", `trip-button ${action.kind === "danger" ? "trip-button-quiet" : "trip-button-outline"}`, action.label);
    button.type = "button";
    button.addEventListener("click", action.run);
    actionShell.append(button);
  });
  if (!actions.length) actionShell.remove();
  return article;
}

function renderMembers() {
  const interests = document.querySelector("#trip-interest-list");
  interests.replaceChildren();
  (state.workspace.interests || []).forEach(item => interests.append(record(
    `${item.preferred_name || item.first_name} ${item.last_name}`,
    [item.email, item.phone, item.invite_label ? `Invitation: ${item.invite_label}` : "Public interest form"].filter(Boolean).join(" / "),
    [titleCase(item.status), `Received ${formatDate(item.created_at)}`, item.invite_ministry_name].filter(Boolean),
  )));
  if (!(state.workspace.interests || []).length) {
    interests.append(record("No interest forms yet", "Create a private invitation link or publish this actual trip to begin collecting interest."));
  }

  const members = document.querySelector("#trip-member-list");
  members.replaceChildren();
  state.workspace.members.forEach(member => members.append(record(
    `${member.preferred_name || member.first_name} ${member.last_name}`,
    member.ministry_name || "No organization connected",
    [titleCase(member.role), titleCase(member.status), member.directory_visible ? "Directory: on" : "Directory: off"],
    [{ label: "Edit", run: () => {
      const form = document.querySelector("#trip-member-form");
      setFormValues(form, member);
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    } }],
  )));
  if (!state.workspace.members.length) members.append(record("No team members yet", "Add travelers and leaders from the existing People list."));

  const organizations = document.querySelector("#trip-organization-list");
  organizations.replaceChildren();
  state.workspace.organizations.forEach(item => organizations.append(record(
    item.ministry_name,
    item.notes,
    [item.role],
    [{ label: "Edit", run: () => {
      const form = document.querySelector("#trip-organization-form");
      setFormValues(form, item);
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    } }],
  )));
}

function editContent(item) {
  const form = document.querySelector("#trip-content-form");
  setFormValues(form, item);
  form.querySelector("[data-cancel-edit]").hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function removeResource(resource, id, label) {
  if (!window.confirm(`Remove ${label}? This cannot be undone.`)) return;
  await api(`/admin/trips/${state.tripId}/${resource}/${id}`, { method: "DELETE" });
  await openTrip(state.tripId, false);
}

function renderContent() {
  const list = document.querySelector("#trip-content-list");
  list.replaceChildren();
  state.workspace.content.forEach(item => list.append(record(
    item.title,
    item.content,
    [titleCase(item.content_type), titleCase(item.visibility), titleCase(item.publication_status), item.event_date ? dateLabel(item.event_date) : ""],
    [{ label: "Edit", run: () => editContent(item) }, { label: "Remove", kind: "danger", run: () => removeResource("content", item.id, item.title) }],
  )));
  if (!state.workspace.content.length) list.append(record("No trip content yet", "Add a devotional, itinerary item, instruction, resource, or public update."));
}

function editCost(item) {
  const form = document.querySelector("#trip-cost-form");
  setFormValues(form, item);
  updateCostCategoryOptions(false);
  form.querySelector("[data-cancel-edit]").hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateCostCalculationFields() {
  const form = document.querySelector("#trip-cost-form");
  const method = form.elements.calculationMethod.value;
  const percentageField = form.querySelector("[data-percentage-field]");
  const isPercentage = method === "percentage_of_individual";
  const isDerived = isPercentage || method === "per_traveler";
  if (isDerived) form.elements.expenseScope.value = "individual";
  form.elements.expenseScope.disabled = isDerived;
  percentageField.hidden = !isPercentage;
  form.elements.percentageRate.required = isPercentage;
  form.elements.quantity.readOnly = isPercentage;
  form.elements.estimatedUnitCost.readOnly = isPercentage;
  form.elements.estimatedTotal.readOnly = isDerived;
  if (isPercentage) form.elements.quantity.value = "1";
  if (!state.workspace || !isDerived) return;
  const count = Math.max(1, Number(document.querySelector("#trip-budget-plan-form").elements.payingTravelerCount.value || state.workspace.trip.paying_traveler_count || 1));
  const quantity = Math.max(0, Number(form.elements.quantity.value || 0));
  let each = Math.max(0, Number(form.elements.estimatedUnitCost.value || 0));
  if (isPercentage) {
    each = financeTotals().individualBase * Math.max(0, Number(form.elements.percentageRate.value || 0)) / 100;
    form.elements.estimatedUnitCost.value = each.toFixed(2);
  }
  form.elements.estimatedTotal.value = (quantity * each * count).toFixed(2);
}

function budgetCalculationLabel(item) {
  if (item.calculation_method === "percentage_of_individual") {
    return Number(item.percentage_rate || 0).toLocaleString() + "% of individual base · " + money(item.estimated_unit_cost) + " per traveler";
  }
  if (item.calculation_method === "per_traveler") {
    return Number(item.quantity).toLocaleString() + " × " + money(item.estimated_unit_cost) + " per traveler";
  }
  return Number(item.quantity).toLocaleString() + " × " + money(item.estimated_unit_cost) + " fixed";
}

function budgetDetail(label, value) {
  const item = node("div");
  item.append(node("dt", "", label), node("dd", "", value || "Not entered"));
  return item;
}

function budgetRecord(item, allocations) {
  const details = node("details", "trip-budget-record");
  details.open = state.budgetItemsExpanded;
  const summary = node("summary");
  const title = node("span", "trip-budget-record-title");
  title.append(node("strong", "", item.category_name), node("span", "", item.description));
  const summaryMeta = node("span", "trip-budget-record-summary");
  summaryMeta.append(
    node("span", "", budgetCalculationLabel(item)),
    node("strong", "", money(item.estimated_total)),
    node("span", "trip-status-pill", titleCase(item.payment_status)),
  );
  summary.append(title, summaryMeta);

  const body = node("div", "trip-budget-record-body");
  const facts = node("dl", "trip-budget-facts");
  facts.append(
    budgetDetail("Calculation", budgetCalculationLabel(item)),
    budgetDetail("Scope", titleCase(item.expense_scope)),
    budgetDetail("Estimated trip total", money(item.estimated_total)),
    budgetDetail("Actual total", money(item.actual_total)),
    budgetDetail("Money route", item.settlement_route === "external" ? "Paid externally" : "Paid through Hope Sojourns"),
    budgetDetail("Vendor or payee", item.vendor_name || item.vendor_ministry_name),
    budgetDetail("Due date", item.due_date ? dateLabel(item.due_date) : ""),
    budgetDetail("Paid date", item.paid_date ? dateLabel(item.paid_date) : ""),
    budgetDetail("Payment method", item.payment_method),
    budgetDetail("Reference", item.external_reference),
  );
  const allocationText = allocations.length
    ? allocations.map(allocation => allocation.funding_source_name + ": " + money(allocation.amount) + " (" + titleCase(allocation.status) + ")").join("\n")
    : "No funding sources allocated yet.";
  body.append(facts, node("p", "trip-record-body", "Funding responsibility\n" + allocationText));
  if (item.notes) body.append(node("p", "trip-record-body", "Notes\n" + item.notes));
  const actions = node("div", "trip-record-actions");
  const edit = node("button", "trip-button trip-button-outline", "Edit");
  edit.type = "button";
  edit.addEventListener("click", () => editCost(item));
  const remove = node("button", "trip-button trip-button-quiet", "Remove");
  remove.type = "button";
  remove.addEventListener("click", () => removeResource("cost-items", item.id, item.description));
  actions.append(edit, remove);
  body.append(actions);
  details.append(summary, body);
  details.addEventListener("toggle", updateBudgetExpandButton);
  return details;
}

function updateBudgetExpandButton() {
  const button = document.querySelector("#trip-budget-expand-all");
  const items = [...document.querySelectorAll("#trip-cost-list .trip-budget-record")];
  const allOpen = items.length > 0 && items.every(item => item.open);
  button.disabled = items.length === 0;
  button.textContent = allOpen ? "Collapse all items" : "Expand all items";
  button.setAttribute("aria-pressed", String(allOpen));
}

function renderBudget() {
  const totals = financeTotals();
  const trip = state.workspace.trip;
  const planForm = document.querySelector("#trip-budget-plan-form");
  planForm.elements.payingTravelerCount.value = trip.paying_traveler_count || 1;
  const completed = Boolean(trip.budget_completed_at);
  document.querySelector("#trip-budget-complete").hidden = completed;
  document.querySelector("#trip-budget-complete").disabled = !state.workspace.costs.some(item => item.payment_status !== "canceled");
  document.querySelector("#trip-budget-reopen").hidden = !completed;
  const completion = document.querySelector("#trip-budget-completion");
  completion.dataset.status = completed ? "complete" : "in-progress";
  completion.textContent = completed
    ? "Budget finished " + formatDate(trip.budget_completed_at) + ". Reopen it before changing the traveler count; editing a cost also reopens it automatically."
    : "Budget in progress. Select Finish budget when the cost plan and paying-traveler count have been reviewed.";
  document.querySelector("#trip-budget-summary").replaceChildren(
    metric("Base per traveler", money(totals.individualBase)),
    metric("Fees per traveler", money(totals.individualFees)),
    metric("Paying travelers", Number(trip.paying_traveler_count || 1).toLocaleString()),
    metric("Estimated trip budget", money(state.workspace.costs.filter(item => item.payment_status !== "canceled").reduce((sum, item) => sum + Number(item.estimated_total), 0))),
    metric("Fixed trip costs", money(totals.fixedCosts)),
    metric("Paid externally", money(totals.externalCost)),
    metric("HS responsibility", money(totals.hsCost)),
    metric("Actual costs", money(totals.actual)),
  );
  const list = document.querySelector("#trip-cost-list");
  list.replaceChildren();
  state.workspace.costs.forEach(item => {
    const allocations = state.workspace.allocations.filter(allocation => allocation.cost_item_id === item.id && allocation.status !== "canceled");
    list.append(budgetRecord(item, allocations));
  });
  if (!state.workspace.costs.length) list.append(record("No costs entered", "Begin with airfare, lodging, ground transportation, meals, ministry support, and HS expenses."));
  updateBudgetExpandButton();
  updateCostCategoryOptions(false);
}

async function makeAccountLink(account) {
  try {
    const result = await api(`/admin/trips/${state.tripId}/accounts/${account.id}/access-links`, { method: "POST", body: "{}" });
    const full = `${window.location.origin}${result.path}`;
    state.accountLinks.set(account.id, full);
    await navigator.clipboard?.writeText(full);
    setStatus(pageStatus, `A new private link for ${account.name} was created${navigator.clipboard ? " and copied" : ""}.`, "success");
    renderAccounts();
  } catch (error) {
    setStatus(pageStatus, error.message, "error");
  }
}

function editAccount(account) {
  const form = document.querySelector("#trip-account-form");
  setFormValues(form, account);
  form.closest("details").open = true;
  renderAccountPrerequisite();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderAccounts() {
  const active = state.workspace.accounts.filter(item => item.status === "active");
  const charges = active.reduce((sum, item) => sum + Number(item.charges_total), 0);
  const payments = active.reduce((sum, item) => sum + Number(item.payments_total), 0);
  const awards = active.reduce((sum, item) => sum + Number(item.awards_total), 0);
  const balance = active.reduce((sum, item) => sum + Number(item.balance), 0);
  const summary = document.querySelector("#trip-account-summary");
  summary.replaceChildren(metric("Charges", money(charges)), metric("Payments", money(payments)), metric("Support credits", money(awards)), metric("Balance", money(balance)));
  const printButton = node("button", "trip-button trip-button-outline", "Print team summary");
  printButton.type = "button";
  printButton.addEventListener("click", () => window.print());
  summary.append(printButton);

  const list = document.querySelector("#trip-account-list");
  list.replaceChildren();
  state.workspace.accounts.forEach(account => {
    const accountCharges = state.workspace.charges.filter(item => item.account_id === account.id && item.status !== "canceled");
    const accountAwards = state.workspace.awards.filter(item => item.account_id === account.id && item.status !== "reversed");
    const details = [
      ...accountCharges.map(item => `Charge: ${item.title} — ${money(item.amount)} (${titleCase(item.status)})`),
      ...accountAwards.map(item => `Credit: ${titleCase(item.award_type)} — ${money(item.amount)} (${item.funding_source_name})`),
    ].join("\n");
    const actions = [{ label: "Edit", run: () => editAccount(account) }];
    if (account.person_id) actions.push({ label: "Annual summary", run: () => window.open(`/admin/annual-summary/?personId=${encodeURIComponent(account.person_id)}&year=${new Date().getFullYear()}`, "_blank", "noopener") });
    if (account.financial_access === "private_link") actions.push({ label: "Create private link", run: () => makeAccountLink(account) });
    const currentLink = state.accountLinks.get(account.id);
    if (currentLink) actions.push({ label: "Open statement", run: () => window.open(currentLink, "_blank", "noopener") });
    list.append(record(
      account.name,
      details || "No charges or support credits yet.",
      [titleCase(account.account_type), `Charges ${money(account.charges_total)}`, `Payments ${money(account.payments_total)}`, `Credits ${money(account.awards_total)}`, `Balance ${money(account.balance)}`, titleCase(account.financial_access)],
      actions,
    ));
  });
  if (!state.workspace.accounts.length) list.append(record("No trip accounts yet", "Create an individual, family, church, group, or sponsor account."));

  const paymentsList = document.querySelector("#trip-payment-list");
  paymentsList.replaceChildren();
  state.workspace.payments.forEach(payment => paymentsList.append(record(
    `${money(payment.amount)} from ${payment.payer_name || payment.account_name || "Unspecified payer"}`,
    payment.notes || payment.external_reference || "",
    [dateLabel(payment.transaction_date), titleCase(payment.purpose), payment.payment_method, payment.settlement_route === "external" ? "Settled externally" : "Received by HS", titleCase(payment.status)],
  )));
}

async function sendMessage(message) {
  setStatus(pageStatus, `Sending “${message.subject}”…`);
  try {
    await api(`/admin/trips/${state.tripId}/messages/${message.id}/send`, { method: "POST", body: "{}" });
    setStatus(pageStatus, "Message sent.", "success");
    await openTrip(state.tripId, false);
  } catch (error) {
    setStatus(pageStatus, error.message, "error");
  }
}

function renderInvitesAndMessages() {
  const inviteList = document.querySelector("#trip-invite-list");
  inviteList.replaceChildren();
  state.workspace.invites.forEach(invite => inviteList.append(record(
    invite.label || "Trip invitation",
    invite.ministry_name ? `Preselected organization: ${invite.ministry_name}` : "Open invitation",
    [titleCase(invite.status), `${invite.use_count} uses`, invite.expires_at ? `Expires ${dateLabel(invite.expires_at)}` : "No expiration"],
  )));
  const outbox = document.querySelector("#trip-outbox-list");
  outbox.replaceChildren();
  state.workspace.outbox.forEach(message => outbox.append(record(
    message.subject,
    message.body_text,
    [message.recipient_email, titleCase(message.message_type), titleCase(message.status), message.last_error || ""],
    message.status === "sent" || message.status === "canceled" ? [] : [{ label: "Send now", run: () => sendMessage(message) }],
  )));
}

function renderPublicContent() {
  const list = document.querySelector("#trip-public-content-list");
  list.replaceChildren();
  const items = state.workspace.content.filter(item => item.visibility === "public");
  items.forEach(item => list.append(record(item.title, item.content, [titleCase(item.content_type), titleCase(item.publication_status)])));
  if (!items.length) list.append(record("No public content yet", "Public content must be intentionally marked Public and Published."));
}

function renderSetupLists() {
  if (!state.bootstrap) return;
  const sourceList = document.querySelector("#trip-source-list");
  const categoryList = document.querySelector("#trip-category-list");
  sourceList.replaceChildren();
  categoryList.replaceChildren();
  state.bootstrap.fundingSources.forEach(source => sourceList.append(record(source.name, source.notes || "", [titleCase(source.source_type), titleCase(source.status), source.system_key ? "Built in" : "Custom"])));
  state.bootstrap.costCategories.forEach(category => categoryList.append(record(category.name, category.description || "", [titleCase(category.status), category.system_key ? "Built in" : "Custom"])));
}

function activateTab(name) {
  state.activeTab = name;
  document.querySelectorAll("[data-trip-tab]").forEach(button => {
    const active = button.dataset.tripTab === name;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-trip-panel]").forEach(panel => { panel.hidden = panel.dataset.tripPanel !== name; });
  document.querySelector("#trip-workspace-select").value = name;
}

function setupTabs() {
  const select = document.querySelector("#trip-workspace-select");
  document.querySelectorAll("[data-trip-tab]").forEach(button => {
    select.append(option(button.dataset.tripTab, button.textContent));
    button.addEventListener("click", () => activateTab(button.dataset.tripTab));
  });
  select.addEventListener("change", () => activateTab(select.value));
}

function openTripDialog(trip = null) {
  const form = document.querySelector("#trip-form");
  form.reset();
  fillAllSelects();
  form.elements.id.value = "";
  document.querySelector("#trip-dialog-title").textContent = trip ? "Edit trip" : "Create a trip";
  if (trip) setFormValues(form, trip);
  else {
    form.elements.status.value = "draft";
    form.elements.publicCallToAction.value = "I'm interested in this trip";
  }
  tripDialog.showModal();
}

function resetTripImport() {
  document.querySelector("#trip-import-form").reset();
  document.querySelector("#trip-import-results").hidden = true;
  document.querySelector("#trip-import-summary").replaceChildren();
  document.querySelector("#trip-import-table-shell").replaceChildren();
  document.querySelector("#trip-import-commit").disabled = true;
  setStatus(document.querySelector("#trip-import-status"), "");
  state.importPreview = null;
}

function openTripImport() {
  if (!state.tripId) {
    showGuideAlert("Open or create a trip before importing its spreadsheet.");
    return;
  }
  resetTripImport();
  document.querySelector("#trip-export-link").href = `${API_BASE}/admin/trips/${encodeURIComponent(state.tripId)}/export`;
  importDialog.showModal();
  document.querySelector("#trip-import-file").focus();
}

function renderTripImportResult(result) {
  state.importPreview = result;
  const results = document.querySelector("#trip-import-results");
  const summary = document.querySelector("#trip-import-summary");
  const tableShell = document.querySelector("#trip-import-table-shell");
  results.hidden = false;
  summary.replaceChildren();
  const labels = {
    total: "Rows checked",
    ready: "Ready",
    imported: "Imported",
    already_loaded: "Already loaded",
    conflict: "Conflicts",
    error: "Needs attention",
    not_imported: "Not imported",
  };
  Object.entries(result.summary || {}).forEach(([key, value]) => {
    if (!value && key !== "total") return;
    const card = node("div", "trip-import-summary-card");
    card.append(node("strong", "", value), node("span", "", labels[key] || titleCase(key)));
    summary.append(card);
  });
  const table = node("table", "trip-import-table");
  const head = node("thead");
  const headRow = node("tr");
  ["Sheet / row", "Type", "Import Ref", "Action", "Status", "Message"].forEach(label => headRow.append(node("th", "", label)));
  head.append(headRow);
  const body = node("tbody");
  (result.rows || []).forEach(row => {
    const tr = node("tr");
    tr.dataset.status = row.status;
    tr.append(
      node("td", "", `${row.sheet} / ${row.rowNumber}`),
      node("td", "", titleCase(row.entity)),
      node("td", "", row.externalKey),
      node("td", "", titleCase(row.action || "blocked")),
      node("td", "", titleCase(row.status)),
      node("td", "", row.message),
    );
    body.append(tr);
  });
  table.append(head, body);
  tableShell.replaceChildren(table);
  if (Array.isArray(result.invitations) && result.invitations.length) {
    const invitations = node("section", "trip-import-invitations");
    invitations.append(node("h3", "", "New invitation links"));
    result.invitations.forEach(invite => {
      const paragraph = node("p");
      const link = node("a", "", invite.label || "Traveler invitation");
      link.href = new URL(invite.path, window.location.origin).href;
      link.textContent = link.href;
      paragraph.append(link);
      invitations.append(paragraph);
    });
    tableShell.append(invitations);
  }
  document.querySelector("#trip-import-commit").disabled = !result.canCommit;
}

async function sendTripImport(commit) {
  const form = document.querySelector("#trip-import-form");
  const file = form.elements.file.files[0];
  const status = document.querySelector("#trip-import-status");
  if (!file) {
    setStatus(status, "Choose the completed Excel workbook first.", "error");
    form.elements.file.focus();
    return;
  }
  const data = new FormData();
  data.set("file", file);
  data.set("commit", String(commit));
  const previewButton = document.querySelector("#trip-import-preview");
  const commitButton = document.querySelector("#trip-import-commit");
  previewButton.disabled = true;
  commitButton.disabled = true;
  setStatus(status, commit ? "Importing ready rows…" : "Checking the workbook…");
  try {
    const result = await api(`/admin/trips/${state.tripId}/import`, { method: "POST", body: data });
    renderTripImportResult(result);
    setStatus(status, result.message || (commit ? "Spreadsheet import complete." : result.canCommit ? "Preview complete. Ready rows can be imported." : "Preview complete. Review the rows below."), "success");
    if (commit) await loadBootstrap(state.tripId);
  } catch (error) {
    setStatus(status, error.message, "error");
  } finally {
    previewButton.disabled = false;
    if (state.importPreview?.canCommit) commitButton.disabled = false;
  }
}

async function submitJsonForm(form, path, transform = value => value, after = "workspace") {
  const status = form.querySelector("[data-form-status]");
  const submit = form.querySelector('button[type="submit"]');
  setStatus(status, "Saving…");
  submit.disabled = true;
  try {
    const payload = transform(serializeForm(form));
    await api(path(payload), { method: payload.id && path.updateMethod ? path.updateMethod : "POST", body: JSON.stringify(payload) });
    setStatus(status, "Saved.", "success");
    form.reset();
    form.querySelector('input[name="id"]')?.setAttribute("value", "");
    form.querySelector("[data-cancel-edit]")?.setAttribute("hidden", "");
    if (after === "bootstrap") await loadBootstrap(state.tripId);
    else await openTrip(state.tripId, false);
  } catch (error) {
    setStatus(status, error.message, "error");
  } finally {
    submit.disabled = false;
  }
}

function endpoint(resource) {
  return () => `/admin/trips/${state.tripId}/${resource}`;
}

async function submitBudgetPlan(action) {
  const form = document.querySelector("#trip-budget-plan-form");
  const status = form.querySelector("[data-form-status]");
  const buttons = form.querySelectorAll("button");
  buttons.forEach(button => { button.disabled = true; });
  setStatus(status, action === "complete" ? "Finishing budget…" : action === "reopen" ? "Reopening budget…" : "Saving traveler count…");
  try {
    await api("/admin/trips/" + state.tripId + "/budget-plan", {
      method: "POST",
      body: JSON.stringify({ action, payingTravelerCount: form.elements.payingTravelerCount.value }),
    });
    await openTrip(state.tripId, false);
    setStatus(status, action === "complete" ? "Budget finished." : action === "reopen" ? "Budget reopened." : "Traveler count saved. Review the updated totals, then finish the budget.", "success");
  } catch (error) {
    setStatus(status, error.message, "error");
  } finally {
    buttons.forEach(button => { button.disabled = false; });
    const finish = document.querySelector("#trip-budget-complete");
    finish.disabled = !state.workspace?.costs.some(item => item.payment_status !== "canceled");
  }
}

function wireForms() {
  document.querySelector("#trip-admin-login-form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.querySelector("#trip-admin-login-status");
    setStatus(status, "Signing in…");
    try {
      const result = await api("/admin/login", { method: "POST", body: JSON.stringify({ password: form.elements.password.value, rememberMe: form.elements.rememberMe.checked }) });
      state.csrfToken = result.csrfToken;
      form.reset();
      showApp();
      await loadBootstrap();
    } catch (error) { setStatus(status, error.message, "error"); }
  });

  document.querySelector("#trip-form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = form.querySelector("[data-form-status]");
    const payload = serializeForm(form);
    setStatus(status, "Saving trip…");
    try {
      const editing = Boolean(payload.id);
      const result = await api(editing ? `/admin/trips/${payload.id}` : "/admin/trips", { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) });
      tripDialog.close();
      await loadBootstrap(editing ? payload.id : result.id);
    } catch (error) { setStatus(status, error.message, "error"); }
  });

  const simpleForms = [
    ["#trip-member-form", "members"], ["#trip-organization-form", "organizations"],
    ["#trip-content-form", "content"], ["#trip-cost-form", "cost-items"],
    ["#trip-allocation-form", "allocations"], ["#trip-account-form", "accounts"],
    ["#trip-charge-form", "charges"], ["#trip-award-form", "awards"],
    ["#trip-payment-form", "payments"], ["#trip-request-form", "payment-requests"],
    ["#trip-message-form", "messages"],
  ];
  simpleForms.forEach(([selector, resource]) => {
    document.querySelector(selector).addEventListener("submit", event => {
      event.preventDefault();
      submitJsonForm(event.currentTarget, endpoint(resource));
    });
  });

  document.querySelector("#trip-invite-form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    const status = form.querySelector("[data-form-status]");
    const resultBox = document.querySelector("#trip-invite-result");
    setStatus(status, "Creating private invitation…");
    resultBox.hidden = true;
    submit.disabled = true;
    try {
      const result = await api(`/admin/trips/${state.tripId}/invites`, { method: "POST", body: JSON.stringify(serializeForm(form)) });
      const fullLink = new URL(result.path, window.location.origin).href;
      form.reset();
      await openTrip(state.tripId, false);
      document.querySelector("#trip-invite-link").value = fullLink;
      resultBox.hidden = false;
      setStatus(status, "Invitation created. Copy and share the link now.", "success");
    } catch (error) {
      setStatus(status, error.message, "error");
    } finally {
      submit.disabled = false;
    }
  });

  document.querySelector("#trip-copy-invite").addEventListener("click", async () => {
    const input = document.querySelector("#trip-invite-link");
    input.select();
    try {
      await navigator.clipboard.writeText(input.value);
      setStatus(document.querySelector("#trip-invite-form [data-form-status]"), "Invitation link copied.", "success");
    } catch {
      document.execCommand("copy");
    }
  });

  document.querySelector("#trip-source-form").addEventListener("submit", event => {
    event.preventDefault();
    submitJsonForm(event.currentTarget, () => "/admin/trip-platform/funding-sources", value => value, "bootstrap");
  });
  document.querySelector("#trip-category-form").addEventListener("submit", event => {
    event.preventDefault();
    submitJsonForm(event.currentTarget, () => "/admin/trip-platform/cost-categories", value => value, "bootstrap");
  });

  document.querySelector("#trip-portal-form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = form.querySelector("[data-form-status]");
    setStatus(status, "Updating shared credentials…");
    try {
      await api(`/admin/trips/${state.tripId}/portal-credential`, { method: "POST", body: JSON.stringify(serializeForm(form)) });
      form.elements.password.value = "";
      setStatus(status, "Credentials updated. Previous portal sessions were signed out.", "success");
      await openTrip(state.tripId, false);
    } catch (error) { setStatus(status, error.message, "error"); }
  });

  document.querySelector("#trip-portal-unlock").addEventListener("click", () => {
    setPortalCredentialLocked(false);
    setStatus(document.querySelector("#trip-portal-form [data-form-status]"), "Credentials unlocked. Enter a new password to save changes.");
    document.querySelector("#trip-portal-form").elements.loginId.focus();
  });

  document.querySelector("#trip-budget-plan-form").addEventListener("submit", event => {
    event.preventDefault();
    submitBudgetPlan("save");
  });
  document.querySelector("#trip-budget-complete").addEventListener("click", () => submitBudgetPlan("complete"));
  document.querySelector("#trip-budget-reopen").addEventListener("click", () => submitBudgetPlan("reopen"));
  document.querySelector("#trip-budget-expand-all").addEventListener("click", () => {
    const items = [...document.querySelectorAll("#trip-cost-list .trip-budget-record")];
    const shouldOpen = !items.length || !items.every(item => item.open);
    state.budgetItemsExpanded = shouldOpen;
    items.forEach(item => { item.open = shouldOpen; });
    updateBudgetExpandButton();
  });
  const costForm = document.querySelector("#trip-cost-form");
  costForm.elements.categoryId.addEventListener("change", () => updateCostCategoryOptions(true));
  costForm.elements.calculationMethod.addEventListener("change", updateCostCalculationFields);
  ["quantity", "estimatedUnitCost", "percentageRate"].forEach(name => {
    costForm.elements[name].addEventListener("input", updateCostCalculationFields);
  });

  const accountsHelp = document.querySelector("#trip-accounts-help-dialog");
  document.querySelector("#trip-accounts-help-open").addEventListener("click", () => accountsHelp.showModal());
  document.querySelector("#trip-accounts-help-close").addEventListener("click", () => accountsHelp.close());
  document.querySelector("#trip-accounts-help-done").addEventListener("click", () => accountsHelp.close());

  document.querySelectorAll("[data-cancel-edit]").forEach(button => button.addEventListener("click", () => {
    button.form.reset();
    button.hidden = true;
    if (button.form.id === "trip-cost-form") updateCostCategoryOptions(false);
  }));
  document.querySelector("#trip-account-form").elements.accountType.addEventListener("change", renderAccountPrerequisite);
  document.querySelector("#trip-payment-form").elements.chargeId.addEventListener("change", event => {
    const charge = state.workspace?.charges.find(item => item.id === event.currentTarget.value);
    if (!charge) return;
    const accountSelect = event.currentTarget.form.elements.accountId;
    accountSelect.value = charge.account_id;
    if (!accountSelect.value) {
      setStatus(event.currentTarget.form.querySelector("[data-form-status]"), "That charge's account is no longer available.", "error");
    }
  });
}

document.querySelector("#trip-create").addEventListener("click", () => openTripDialog());
document.querySelectorAll("[data-open-trip-dialog]").forEach(button => button.addEventListener("click", () => openTripDialog()));
document.querySelectorAll("#trip-edit, [data-edit-trip]").forEach(button => button.addEventListener("click", () => openTripDialog(state.workspace.trip)));
document.querySelector("#trip-back").addEventListener("click", closeTrip);
document.querySelector("#trip-refresh").addEventListener("click", () => loadBootstrap(state.tripId));
document.querySelector(".trip-dialog-close").addEventListener("click", () => tripDialog.close());
document.querySelector("[data-close-trip-dialog]").addEventListener("click", () => tripDialog.close());
document.querySelector("#trip-guide-alert button").addEventListener("click", () => {
  document.querySelector("#trip-guide-alert").hidden = true;
  if (state.guideAlertTimer) window.clearTimeout(state.guideAlertTimer);
});
document.querySelectorAll("[data-open-trip-import]").forEach(button => button.addEventListener("click", openTripImport));
document.querySelector("#trip-import-close").addEventListener("click", () => importDialog.close());
document.querySelector("#trip-import-reset").addEventListener("click", resetTripImport);
document.querySelector("#trip-import-form").addEventListener("submit", event => {
  event.preventDefault();
  sendTripImport(false);
});
document.querySelector("#trip-import-commit").addEventListener("click", () => sendTripImport(true));
document.querySelector("#trip-admin-signout").addEventListener("click", async () => {
  try { await api("/admin/logout", { method: "POST", body: "{}" }); } finally { state.csrfToken = ""; showLogin(); }
});

initializeSidebar();
initializePasswordToggles();
initializeFieldHelp();
initializeGuidedHelp();
setupTabs();
wireForms();
establishSession();
