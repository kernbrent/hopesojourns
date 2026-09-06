const API_BASE = "/api/interest";
const ADMIN_NAVIGATION_SESSION_KEY = "hope-sojourns-admin-navigation";
const TRIP_GUIDED_HELP_KEY = "hope-sojourns-trip-guided-help";

const state = {
  csrfToken: "",
  bootstrap: null,
  workspace: null,
  tripId: null,
  activeTab: "overview",
  accountLinks: new Map(),
  guidedHelp: true,
  guideSteps: [],
};

const loginPanel = document.querySelector("#trip-admin-login");
const app = document.querySelector("#trip-admin-app");
const pageStatus = document.querySelector("#trip-page-status");
const tripListPanel = document.querySelector("#trip-list-panel");
const tripWorkspace = document.querySelector("#trip-workspace");
const tripDialog = document.querySelector("#trip-dialog");

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
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
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
  app.hidden = true;
  loginPanel.hidden = false;
  document.querySelector("#trip-admin-password")?.focus();
}

function showApp() {
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
    { done: Boolean(trip.start_date && trip.end_date), title: "Enter the travel dates", copy: "Add the start and end dates so every later deadline and itinerary item has a clear frame.", action: "edit" },
    { done: Boolean(trip.opportunity_id), title: "Connect the public trip idea", copy: "Choose the broader public opportunity that should display this dated departure.", action: "edit" },
    { done: state.workspace.organizations.length > 0, title: "Connect a partner organization", copy: "Add the church, ministry, logistics partner, or payer connected with this trip.", tab: "team", target: "#trip-organization-form" },
    { done: state.workspace.members.some(item => item.status !== "withdrawn"), title: "Add the first traveler or leader", copy: "Choose an existing Person and set the role, status, organization, and directory permissions.", tab: "team", target: "#trip-member-form" },
    { done: Boolean(trip.portal_login_id), title: "Set the traveler portal credentials", copy: "Create the one shared trip ID and password for common traveler information.", tab: "portal", target: "#trip-portal-form" },
    { done: Boolean(trip.portal_enabled), title: "Enable traveler portal access", copy: "Use Edit trip to enable the portal after the shared credentials are ready.", action: "edit" },
    { done: state.workspace.content.length > 0, title: "Add trip content", copy: "Start with an instruction, itinerary item, devotional, resource, update, or overview.", tab: "content", target: "#trip-content-form" },
    { done: state.workspace.costs.some(item => item.payment_status !== "canceled"), title: "Build the trip budget", copy: "Enter the first expected cost, including who pays it and whether money moves through Hope Sojourns.", tab: "budget", target: "#trip-cost-form" },
    { done: state.workspace.allocations.some(item => item.status !== "canceled"), title: "Assign funding responsibility", copy: "Allocate a trip cost to the traveler, Hope Sojourns, a church, a sponsor, or another funding source.", tab: "budget", target: "#trip-allocation-form" },
    { done: state.workspace.accounts.some(item => item.status === "active"), title: "Create a trip account", copy: "Create the individual, family, group, organization, or sponsor account that will receive charges and payments.", tab: "accounts", target: "#trip-account-form" },
    { done: state.workspace.charges.some(item => item.status !== "canceled"), title: "Add a payment plan charge", copy: "Record what the traveler, group, or organization is expected to pay and when it is due.", tab: "accounts", target: "#trip-charge-form" },
    { done: state.workspace.invites.some(item => item.status === "active"), title: "Create a traveler invitation", copy: "Create a friendly private link that sends travelers to the correct interest form.", tab: "communications", target: "#trip-invite-form" },
    { done: Boolean(trip.public_enabled && trip.interest_enabled), title: "Open the public trip for interest", copy: "Use Edit trip to make the dated trip visible and accept interest when its public information is ready.", action: "edit" },
  ];
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
  const next = steps.find(step => !step.done);
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
    const item = node("li", step.done ? "is-complete" : "", `${step.done ? "Complete: " : "To do: "}${step.title}`);
    list.append(item);
  });
}

function openNextGuideStep() {
  const step = state.guideSteps.find(item => !item.done);
  if (!step) return;
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
  const operational = activeCosts.reduce((sum, item) => sum + Number(item.actual_total > 0 ? item.actual_total : item.estimated_total), 0);
  const actual = activeCosts.reduce((sum, item) => sum + Number(item.actual_total || 0), 0);
  const externalCost = activeCosts.filter(item => item.settlement_route === "external").reduce((sum, item) => sum + Number(item.actual_total > 0 ? item.actual_total : item.estimated_total), 0);
  const hsCost = activeCosts.filter(item => item.settlement_route === "through_hs").reduce((sum, item) => sum + Number(item.actual_total > 0 ? item.actual_total : item.estimated_total), 0);
  const hsIncome = state.workspace.payments.filter(item => item.settlement_route === "through_hs" && item.status === "received" && item.purpose !== "refund").reduce((sum, item) => sum + Number(item.amount), 0);
  const externalFunding = state.workspace.payments.filter(item => item.settlement_route === "external" && item.status === "received").reduce((sum, item) => sum + Number(item.amount), 0);
  const adminRevenue = state.workspace.payments.filter(item => item.settlement_route === "through_hs" && item.status === "received" && item.purpose === "admin_fee").reduce((sum, item) => sum + Number(item.amount), 0);
  return { operational, actual, externalCost, hsCost, hsIncome, externalFunding, adminRevenue };
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
    [state.workspace.costs.length > 0, "Budget started"],
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
  form.querySelector("[data-cancel-edit]").hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderBudget() {
  const totals = financeTotals();
  document.querySelector("#trip-budget-summary").replaceChildren(
    metric("Operational plan", money(totals.operational)),
    metric("Actual costs", money(totals.actual)),
    metric("Paid externally", money(totals.externalCost)),
    metric("HS responsibility", money(totals.hsCost)),
    metric("Admin revenue", money(totals.adminRevenue)),
  );
  const list = document.querySelector("#trip-cost-list");
  list.replaceChildren();
  state.workspace.costs.forEach(item => {
    const allocations = state.workspace.allocations.filter(allocation => allocation.cost_item_id === item.id && allocation.status !== "canceled");
    const allocationText = allocations.length
      ? allocations.map(allocation => `${allocation.funding_source_name}: ${money(allocation.amount)} (${titleCase(allocation.status)})`).join("\n")
      : "No funding sources allocated yet.";
    list.append(record(
      `${item.category_name}: ${item.description}`,
      `${allocationText}${item.notes ? `\n${item.notes}` : ""}`,
      [
        `Estimated ${money(item.estimated_total)}`,
        `Actual ${money(item.actual_total)}`,
        item.settlement_route === "external" ? "Paid externally" : "Through HS",
        titleCase(item.payment_status),
        item.vendor_name || item.vendor_ministry_name || "",
      ],
      [{ label: "Edit", run: () => editCost(item) }, { label: "Remove", kind: "danger", run: () => removeResource("cost-items", item.id, item.description) }],
    ));
  });
  if (!state.workspace.costs.length) list.append(record("No costs entered", "Begin with airfare, lodging, ground transportation, meals, ministry support, and HS expenses."));
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

  document.querySelectorAll("[data-cancel-edit]").forEach(button => button.addEventListener("click", () => {
    button.form.reset();
    button.hidden = true;
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
document.querySelector("#trip-admin-signout").addEventListener("click", async () => {
  try { await api("/admin/logout", { method: "POST", body: "{}" }); } finally { state.csrfToken = ""; showLogin(); }
});

initializeGuidedHelp();
setupTabs();
wireForms();
establishSession();
