"use strict";

const API_BASE = "/api/interest/admin";
const adminEnvironmentBadge = document.querySelector("[data-admin-environment]");
const adminReturnLink = document.querySelector("[data-admin-return]");
const adminEnvironmentNote = document.querySelector("[data-admin-environment-note]");
const adminHostname = window.location.hostname.toLowerCase();
const isTestAdminHost = adminHostname === "test.hopesojourns.com"
  || adminHostname === "hopesojourns-test.pages.dev"
  || adminHostname.endsWith(".hopesojourns-test.pages.dev");
const isProductionAdminHost = ["hopesojourns.com", "www.hopesojourns.com", "hopesojourns.pages.dev"].includes(adminHostname);

if (adminEnvironmentBadge) {
  adminEnvironmentBadge.textContent = isTestAdminHost ? "Test portal" : isProductionAdminHost ? "Production portal" : "Preview portal";
}
if (adminReturnLink) {
  adminReturnLink.textContent = isTestAdminHost ? "Return to test site" : "Return to Hope Sojourns";
}
if (adminEnvironmentNote) {
  adminEnvironmentNote.textContent = isTestAdminHost
    ? "Private test environment · Go with Hope. Serve with Faith."
    : "Private response portal · Go with Hope. Serve with Faith.";
}

const loginPanel = document.querySelector("#login-panel");
const dashboardPanel = document.querySelector("#dashboard-panel");
const loginForm = document.querySelector("#admin-login-form");
const passwordInput = document.querySelector("#admin-password");
const loginStatus = document.querySelector("#login-status");
const accountMenu = document.querySelector("#admin-account-menu");
const changePasswordDialog = document.querySelector("#change-password-dialog");
const changePasswordForm = document.querySelector("#change-password-form");
const changePasswordStatus = document.querySelector("#change-password-status");
const currentPasswordInput = document.querySelector("#current-admin-password");
const peopleList = document.querySelector("#people-list");
const submissionsList = document.querySelector("#submissions-list");
const csmInboxViewTab = document.querySelector("#csm-inbox-view-tab");
const csmInboxWorkspace = document.querySelector("#csm-inbox-workspace");
const csmInboxList = document.querySelector("#csm-inbox-list");
const csmInboxFilter = document.querySelector("#csm-inbox-filter");
const csmInboxBadge = document.querySelector("#csm-inbox-badge");
const approveAllCsmInboxButton = document.querySelector("#approve-all-csm-inbox");
const viewCsmDonorsButton = document.querySelector("#view-csm-donors");
const csmGivingYear = document.querySelector("#csm-giving-year");
const csmGrossReceived = document.querySelector("#csm-gross-received");
const csmNetReceived = document.querySelector("#csm-net-received");
const csmDonationCount = document.querySelector("#csm-donation-count");
const csmGiverCount = document.querySelector("#csm-giver-count");
const csmSentTotal = document.querySelector("#csm-sent-total");
const peopleGrid = document.querySelector("#people-grid");
const teamsWorkspace = document.querySelector("#teams-workspace");
const teamsList = document.querySelector("#teams-list");
const teamCreateForm = document.querySelector("#team-create-form");
const teamCreateStatus = document.querySelector("#team-create-status");
const ministriesWorkspace = document.querySelector("#ministries-workspace");
const ministriesList = document.querySelector("#ministries-list");
const ministryCreateForm = document.querySelector("#ministry-create-form");
const ministryCreateStatus = document.querySelector("#ministry-create-status");
const contactToolbar = document.querySelector("#contact-toolbar");
const addContactButton = document.querySelector("#add-contact");
const importContactsButton = document.querySelector("#import-contacts");
const contactImportDialog = document.querySelector("#contact-import-dialog");
const closeContactImportDialog = document.querySelector("#close-contact-import-dialog");
const contactImportForm = document.querySelector("#contact-import-form");
const contactImportFile = document.querySelector("#contact-import-file");
const previewContactImportButton = document.querySelector("#preview-contact-import");
const contactImportStatus = document.querySelector("#contact-import-status");
const contactImportPreview = document.querySelector("#contact-import-preview");
const contactImportFileName = document.querySelector("#contact-import-file-name");
const contactImportCreates = document.querySelector("#contact-import-creates");
const contactImportUpdates = document.querySelector("#contact-import-updates");
const contactImportErrors = document.querySelector("#contact-import-errors");
const contactImportHelp = document.querySelector("#contact-import-help");
const contactImportTableShell = document.querySelector("#contact-import-table-shell");
const chooseAnotherImportButton = document.querySelector("#choose-another-import");
const commitContactImportButton = document.querySelector("#commit-contact-import");
const submissionsEmpty = document.querySelector("#submissions-empty");
const submissionsStatus = document.querySelector("#submissions-status");
const filterForm = document.querySelector("#submission-filters");
const opportunityFilter = document.querySelector("#opportunity-filter");
const teamFilter = document.querySelector("#team-filter");
const contactTypeFilter = document.querySelector("#contact-type-filter");
const contactAreaFilter = document.querySelector("#contact-area-filter");
const resultsCount = document.querySelector("#results-count");
const recordsTitle = document.querySelector("#records-title");
const peopleViewTab = document.querySelector("#people-view-tab");
const requestsViewTab = document.querySelector("#requests-view-tab");
const gridViewTab = document.querySelector("#grid-view-tab");
const teamsViewTab = document.querySelector("#teams-view-tab");
const ministriesViewTab = document.querySelector("#ministries-view-tab");
const internshipToolkitViewTab = document.querySelector("#internship-toolkit-view-tab");
const internshipToolkitWorkspace = document.querySelector("#internship-toolkit-workspace");
const previousPage = document.querySelector("#previous-page");
const nextPage = document.querySelector("#next-page");
const pageLabel = document.querySelector("#page-label");
const recordsPagination = document.querySelector("#records-pagination");
const exportButton = document.querySelector("#export-submissions");
const submissionDialog = document.querySelector("#submission-dialog");
const submissionDetail = document.querySelector("#submission-detail");
const detailStatus = document.querySelector("#detail-status");
const detailTitle = document.querySelector("#detail-title");
const detailEyebrow = document.querySelector("#detail-eyebrow");

const state = {
  csrfToken: "",
  page: 1,
  pages: 1,
  view: "people",
  currentRecordId: "",
  filterOptions: {},
  contactImportFile: null,
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatDate(value, includeTime = true) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-US", includeTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }).format(date);
}

function titleCase(value) {
  return String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

const CONTACT_TYPE_LABELS = {
  prospective_traveler: "Prospective Traveler",
  traveler: "Traveler",
  leader: "Leader",
  donor: "Donor",
  ministry_contact: "Ministry Contact",
  staff: "Hope Sojourns Staff",
  volunteer: "Volunteer",
  other: "Other",
};

function contactTypeLabel(value) {
  return CONTACT_TYPE_LABELS[value] || titleCase(value);
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function setBusy(button, busy, busyText) {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
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

async function api(path, options = {}) {
  const method = options.method || "GET";
  const headers = new Headers(options.headers || {});
  const isFormData = options.body instanceof FormData;
  headers.set("Accept", "application/json");
  if (options.body !== undefined && !isFormData) headers.set("Content-Type", "application/json");
  if (method !== "GET" && path !== "/login" && state.csrfToken) headers.set("X-CSRF-Token", state.csrfToken);
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: "same-origin",
    body: options.body === undefined ? undefined : isFormData ? options.body : JSON.stringify(options.body),
  });
  let result = {};
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try { result = await response.json(); } catch { result = {}; }
  }
  if (!response.ok) {
    if (response.status === 401 && path !== "/login") showLogin("Your session ended. Sign in again.");
    const error = new Error(result.error || "The portal could not complete that request.");
    error.status = response.status;
    error.code = result.code;
    throw error;
  }
  return { result, response };
}

function showLogin(message = "") {
  state.csrfToken = "";
  dashboardPanel.hidden = true;
  loginPanel.hidden = false;
  loginStatus.textContent = message;
  loginForm.reset();
  if (submissionDialog.open) submissionDialog.close();
  if (contactImportDialog.open) contactImportDialog.close();
  if (changePasswordDialog.open) changePasswordDialog.close();
  accountMenu.open = false;
  resetPasswordVisibility(loginForm);
  passwordInput.focus();
}

function showDashboard(session) {
  state.csrfToken = session.csrfToken;
  loginPanel.hidden = true;
  dashboardPanel.hidden = false;
  loginStatus.textContent = "";
  document.querySelector("#dashboard-title").focus?.();
  loadRecords();
}

function statusPill(status) {
  return element("span", `admin-status-pill admin-status-${status}`, titleCase(status));
}

function interestPill(interest) {
  const pill = element("span", "admin-interest-pill");
  pill.append(element("span", "", interest.kind === "internship" ? "Internship" : "Trip"));
  pill.append(document.createTextNode(` · ${interest.title}`));
  return pill;
}

function teamPill(team) {
  return element("span", "admin-interest-pill admin-team-pill", team.name);
}

function appendInterests(container, interests, limit = 3) {
  interests.slice(0, limit).forEach(item => {
    container.append(interestPill(item));
    container.append(statusPill(item.status));
  });
  if (interests.length > limit) container.append(element("span", "admin-interest-pill", `+${interests.length - limit} more`));
}

function renderPersonCard(person) {
  const card = element("button", "admin-request-card admin-person-card");
  card.type = "button";
  card.setAttribute("aria-label", `Open complete record for ${person.firstName} ${person.lastName}`);
  card.addEventListener("click", () => openPerson(person.id));

  const identity = element("span", "admin-request-person");
  identity.append(element("strong", "", `${person.firstName} ${person.lastName}`));
  identity.append(element("small", "", person.organization || "No organization recorded"));
  identity.append(element("small", "", `Updated ${formatDate(person.latestActivityAt || person.updatedAt)}`));

  const contact = element("span", "admin-request-contact");
  contact.append(element("span", "", person.email || "No email address"));
  contact.append(element("small", "", person.phone || "No cell number"));

  const interests = element("span", "admin-request-interests");
  (person.contactTypes || []).slice(0, 3).forEach(type => interests.append(element("span", "admin-interest-pill", contactTypeLabel(type))));
  if (!(person.contactTypes || []).length) interests.append(element("span", "admin-interest-pill", "Contact"));
  if (person.languages?.length) interests.append(element("span", "admin-interest-pill", person.languages.join(", ")));

  const activity = element("span", "admin-person-activity");
  activity.append(element("strong", "", plural(person.submissionCount, "request")));
  activity.append(element("small", "", person.replyCount ? plural(person.replyCount, "saved reply") : "No reply prepared"));

  const arrow = element("span", "admin-request-arrow", "→");
  arrow.setAttribute("aria-hidden", "true");
  arrow.append(element("small", "", "View everything"));
  card.append(identity, contact, interests, activity, arrow);
  return card;
}

function renderSubmissionCard(submission) {
  const card = element("button", "admin-request-card");
  card.type = "button";
  card.setAttribute("aria-label", `Open request from ${submission.firstName} ${submission.lastName}`);
  card.addEventListener("click", () => openSubmission(submission.id));

  const person = element("span", "admin-request-person");
  person.append(element("strong", "", `${submission.firstName} ${submission.lastName}`));
  person.append(element("small", "", formatDate(submission.createdAt)));

  const contact = element("span", "admin-request-contact");
  contact.append(element("span", "", submission.email));
  contact.append(element("small", "", submission.phone || `Prefers ${titleCase(submission.contactPreference).toLowerCase()}`));

  const interests = element("span", "admin-request-interests");
  appendInterests(interests, submission.interests);

  const arrow = element("span", "admin-request-arrow", "→");
  arrow.setAttribute("aria-hidden", "true");
  arrow.append(element("small", "", submission.replyCount ? plural(submission.replyCount, "saved reply") : "Open request"));
  card.append(person, contact, interests, arrow);
  return card;
}

function gridCell(row, value, className = "") {
  const cell = element("td", className, value);
  row.append(cell);
  return cell;
}

function renderPeopleGrid(people) {
  const table = element("table", "admin-data-grid");
  table.append(element("caption", "", "Filtered people records. Select a person's name to open their complete record."));
  const head = document.createElement("thead");
  const headingRow = document.createElement("tr");
  ["Name", "Organization", "Contact type", "Email", "Cell phone", "Languages", "Hope Sojourns area", "Trips", "Teams", "Latest activity", "Requests"].forEach(label => {
    const heading = element("th", "", label);
    heading.scope = "col";
    headingRow.append(heading);
  });
  head.append(headingRow);

  const body = document.createElement("tbody");
  people.forEach(person => {
    const row = document.createElement("tr");
    const nameCell = gridCell(row, "");
    const name = element("button", "admin-grid-name", `${person.firstName} ${person.lastName}`);
    name.type = "button";
    name.setAttribute("aria-label", `Open complete record for ${person.firstName} ${person.lastName}`);
    name.addEventListener("click", () => openPerson(person.id));
    nameCell.append(name);

    gridCell(row, person.organization || "—", person.organization ? "" : "admin-grid-muted");
    gridCell(row, (person.contactTypes || []).map(contactTypeLabel).join(", ") || "—", person.contactTypes?.length ? "" : "admin-grid-muted");
    const emailCell = gridCell(row, "");
    if (person.email) {
      const email = element("a", "admin-grid-email", person.email);
      email.href = `mailto:${person.email}`;
      emailCell.append(email);
    } else emailCell.append(element("span", "admin-grid-muted", "—"));
    gridCell(row, person.phone || "—", person.phone ? "" : "admin-grid-muted");
    gridCell(row, (person.languages || []).join(", ") || "—", person.languages?.length ? "" : "admin-grid-muted");
    gridCell(row, (person.areas || []).map(titleCase).join(", ") || "—", person.areas?.length ? "" : "admin-grid-muted");
    gridCell(row, (person.trips || []).map(trip => trip.title).join(", ") || "—", person.trips?.length ? "" : "admin-grid-muted");
    const teamsCell = gridCell(row, "");
    const teamList = element("div", "admin-request-interests");
    if (person.teams?.length) person.teams.forEach(team => teamList.append(teamPill(team)));
    else teamList.append(element("span", "admin-grid-muted", "Unassigned"));
    teamsCell.append(teamList);
    gridCell(row, formatDate(person.latestActivityAt || person.updatedAt));
    gridCell(row, String(person.submissionCount), "admin-grid-count");
    body.append(row);
  });
  table.append(head, body);
  return table;
}

function renderSummary(summary) {
  document.querySelector("#summary-submissions").textContent = summary.submissions || 0;
  document.querySelector("#summary-people").textContent = summary.people || 0;
  document.querySelector("#summary-interests").textContent = summary.interests || 0;
  document.querySelector("#summary-new").textContent = summary.new_interests || 0;
  document.querySelector("#summary-replies").textContent = summary.sent_replies || 0;
  document.querySelector("#summary-ministries").textContent = summary.ministries || 0;
}

function filterQuery() {
  const formData = new FormData(filterForm);
  const params = new URLSearchParams({ page: String(state.page), pageSize: "25" });
  for (const key of ["search", "status", "kind", "opportunity", "contactPreference", "replyState", "team", "contactType", "contactArea", "dateFrom", "dateTo", "sort"]) {
    const value = String(formData.get(key) || "").trim();
    if (value) params.set(key, value);
  }
  return params;
}

function populateOpportunityFilter(filterOptions = {}) {
  state.filterOptions = filterOptions;
  const opportunities = Array.isArray(filterOptions.opportunities) ? filterOptions.opportunities : [];
  const selected = opportunityFilter.value;
  const firstOption = element("option", "", "Every opportunity");
  firstOption.value = "";
  const groups = new Map();
  for (const opportunity of opportunities) {
    const kind = opportunity.kind === "internship" ? "Internships" : "Trips";
    if (!groups.has(kind)) {
      const group = document.createElement("optgroup");
      group.label = kind;
      groups.set(kind, group);
    }
    const option = element("option", "", opportunity.location
      ? `${opportunity.title} — ${opportunity.location}`
      : opportunity.title);
    option.value = opportunity.slug;
    groups.get(kind).append(option);
  }
  opportunityFilter.replaceChildren(firstOption, ...groups.values());
  if ([...opportunityFilter.options].some(option => option.value === selected)) opportunityFilter.value = selected;

  const selectedTeam = teamFilter.value;
  const everyTeam = element("option", "", "Every team");
  everyTeam.value = "";
  const unassigned = element("option", "", "Not assigned to a team");
  unassigned.value = "unassigned";
  const teamOptions = (Array.isArray(filterOptions.teams) ? filterOptions.teams : []).map(team => {
    const option = element("option", "", team.name);
    option.value = team.id;
    return option;
  });
  teamFilter.replaceChildren(everyTeam, unassigned, ...teamOptions);
  if ([...teamFilter.options].some(option => option.value === selectedTeam)) teamFilter.value = selectedTeam;

  const selectedType = contactTypeFilter.value;
  const everyType = element("option", "", "Every contact type");
  everyType.value = "";
  const contactTypes = (Array.isArray(filterOptions.contactTypes) ? filterOptions.contactTypes : []).map(type => {
    const option = element("option", "", type.label);
    option.value = type.value;
    return option;
  });
  contactTypeFilter.replaceChildren(everyType, ...contactTypes);
  if ([...contactTypeFilter.options].some(option => option.value === selectedType)) contactTypeFilter.value = selectedType;

  const selectedArea = contactAreaFilter.value;
  const everyArea = element("option", "", "Mission, intern, and corporate");
  everyArea.value = "";
  const contactAreas = (Array.isArray(filterOptions.contactAreas) ? filterOptions.contactAreas : []).map(area => {
    const option = element("option", "", area.label);
    option.value = area.value;
    return option;
  });
  contactAreaFilter.replaceChildren(everyArea, ...contactAreas);
  if ([...contactAreaFilter.options].some(option => option.value === selectedArea)) contactAreaFilter.value = selectedArea;

  const dateFrom = filterForm.elements.dateFrom;
  const dateTo = filterForm.elements.dateTo;
  if (filterOptions.earliestDate) {
    dateFrom.min = String(filterOptions.earliestDate).slice(0, 10);
    dateTo.min = String(filterOptions.earliestDate).slice(0, 10);
  }
  if (filterOptions.latestDate) {
    dateFrom.max = String(filterOptions.latestDate).slice(0, 10);
    dateTo.max = String(filterOptions.latestDate).slice(0, 10);
  }
}

function applyResultMeta(result, recordCount, unit, pluralUnit) {
  submissionsEmpty.hidden = recordCount > 0;
  renderSummary(result.summary);
  populateOpportunityFilter(result.filterOptions);
  state.page = result.pagination.page;
  state.pages = result.pagination.pages;
  pageLabel.textContent = `Page ${state.page} of ${state.pages}`;
  previousPage.disabled = state.page <= 1;
  nextPage.disabled = state.page >= state.pages;
  resultsCount.textContent = plural(result.pagination.total, unit, pluralUnit);
}

function applyListResult(result, records, renderCard, unit, pluralUnit) {
  const list = state.view === "people" ? peopleList : submissionsList;
  list.replaceChildren(...records.map(renderCard));
  applyResultMeta(result, records.length, unit, pluralUnit);
}

function csmMoney(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

function csmMeta(label, value) {
  const item = element("div");
  item.append(element("span", "", label), element("strong", "", value || "Not provided"));
  return item;
}

function csmInput(labelText, name, value, required = false) {
  const label = element("label");
  label.append(element("span", "", labelText));
  const input = document.createElement("input");
  input.name = name;
  input.value = value || "";
  input.required = required;
  label.append(input);
  return label;
}

function csmNameParts(displayName) {
  const parts = String(displayName || "").trim().split(/\s+/).filter(Boolean);
  return { firstName: parts.shift() || "", lastName: parts.join(" ") };
}

function csmApprovalBody(message) {
  if (message.direction !== "received") return {};
  if (message.matchedPerson?.id) return { personId: message.matchedPerson.id };
  const names = csmNameParts(message.displayName);
  return {
    donor: {
      firstName: names.firstName,
      lastName: names.lastName,
      email: message.party.email,
      phone: message.party.phone,
    },
  };
}

function renderCsmGivingSummary(summary = {}) {
  const year = Number(summary.year) || new Date().getFullYear();
  csmGivingYear.textContent = `${year} gross received`;
  csmGrossReceived.textContent = csmMoney(summary.grossReceived);
  csmNetReceived.textContent = csmMoney(summary.netReceived);
  csmDonationCount.textContent = String(Number(summary.donations || 0));
  csmGiverCount.textContent = String(Number(summary.givers || 0));
  csmSentTotal.textContent = csmMoney(summary.sent);
}

function renderCsmCard(message) {
  const card = element("article", "admin-csm-card");
  const header = element("header");
  const heading = element("div");
  heading.append(element("h3", "", message.displayName));
  heading.append(element("span", "", `${titleCase(message.direction)} · received by Hope ${formatDate(message.receivedAt)}`));
  const status = statusPill(message.status);
  header.append(heading, status, element("span", "admin-csm-amount", csmMoney(message.transaction.gross)));

  const meta = element("div", "admin-csm-meta");
  meta.append(
    csmMeta("Display Name", message.displayName),
    csmMeta("PayPal date", formatDate(message.transaction.eventDate)),
    csmMeta("Item", message.transaction.itemName || message.transaction.itemId || "No item supplied"),
    csmMeta("Email", message.party.email || "Not supplied"),
  );
  card.append(header, meta);

  if (["pending", "needs_match", "failed"].includes(message.status)) {
    const form = element("form", "admin-csm-review");
    let personSelect = null;
    if (message.direction === "received") {
      const people = new Map();
      if (message.matchedPerson) people.set(message.matchedPerson.id, message.matchedPerson);
      (message.candidates || []).forEach(person => people.set(person.id, {
        id: person.id, firstName: person.first_name, lastName: person.last_name, email: person.email,
      }));
      if (people.size) {
        const label = element("label", "admin-csm-person-select");
        label.append(element("span", "", "Existing donor match"));
        personSelect = document.createElement("select");
        const create = element("option", "", "Create a new donor instead");
        create.value = "";
        personSelect.append(create);
        for (const person of people.values()) {
          const option = element("option", "", `${person.firstName} ${person.lastName} · ${person.email}`);
          option.value = person.id;
          option.selected = person.id === message.matchedPerson?.id;
          personSelect.append(option);
        }
        label.append(personSelect);
        form.append(label);
      }
      const names = csmNameParts(message.displayName);
      form.append(
        csmInput("First name", "firstName", names.firstName),
        csmInput("Last name", "lastName", names.lastName),
        csmInput("Email", "email", message.party.email),
        csmInput("Phone", "phone", message.party.phone),
      );
    }
    const approve = element("button", "admin-button admin-button-primary", message.direction === "received" ? "Approve gift" : "Approve sent payment");
    approve.type = "submit";
    form.append(approve);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      setBusy(approve, true, "Approving…");
      try {
        const formData = new FormData(form);
        const personId = personSelect?.value || "";
        const body = personId ? { personId } : message.direction === "received" ? {
          donor: {
            firstName: formData.get("firstName"), lastName: formData.get("lastName"),
            email: formData.get("email"), phone: formData.get("phone"),
          },
        } : {};
        const { result } = await api(`/csm-inbox/${message.id}/approve`, { method: "POST", body });
        await loadCsmInbox();
        submissionsStatus.textContent = `${message.displayName} was approved.${result.createdPerson ? " A new donor was added to People." : ""}`;
      } catch (error) {
        submissionsStatus.textContent = error.message;
      } finally {
        setBusy(approve, false);
      }
    });
    card.append(form);

    const actions = element("div", "admin-csm-actions");
    const note = message.matchedPerson
      ? `Matched to ${message.matchedPerson.firstName} ${message.matchedPerson.lastName} by ${titleCase(message.matchMethod)}.`
      : message.direction === "received" ? "Confirm an existing donor or complete the new donor fields." : "Sent payments do not create donor records.";
    actions.append(element("span", message.status === "needs_match" ? "admin-csm-warning" : "", note));
    const deny = element("button", "admin-button admin-button-outline", "Deny");
    deny.type = "button";
    deny.addEventListener("click", async () => {
      const reason = window.prompt("Why should this transaction be denied?");
      if (!reason?.trim()) return;
      setBusy(deny, true, "Denying…");
      try {
        await api(`/csm-inbox/${message.id}/deny`, { method: "POST", body: { reason } });
        submissionsStatus.textContent = `${message.displayName} was denied.`;
        await loadCsmInbox();
      } catch (error) {
        submissionsStatus.textContent = error.message;
      } finally {
        setBusy(deny, false);
      }
    });
    actions.append(deny);
    card.append(actions);
  } else {
    card.append(element("p", "", message.status === "approved"
      ? `Approved into the Hope Sojourns ledger${message.matchedPerson ? ` for ${message.matchedPerson.firstName} ${message.matchedPerson.lastName}` : ""}.`
      : `Denied: ${message.decisionReason || "No reason recorded"}`));
  }

  if (message.callbackStatus === "failed") {
    const callback = element("div", "admin-csm-actions");
    callback.append(element("span", "admin-csm-warning", `CSM status update needs retry: ${message.callbackError || "Unknown error"}`));
    const retry = element("button", "admin-button admin-button-outline", "Retry CSM update");
    retry.type = "button";
    retry.addEventListener("click", async () => {
      setBusy(retry, true, "Retrying…");
      try { await api(`/csm-inbox/${message.id}/notify`, { method: "POST", body: {} }); await loadCsmInbox(); }
      catch (error) { submissionsStatus.textContent = error.message; }
      finally { setBusy(retry, false); }
    });
    callback.append(retry);
    card.append(callback);
  }
  return card;
}

function updateCsmBadge(counts = {}) {
  const open = Number(counts.pending || 0) + Number(counts.needs_match || 0) + Number(counts.failed || 0);
  csmInboxBadge.textContent = String(open);
  approveAllCsmInboxButton.disabled = open === 0;
  approveAllCsmInboxButton.textContent = open
    ? `Approve all awaiting (${open})` : "All transactions reviewed";
  return open;
}

async function loadCsmInbox() {
  submissionsStatus.textContent = "Loading CSM transactions…";
  csmInboxList.setAttribute("aria-busy", "true");
  try {
    const { result } = await api(`/csm-inbox?status=${encodeURIComponent(csmInboxFilter.value)}`);
    renderCsmGivingSummary(result.givingSummary);
    const cards = result.messages.map(renderCsmCard);
    if (!cards.length) {
      const empty = element("article", "admin-csm-card");
      empty.append(element("h3", "", "No transactions in this view"), element("p", "", "New CSM transactions will appear here for review."));
      cards.push(empty);
    }
    csmInboxList.replaceChildren(...cards);
    const open = updateCsmBadge(result.counts);
    resultsCount.textContent = plural(result.messages.length, "transaction");
    submissionsStatus.textContent = open ? `${plural(open, "transaction")} awaiting review.` : "The CSM inbox is clear.";
  } catch (error) {
    if (error.status !== 401) submissionsStatus.textContent = error.message;
  } finally {
    csmInboxList.removeAttribute("aria-busy");
  }
}

async function approveAllCsmInbox() {
  if (approveAllCsmInboxButton.disabled) return;
  const originalText = approveAllCsmInboxButton.textContent;
  let latestCounts = null;
  let reloaded = false;
  approveAllCsmInboxButton.disabled = true;
  approveAllCsmInboxButton.setAttribute("aria-busy", "true");
  try {
    let { result: page } = await api("/csm-inbox?status=open");
    latestCounts = page.counts;
    const total = Number(page.counts?.pending || 0)
      + Number(page.counts?.needs_match || 0) + Number(page.counts?.failed || 0);
    if (!total) {
      await loadCsmInbox();
      reloaded = true;
      return;
    }
    const confirmed = window.confirm(
      `Approve all ${total} awaiting Hope Sojourns transactions? Received gifts will be linked to an existing Person or create a new donor in People. Sent payments will not create People.`,
    );
    if (!confirmed) return;

    const processed = new Set();
    const failures = [];
    let approved = 0;
    let createdPeople = 0;
    while (processed.size < 5000) {
      const messages = page.messages.filter(message => !processed.has(message.id));
      if (!messages.length) break;
      for (const message of messages) {
        processed.add(message.id);
        approveAllCsmInboxButton.textContent = `Approving ${Math.min(processed.size, total)} of ${total}…`;
        try {
          const { result } = await api(`/csm-inbox/${message.id}/approve`, {
            method: "POST",
            body: csmApprovalBody(message),
          });
          approved += 1;
          if (result.createdPerson) createdPeople += 1;
        } catch (error) {
          failures.push({ name: message.displayName, error: error.message || "Approval failed" });
        }
      }
      ({ result: page } = await api("/csm-inbox?status=open"));
      latestCounts = page.counts;
    }

    await loadCsmInbox();
    reloaded = true;
    const remaining = Number(csmInboxBadge.textContent || 0);
    submissionsStatus.textContent = [
      `${approved} transaction${approved === 1 ? "" : "s"} approved.`,
      createdPeople ? `${createdPeople} new donor${createdPeople === 1 ? "" : "s"} added to People.` : "",
      remaining ? `${remaining} transaction${remaining === 1 ? "" : "s"} still need attention.` : "The queue is clear.",
    ].filter(Boolean).join(" ");
  } catch (error) {
    submissionsStatus.textContent = error.message || "The awaiting transactions could not be approved.";
  } finally {
    approveAllCsmInboxButton.removeAttribute("aria-busy");
    if (!reloaded && latestCounts) updateCsmBadge(latestCounts);
    else if (!reloaded) approveAllCsmInboxButton.textContent = originalText;
    approveAllCsmInboxButton.disabled = Number(csmInboxBadge.textContent || 0) === 0;
  }
}

async function refreshCsmBadge() {
  try {
    const { result } = await api("/csm-inbox?status=open");
    updateCsmBadge(result.counts);
  } catch { /* The current workspace still remains usable. */ }
}

function viewCsmDonors() {
  filterForm.reset();
  if (![...contactTypeFilter.options].some(option => option.value === "donor")) {
    const option = element("option", "", "Donor");
    option.value = "donor";
    contactTypeFilter.append(option);
  }
  contactTypeFilter.value = "donor";
  filterForm.elements.sort.value = "newest";
  switchView("people", true);
}

async function loadPeople() {
  submissionsStatus.textContent = "Loading people…";
  peopleList.setAttribute("aria-busy", "true");
  try {
    const { result } = await api(`/people?${filterQuery()}`);
    applyListResult(result, result.people, renderPersonCard, "person", "people");
    submissionsStatus.textContent = "";
  } catch (error) {
    if (error.status !== 401) submissionsStatus.textContent = error.message;
  } finally {
    peopleList.removeAttribute("aria-busy");
  }
}

async function loadSubmissions() {
  submissionsStatus.textContent = "Loading requests…";
  submissionsList.setAttribute("aria-busy", "true");
  try {
    const { result } = await api(`/submissions?${filterQuery()}`);
    applyListResult(result, result.submissions, renderSubmissionCard, "request", "requests");
    submissionsStatus.textContent = "";
  } catch (error) {
    if (error.status !== 401) submissionsStatus.textContent = error.message;
  } finally {
    submissionsList.removeAttribute("aria-busy");
  }
}

async function loadPeopleGrid() {
  submissionsStatus.textContent = "Loading spreadsheet…";
  peopleGrid.setAttribute("aria-busy", "true");
  try {
    const { result } = await api(`/people?${filterQuery()}`);
    peopleGrid.replaceChildren(renderPeopleGrid(result.people));
    applyResultMeta(result, result.people.length, "person", "people");
    submissionsStatus.textContent = "";
  } catch (error) {
    if (error.status !== 401) submissionsStatus.textContent = error.message;
  } finally {
    peopleGrid.removeAttribute("aria-busy");
  }
}

function renderTeamCard(team) {
  const card = element("article", "admin-team-card");
  const header = element("header");
  header.append(element("h3", "", team.name), statusPill(team.status));
  const description = element("p", "", team.description || "No team description has been added yet.");
  const footer = element("footer");
  const activity = element("span", "", `${plural(team.memberCount, "member")} · ${team.latestAssignmentAt ? `Updated ${formatDate(team.latestAssignmentAt, false)}` : "Ready for applicants"}`);
  const open = element("button", "admin-button admin-button-outline", "View team");
  open.type = "button";
  open.addEventListener("click", () => openTeam(team.id));
  footer.append(activity, open);
  card.append(header, description, footer);
  return card;
}

async function loadTeams() {
  submissionsStatus.textContent = "Loading teams…";
  teamsList.setAttribute("aria-busy", "true");
  try {
    const { result } = await api("/teams");
    teamsList.replaceChildren(...result.teams.map(renderTeamCard));
    if (!result.teams.length) {
      const empty = element("article", "admin-team-card");
      empty.append(element("h3", "", "No teams yet"), element("p", "", "Create the first team above, then assign applicants from their records."));
      teamsList.append(empty);
    }
    resultsCount.textContent = plural(result.teams.length, "team");
    submissionsStatus.textContent = "";
  } catch (error) {
    if (error.status !== 401) submissionsStatus.textContent = error.message;
  } finally {
    teamsList.removeAttribute("aria-busy");
  }
}

function renderMinistryCard(ministry) {
  const card = element("article", "admin-team-card admin-ministry-card");
  const header = element("header");
  header.append(element("h3", "", ministry.name), statusPill(ministry.status));
  const location = [ministry.city, ministry.region, ministry.country].filter(Boolean).join(", ");
  const description = element("p", "", ministry.description || "No ministry description has been added yet.");
  const footer = element("footer");
  const activity = element("span", "", `${plural(ministry.contactCount, "contact")} · ${plural(ministry.opportunityCount, "trip")} · ${location || "Location not recorded"}`);
  const open = element("button", "admin-button admin-button-outline", "View ministry");
  open.type = "button";
  open.addEventListener("click", () => openMinistry(ministry.id));
  footer.append(activity, open);
  card.append(header, description, footer);
  return card;
}

async function loadMinistries() {
  submissionsStatus.textContent = "Loading ministries…";
  ministriesList.setAttribute("aria-busy", "true");
  try {
    const { result } = await api("/ministries");
    ministriesList.replaceChildren(...result.ministries.map(renderMinistryCard));
    if (!result.ministries.length) {
      const empty = element("article", "admin-team-card");
      empty.append(element("h3", "", "No ministries yet"), element("p", "", "Create the first ministry above, then connect contacts and trips."));
      ministriesList.append(empty);
    }
    resultsCount.textContent = plural(result.ministries.length, "ministry", "ministries");
    submissionsStatus.textContent = "";
  } catch (error) {
    if (error.status !== 401) submissionsStatus.textContent = error.message;
  } finally {
    ministriesList.removeAttribute("aria-busy");
  }
}

async function loadRecords() {
  previousPage.disabled = true;
  nextPage.disabled = true;
  if (state.view === "people") await loadPeople();
  else if (state.view === "requests") await loadSubmissions();
  else if (state.view === "grid") await loadPeopleGrid();
  else if (state.view === "csm-inbox") await loadCsmInbox();
  else if (state.view === "teams") await loadTeams();
  else if (state.view === "ministries") await loadMinistries();
  else {
    resultsCount.textContent = "13 working documents";
    submissionsStatus.textContent = "";
  }
  if (state.view !== "csm-inbox") await refreshCsmBadge();
}

function switchView(view, focusTab = false) {
  state.view = view;
  state.page = 1;
  const showPeople = view === "people";
  const showRequests = view === "requests";
  const showGrid = view === "grid";
  const showCsmInbox = view === "csm-inbox";
  const showTeams = view === "teams";
  const showMinistries = view === "ministries";
  const showInternshipToolkit = view === "internship-toolkit";
  peopleViewTab.classList.toggle("is-active", showPeople);
  peopleViewTab.setAttribute("aria-selected", String(showPeople));
  peopleViewTab.tabIndex = showPeople ? 0 : -1;
  requestsViewTab.classList.toggle("is-active", showRequests);
  requestsViewTab.setAttribute("aria-selected", String(showRequests));
  requestsViewTab.tabIndex = showRequests ? 0 : -1;
  gridViewTab.classList.toggle("is-active", showGrid);
  gridViewTab.setAttribute("aria-selected", String(showGrid));
  gridViewTab.tabIndex = showGrid ? 0 : -1;
  csmInboxViewTab.classList.toggle("is-active", showCsmInbox);
  csmInboxViewTab.setAttribute("aria-selected", String(showCsmInbox));
  csmInboxViewTab.tabIndex = showCsmInbox ? 0 : -1;
  teamsViewTab.classList.toggle("is-active", showTeams);
  teamsViewTab.setAttribute("aria-selected", String(showTeams));
  teamsViewTab.tabIndex = showTeams ? 0 : -1;
  ministriesViewTab.classList.toggle("is-active", showMinistries);
  ministriesViewTab.setAttribute("aria-selected", String(showMinistries));
  ministriesViewTab.tabIndex = showMinistries ? 0 : -1;
  internshipToolkitViewTab.classList.toggle("is-active", showInternshipToolkit);
  internshipToolkitViewTab.setAttribute("aria-selected", String(showInternshipToolkit));
  internshipToolkitViewTab.tabIndex = showInternshipToolkit ? 0 : -1;
  peopleList.hidden = !showPeople;
  contactToolbar.hidden = !showPeople;
  submissionsList.hidden = !showRequests;
  peopleGrid.hidden = !showGrid;
  csmInboxWorkspace.hidden = !showCsmInbox;
  teamsWorkspace.hidden = !showTeams;
  ministriesWorkspace.hidden = !showMinistries;
  internshipToolkitWorkspace.hidden = !showInternshipToolkit;
  filterForm.hidden = showCsmInbox || showTeams || showMinistries || showInternshipToolkit;
  recordsPagination.hidden = showCsmInbox || showTeams || showMinistries || showInternshipToolkit;
  exportButton.hidden = showCsmInbox || showTeams || showMinistries || showInternshipToolkit;
  submissionsEmpty.hidden = true;
  recordsTitle.textContent = showPeople ? "Master contacts" : showRequests ? "Individual requests" : showGrid ? "Contact spreadsheet" : showCsmInbox ? "CSM transaction inbox" : showTeams ? "Teams" : showMinistries ? "Ministries" : "Internship toolkit";
  if (focusTab) (showPeople ? peopleViewTab : showRequests ? requestsViewTab : showGrid ? gridViewTab : showCsmInbox ? csmInboxViewTab : showTeams ? teamsViewTab : showMinistries ? ministriesViewTab : internshipToolkitViewTab).focus();
  loadRecords();
}

function detailList(items) {
  const list = element("ul", "admin-detail-list");
  items.forEach(([label, value]) => {
    const item = element("li");
    item.append(element("span", "", label), element("strong", "", value || "Not provided"));
    list.append(item);
  });
  return list;
}

function detailReload(recordType, recordId) {
  return recordType === "person" ? loadPersonDetail(recordId) : loadSubmissionDetail(recordId);
}

function createInterestRow(record, interest, recordType) {
  const row = element("div", "admin-interest-row");
  const copy = element("div", "admin-interest-copy");
  copy.append(element("strong", "", interest.title));
  const details = [titleCase(interest.kind), interest.location, interest.partner, interest.duration].filter(Boolean).join(" · ");
  copy.append(element("span", "", details));

  const controls = element("div", "admin-interest-status");
  const select = document.createElement("select");
  select.setAttribute("aria-label", `Follow-up status for ${interest.title}`);
  ["new", "contacted", "exploring", "closed"].forEach(status => {
    const option = element("option", "", titleCase(status));
    option.value = status;
    option.selected = status === interest.status;
    select.append(option);
  });
  const save = element("button", "admin-button admin-button-quiet", "Save");
  save.type = "button";
  save.addEventListener("click", async () => {
    const submissionId = recordType === "person" ? record.latestSubmissionId : record.id;
    if (!submissionId) {
      detailStatus.textContent = "A request is required before this status can be updated.";
      return;
    }
    setBusy(save, true, "Saving…");
    detailStatus.textContent = "";
    try {
      await api(`/submissions/${submissionId}/status`, {
        method: "POST",
        body: { interestId: interest.id, status: select.value },
      });
      detailStatus.textContent = `${interest.title} is now ${titleCase(select.value).toLowerCase()}.`;
      await Promise.all([detailReload(recordType, record.id), loadRecords()]);
    } catch (error) {
      detailStatus.textContent = error.message;
    } finally {
      setBusy(save, false);
    }
  });
  controls.append(select, save);
  row.append(copy, controls);
  return row;
}

function createReplyItem(reply, record, recordType) {
  const item = element("article", "admin-reply-item");
  const header = element("header");
  header.append(element("h4", "", reply.subject), statusPill(reply.deliveryStatus));
  const body = element("p", "", reply.body);
  const footer = element("footer");
  footer.append(element("span", "", `To ${reply.recipientEmail || record.email}`));
  footer.append(element("span", "", reply.deliveryStatus === "sent"
    ? `Marked sent ${formatDate(reply.sentAt)}`
    : `Saved ${formatDate(reply.createdAt)}`));
  if (recordType === "person" && reply.submissionId) footer.append(element("span", "", `For request received ${formatDate(reply.submissionCreatedAt, false)}`));
  if (reply.deliveryStatus !== "sent") {
    const markSent = element("button", "admin-button admin-button-outline", "Mark sent");
    markSent.type = "button";
    markSent.addEventListener("click", async () => {
      setBusy(markSent, true, "Saving…");
      try {
        await api(`/replies/${reply.id}/sent`, { method: "POST", body: {} });
        detailStatus.textContent = "Reply marked as sent.";
        await Promise.all([detailReload(recordType, record.id), loadRecords()]);
      } catch (error) {
        detailStatus.textContent = error.message;
      } finally {
        setBusy(markSent, false);
      }
    });
    footer.append(markSent);
  }
  item.append(header, body, footer);
  if (reply.errorMessage) item.append(element("p", "admin-reply-error", `Delivery note: ${reply.errorMessage}`));
  return item;
}

function replyDraft(record) {
  const selected = record.interests
    .filter(interest => interest.selectedInSubmission !== false)
    .map(interest => interest.title);
  const opportunityText = selected.length ? selected.join(", ") : "Hope Sojourns";
  return {
    subject: `Hope Sojourns follow-up for ${record.firstName}`,
    message: `Hi ${record.firstName},\n\nThank you for sharing your interest in ${opportunityText}. I would be glad to learn more about what you are hoping for and answer your questions.\n\nWhat days or times would work well for a short conversation?\n\nGo with Hope. Serve with Faith.\nHope Sojourns`,
  };
}

function createReplyComposer(record, submissionId, recordType) {
  const reply = element("section", "admin-detail-card");
  reply.append(element("h3", "", "Prepare a reply"));
  if (!submissionId) {
    reply.append(element("p", "admin-reply-help", "A request is required before a reply can be prepared."));
    return reply;
  }
  const form = element("form", "admin-reply-form");
  const draft = replyDraft(record);
  const subjectLabel = element("label");
  subjectLabel.append(element("span", "", "Subject"));
  const subject = document.createElement("input");
  subject.name = "subject";
  subject.maxLength = 160;
  subject.required = true;
  subject.value = draft.subject;
  subjectLabel.append(subject);
  const messageLabel = element("label");
  messageLabel.append(element("span", "", "Message"));
  const replyMessage = document.createElement("textarea");
  replyMessage.name = "message";
  replyMessage.maxLength = 3000;
  replyMessage.required = true;
  replyMessage.value = draft.message;
  messageLabel.append(replyMessage);
  const send = element("button", "admin-button admin-button-primary", "Open in email app");
  send.type = "submit";
  form.append(subjectLabel, messageLabel, element("p", "admin-reply-help", "The portal saves this reply, then opens your normal email app with the recipient, subject, and message filled in. Return here afterward and mark it sent."), send);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    setBusy(send, true, "Preparing…");
    detailStatus.textContent = "";
    try {
      const { result } = await api(`/submissions/${submissionId}/replies`, {
        method: "POST",
        body: { subject: subject.value, message: replyMessage.value },
      });
      detailStatus.textContent = result.message;
      window.location.href = result.mailtoUrl;
      await Promise.all([detailReload(recordType, record.id), loadRecords()]);
    } catch (error) {
      detailStatus.textContent = error.message;
    } finally {
      setBusy(send, false);
    }
  });
  reply.append(form);
  return reply;
}

function createReplyHistory(record, recordType) {
  const history = element("section", "admin-detail-card");
  history.append(element("h3", "", "Reply history"));
  const historyList = element("div", "admin-reply-history");
  if (record.replies.length) record.replies.forEach(item => historyList.append(createReplyItem(item, record, recordType)));
  else historyList.append(element("p", "admin-reply-help", "No replies have been prepared yet."));
  history.append(historyList);
  return history;
}

function createContactHero(record, activityLabel, activityValue) {
  const hero = element("section", "admin-detail-hero");
  const heroCopy = element("div");
  heroCopy.append(element("h3", "", `${record.firstName} ${record.lastName}`));
  if (record.email) {
    const email = element("a", "", record.email);
    email.href = `mailto:${record.email}`;
    heroCopy.append(email);
  } else heroCopy.append(element("p", "", "No email address recorded"));
  if (record.phone) {
    const phone = element("p");
    const phoneLink = element("a", "", record.phone);
    phoneLink.href = `tel:${record.phone.replace(/[^0-9+]/g, "")}`;
    phone.append(phoneLink);
    heroCopy.append(phone);
  }
  const activity = element("div");
  activity.append(element("p", "", activityLabel), element("strong", "", activityValue));
  hero.append(heroCopy, activity);
  return hero;
}

async function refreshAfterDeletion(successMessage) {
  submissionDialog.close();
  state.currentRecordId = "";
  if (state.view === "teams" || state.view === "ministries") {
    if (state.view === "teams") await loadTeams();
  else if (state.view === "ministries") await loadMinistries();
  if (state.view !== "csm-inbox") await refreshCsmBadge();
  else {
    resultsCount.textContent = "13 working documents";
    submissionsStatus.textContent = "";
  }
    try {
      const { result } = await api("/people?page=1&pageSize=1");
      renderSummary(result.summary);
      populateOpportunityFilter(result.filterOptions);
    } catch (error) {
      if (error.status !== 401) submissionsStatus.textContent = error.message;
    }
  } else {
    await loadRecords();
  }
  submissionsStatus.textContent = successMessage;
}

function createDeletionPanel({ title, description, buttonLabel, promptMessage, path, successMessage }) {
  const section = element("section", "admin-detail-card admin-detail-card-wide admin-danger-zone");
  const copy = element("div");
  copy.append(element("h3", "", title), element("p", "", description));
  const button = element("button", "admin-button admin-button-danger", buttonLabel);
  button.type = "button";
  button.addEventListener("click", async () => {
    const confirmation = window.prompt(`${promptMessage}\n\nType DELETE to confirm.`);
    if (confirmation === null) return;
    if (confirmation !== "DELETE") {
      detailStatus.textContent = "Nothing was deleted. Enter DELETE exactly to confirm permanent deletion.";
      return;
    }
    setBusy(button, true, "Deleting…");
    detailStatus.textContent = "Deleting this record permanently…";
    try {
      await api(path, { method: "DELETE" });
      await refreshAfterDeletion(successMessage);
    } catch (error) {
      detailStatus.textContent = error.message;
      setBusy(button, false);
    }
  });
  section.append(copy, button);
  return section;
}

function renderSubmissionDetail(submission) {
  const fragment = document.createDocumentFragment();
  fragment.append(createContactHero(submission, "Received", formatDate(submission.createdAt)));

  const grid = element("div", "admin-detail-grid");
  const profile = element("section", "admin-detail-card");
  profile.append(element("h3", "", "Contact profile"));
  profile.append(detailList([
    ["Preferred contact", titleCase(submission.contactPreference)],
    ["Background or experience", submission.fieldOfStudy],
    ["Preferred timing", submission.preferredTiming],
    ["Consent recorded", formatDate(submission.consentAt)],
    ["Source page", submission.sourcePage],
  ]));

  const message = element("section", "admin-detail-card");
  message.append(element("h3", "", "What they shared"));
  message.append(element("p", "", submission.message || "No additional message was included."));

  const interests = element("section", "admin-detail-card admin-detail-card-wide");
  interests.append(element("h3", "", "Trips and internships"));
  submission.interests.forEach(interest => interests.append(createInterestRow(submission, interest, "submission")));

  grid.append(
    profile,
    message,
    interests,
    createReplyComposer(submission, submission.id, "submission"),
    createReplyHistory(submission, "submission"),
    createDeletionPanel({
      title: "Delete this request",
      description: `Permanently removes this request, ${plural(submission.interests.filter(interest => interest.selectedInSubmission !== false).length, "linked interest")}, and ${plural(submission.replies.length, "saved reply")}. The applicant’s other records remain.`,
      buttonLabel: "Delete request permanently",
      promptMessage: `Delete the request from ${submission.firstName} ${submission.lastName}? This cannot be undone.`,
      path: `/submissions/${submission.id}`,
      successMessage: `The request from ${submission.firstName} ${submission.lastName} was permanently deleted.`,
    }),
  );
  fragment.append(grid);
  submissionDetail.replaceChildren(fragment);
}

function renderPersonStats(person) {
  const stats = element("section", "admin-person-stats");
  const items = [
    [person.interests.length, "Interests"],
    [person.submissions.length, "Requests"],
    [person.replies.length, "Saved replies"],
    [person.teams.filter(team => team.assigned).length, "Teams"],
    [person.registrations.length, "Registrations"],
  ];
  items.forEach(([value, label]) => {
    const stat = element("article", "admin-person-stat");
    stat.append(element("strong", "", String(value)), element("span", "", label));
    stats.append(stat);
  });
  return stats;
}

function renderSubmissionHistory(person) {
  const section = element("section", "admin-detail-card admin-detail-card-wide");
  section.append(element("h3", "", "Complete request history"));
  const history = element("div", "admin-submission-history");
  person.submissions.forEach((submission, index) => {
    const record = element("article", "admin-submission-record");
    const header = element("header");
    const title = index === 0 ? "Most recent request" : `Earlier request ${person.submissions.length - index}`;
    header.append(element("h4", "", title), element("time", "", formatDate(submission.createdAt)));
    const selected = element("div", "admin-request-interests");
    appendInterests(selected, submission.interests, submission.interests.length);
    const shared = element("div", "admin-record-message");
    shared.append(element("strong", "", "What they shared"));
    shared.append(element("p", "", submission.message || "No additional message was included."));
    const meta = element("div", "admin-record-meta");
    meta.append(
      element("span", "", `Preferred timing: ${submission.preferredTiming || "Not provided"}`),
      element("span", "", `Consent: ${formatDate(submission.consentAt)}`),
      element("span", "", `Source: ${submission.sourcePage || "Not recorded"}`),
    );
    record.append(header, selected, shared, meta);
    history.append(record);
  });
  if (!person.submissions.length) history.append(element("p", "admin-reply-help", "No requests are recorded for this person."));
  section.append(history);
  return section;
}

function renderRegistrations(person) {
  if (!person.registrations.length) return null;
  const section = element("section", "admin-detail-card admin-detail-card-wide");
  section.append(element("h3", "", "Trip registration history"));
  const list = element("div", "admin-submission-history");
  person.registrations.forEach(registration => {
    const record = element("article", "admin-submission-record");
    const header = element("header");
    header.append(element("h4", "", registration.title), statusPill(registration.status));
    record.append(header, detailList([
      ["Location", registration.location],
      ["Started", formatDate(registration.startedAt)],
      ["Submitted", formatDate(registration.submittedAt)],
      ["Last updated", formatDate(registration.updatedAt)],
    ]));
    const actions = element("div", "admin-record-actions");
    const remove = element("button", "admin-button admin-button-danger", "Delete application record");
    remove.type = "button";
    remove.addEventListener("click", async () => {
      const confirmation = window.prompt(`Permanently delete the ${registration.title} application record?\n\nType DELETE to confirm.`);
      if (confirmation === null) return;
      if (confirmation !== "DELETE") {
        detailStatus.textContent = "Nothing was deleted. Enter DELETE exactly to confirm permanent deletion.";
        return;
      }
      setBusy(remove, true, "Deleting…");
      try {
        await api(`/registrations/${registration.id}`, { method: "DELETE" });
        detailStatus.textContent = "The application record was permanently deleted.";
        await Promise.all([loadPersonDetail(person.id), loadRecords()]);
      } catch (error) {
        detailStatus.textContent = error.message;
        setBusy(remove, false);
      }
    });
    actions.append(remove);
    record.append(actions);
    list.append(record);
  });
  section.append(list);
  return section;
}

function editorField(labelText, name, value = "", options = {}) {
  const label = element("label", options.wide ? "admin-editor-wide" : "");
  label.append(element("span", "", labelText));
  const control = options.multiline ? document.createElement("textarea") : document.createElement("input");
  control.name = name;
  control.value = value || "";
  if (!options.multiline) control.type = options.type || "text";
  if (options.maximum) control.maxLength = options.maximum;
  if (options.required) control.required = true;
  if (options.placeholder) control.placeholder = options.placeholder;
  if (options.multiline) control.rows = options.rows || 4;
  label.append(control);
  return label;
}

function editorSelect(labelText, name, choices, selectedValue) {
  const label = element("label");
  label.append(element("span", "", labelText));
  const select = document.createElement("select");
  select.name = name;
  choices.forEach(([value, text]) => {
    const option = element("option", "", text);
    option.value = value;
    option.selected = value === selectedValue;
    select.append(option);
  });
  label.append(select);
  return label;
}

function editorCheckboxGroup(title, name, choices, selectedValues = []) {
  const fieldset = element("fieldset", "admin-editor-options admin-editor-wide");
  fieldset.append(element("legend", "", title));
  const choicesShell = element("div", "admin-editor-choice-grid");
  choices.forEach(choice => {
    const value = choice.value ?? choice[0];
    const text = choice.label ?? choice[1];
    const label = element("label", "admin-team-assignment-choice");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = name;
    input.value = value;
    input.checked = selectedValues.includes(value);
    label.append(input, element("span", "", text));
    choicesShell.append(label);
  });
  fieldset.append(choicesShell);
  return fieldset;
}

function contactEditorOptions(person) {
  if (person?.options) return person.options;
  const options = state.filterOptions || {};
  return {
    contactTypes: options.contactTypes || Object.entries(CONTACT_TYPE_LABELS).map(([value, label]) => ({ value, label })),
    contactAreas: options.contactAreas || [["mission", "Mission"], ["intern", "Intern"], ["corporate", "Corporate"]].map(([value, label]) => ({ value, label })),
    trips: (options.opportunities || []).filter(item => item.kind === "trip"),
  };
}

function renderContactEditor(person = null) {
  const options = contactEditorOptions(person);
  const fragment = document.createDocumentFragment();
  const intro = element("section", "admin-detail-hero");
  const copy = element("div");
  copy.append(element("h3", "", person ? `Edit ${person.firstName} ${person.lastName}` : "Add a contact"));
  copy.append(element("p", "", "Keep the master list useful by recording at least an email address or cell number. A contact can have more than one type, area, language, and trip."));
  intro.append(copy);
  fragment.append(intro);

  const form = element("form", "admin-detail-card admin-detail-card-wide admin-contact-editor");
  const fields = element("div", "admin-editor-grid");
  fields.append(
    editorField("First name", "firstName", person?.firstName, { required: true, maximum: 80 }),
    editorField("Last name", "lastName", person?.lastName, { required: true, maximum: 80 }),
    editorField("Preferred name", "preferredName", person?.preferredName, { maximum: 80 }),
    editorField("Organization", "organization", person?.organization, { maximum: 160 }),
    editorField("Email address", "email", person?.email, { type: "email", maximum: 254 }),
    editorField("Cell number", "phone", person?.phone, { type: "tel", maximum: 40 }),
    editorSelect("Preferred contact", "contactPreference", [["email", "Email"], ["phone", "Phone"]], person?.contactPreference || "email"),
    editorSelect("Contact status", "contactStatus", [["active", "Active"], ["inactive", "Inactive"]], person?.contactStatus || "active"),
    editorField("Website", "website", person?.website, { type: "url", maximum: 300, placeholder: "https://" }),
    editorField("Background, skills, or areas of experience", "fieldOfStudy", person?.fieldOfStudy, { maximum: 160 }),
    editorField("Address line 1", "addressLine1", person?.addressLine1, { maximum: 160 }),
    editorField("Address line 2", "addressLine2", person?.addressLine2, { maximum: 160 }),
    editorField("City", "city", person?.city, { maximum: 100 }),
    editorField("State / province / region", "region", person?.region, { maximum: 100 }),
    editorField("Postal code", "postalCode", person?.postalCode, { maximum: 30 }),
    editorField("Country", "country", person?.country, { maximum: 100 }),
    editorField("Last contacted", "lastContactedAt", person?.lastContactedAt?.slice(0, 10), { type: "date" }),
    editorField("Languages spoken (separate with commas)", "languages", person?.languages?.join(", "), { maximum: 800, wide: true }),
    editorCheckboxGroup("Contact types", "contactTypes", options.contactTypes || [], person?.contactTypes || []),
    editorCheckboxGroup("Hope Sojourns areas", "areas", options.contactAreas || [], person?.areas || []),
    editorCheckboxGroup("Trips connected to this contact", "tripIds", (options.trips || []).map(trip => ({
      value: trip.id,
      label: `${trip.title}${trip.location ? ` — ${trip.location}` : ""}`,
    })), person?.trips?.map(trip => trip.id) || []),
    editorField("Notes", "notes", person?.notes, { multiline: true, maximum: 5000, rows: 6, wide: true }),
  );
  const actions = element("div", "admin-editor-actions admin-editor-wide");
  const cancel = element("button", "admin-button admin-button-quiet", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", () => person ? loadPersonDetail(person.id) : submissionDialog.close());
  const save = element("button", "admin-button admin-button-primary", person ? "Save contact" : "Create contact");
  save.type = "submit";
  actions.append(cancel, save);
  fields.append(actions);
  form.append(fields);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    setBusy(save, true, person ? "Saving…" : "Creating…");
    detailStatus.textContent = "";
    const formData = new FormData(form);
    const body = Object.fromEntries(["firstName", "lastName", "preferredName", "organization", "email", "phone", "contactPreference", "contactStatus", "website", "fieldOfStudy", "addressLine1", "addressLine2", "city", "region", "postalCode", "country", "lastContactedAt", "notes"].map(name => [name, String(formData.get(name) || "")]));
    body.languages = String(formData.get("languages") || "").split(",").map(item => item.trim()).filter(Boolean);
    body.contactTypes = formData.getAll("contactTypes");
    body.areas = formData.getAll("areas");
    body.tripIds = formData.getAll("tripIds");
    try {
      const { result } = await api(person ? `/people/${person.id}` : "/people", {
        method: person ? "PUT" : "POST",
        body,
      });
      detailStatus.textContent = person ? "Contact saved." : "Contact created.";
      await loadRecords();
      await openPerson(result.personId);
    } catch (error) {
      detailStatus.textContent = error.message;
      setBusy(save, false);
    }
  });
  fragment.append(form);
  submissionDetail.replaceChildren(fragment);
}

function createTeamAssignments(person) {
  const section = element("section", "admin-detail-card");
  section.append(element("h3", "", "Team assignments"));
  if (!person.teams.length) {
    section.append(element("p", "admin-reply-help", "No teams have been created yet. Use the Teams tab to create one."));
    return section;
  }
  const form = element("form", "admin-team-assignment-form");
  const list = element("div", "admin-team-assignment-list");
  person.teams.forEach(team => {
    const choice = element("label", "admin-team-assignment-choice");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "teamIds";
    checkbox.value = team.id;
    checkbox.checked = Boolean(team.assigned);
    checkbox.disabled = team.status !== "active" && !team.assigned;
    const copy = element("span");
    copy.append(element("strong", "", team.name));
    copy.append(element("small", "", team.status === "active" ? (team.description || "Active team") : "Archived team"));
    choice.append(checkbox, copy);
    list.append(choice);
  });
  const save = element("button", "admin-button admin-button-primary", "Save team assignments");
  save.type = "submit";
  form.append(list, save);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    setBusy(save, true, "Saving…");
    detailStatus.textContent = "";
    try {
      const teamIds = [...form.querySelectorAll("input[name='teamIds']:checked")].map(input => input.value);
      await api(`/people/${person.id}/teams`, { method: "POST", body: { teamIds } });
      detailStatus.textContent = "Team assignments saved.";
      await Promise.all([loadPersonDetail(person.id), loadRecords()]);
    } catch (error) {
      detailStatus.textContent = error.message;
    } finally {
      setBusy(save, false);
    }
  });
  section.append(form);
  return section;
}

function renderPersonDetail(person) {
  const fragment = document.createDocumentFragment();
  const hero = createContactHero(person, "Latest activity", formatDate(person.submissions[0]?.createdAt || person.updatedAt));
  const edit = element("button", "admin-button admin-button-primary", "Edit contact");
  edit.type = "button";
  edit.addEventListener("click", () => {
    detailEyebrow.textContent = "Master contact list";
    detailTitle.textContent = "Edit contact";
    renderContactEditor(person);
  });
  hero.append(edit);
  hero.append(renderPersonStats(person));
  fragment.append(hero);

  const grid = element("div", "admin-detail-grid");
  const profile = element("section", "admin-detail-card");
  profile.append(element("h3", "", "Contact profile"));
  const address = [person.addressLine1, person.addressLine2, [person.city, person.region, person.postalCode].filter(Boolean).join(", "), person.country].filter(Boolean).join(" · ");
  profile.append(detailList([
    ["Preferred name", person.preferredName],
    ["Contact type", person.contactTypes.map(contactTypeLabel).join(", ")],
    ["Status", titleCase(person.contactStatus)],
    ["Preferred contact", titleCase(person.contactPreference)],
    ["Organization", person.organization],
    ["Address", address],
    ["Languages", person.languages.join(", ")],
    ["Hope Sojourns areas", person.areas.map(titleCase).join(", ")],
    ["Background or experience", person.fieldOfStudy],
    ["Last contacted", formatDate(person.lastContactedAt, false)],
    ["Added from", person.recordSource === "manual" ? "Admin portal" : "Website form"],
    ["First recorded", formatDate(person.createdAt)],
    ["Last updated", formatDate(person.updatedAt)],
  ]));
  if (person.website) {
    const website = element("a", "admin-profile-link", person.website);
    website.href = person.website;
    website.target = "_blank";
    website.rel = "noopener noreferrer";
    profile.append(website);
  }
  if (person.notes) profile.append(element("p", "admin-record-notes", person.notes));

  const ministries = element("section", "admin-detail-card");
  ministries.append(element("h3", "", "Ministry relationships"));
  if (person.ministries.length) {
    person.ministries.forEach(ministry => {
      const row = element("div", "admin-linked-record");
      const copy = element("div");
      copy.append(element("strong", "", ministry.name), element("span", "", [ministry.role, ministry.isPrimary ? "Primary contact" : ""].filter(Boolean).join(" · ") || titleCase(ministry.status)));
      const open = element("button", "admin-button admin-button-outline", "Open ministry");
      open.type = "button";
      open.addEventListener("click", () => openMinistry(ministry.id));
      row.append(copy, open);
      ministries.append(row);
    });
  } else ministries.append(element("p", "admin-reply-help", "This contact is not connected to a ministry."));

  const interests = element("section", "admin-detail-card admin-detail-card-wide");
  interests.append(element("h3", "", "All trips and internships"));
  if (person.trips.length) {
    const connected = element("div", "admin-request-interests");
    person.trips.forEach(trip => connected.append(element("span", "admin-interest-pill", `Contact trip · ${trip.title}`)));
    interests.append(connected);
  }
  person.interests.forEach(interest => interests.append(createInterestRow(person, interest, "person")));
  if (!person.interests.length && !person.trips.length) interests.append(element("p", "admin-reply-help", "No trips or interests are recorded for this person."));

  grid.append(profile, ministries, createTeamAssignments(person), interests, renderSubmissionHistory(person));
  const registrations = renderRegistrations(person);
  if (registrations) grid.append(registrations);
  grid.append(
    createReplyComposer(person, person.latestSubmissionId, "person"),
    createReplyHistory(person, "person"),
    createDeletionPanel({
      title: "Delete this contact and all records",
      description: `Permanently removes the contact, ${plural(person.submissions.length, "request")}, ${plural(person.interests.length, "interest")}, ${plural(person.replies.length, "saved reply")}, ${plural(person.registrations.length, "registration")}, and every team or ministry connection.`,
      buttonLabel: "Delete contact permanently",
      promptMessage: `Delete ${person.firstName} ${person.lastName} and all information connected to this contact? This cannot be undone.`,
      path: `/people/${person.id}`,
      successMessage: `${person.firstName} ${person.lastName} and all connected records were permanently deleted.`,
    }),
  );
  fragment.append(grid);
  submissionDetail.replaceChildren(fragment);
}

function openTeamEmail(team) {
  const emails = [...new Set(team.members.map(member => member.email).filter(Boolean))];
  if (!emails.length) {
    detailStatus.textContent = "Add at least one team member before opening a team email.";
    return;
  }
  detailStatus.textContent = `Opening your email app with ${plural(emails.length, "address")} in the To field.`;
  window.location.href = `mailto:${emails.join(",")}`;
}

function createTeamMemberCard(team, member) {
  const card = element("article", "admin-team-member");
  const identity = element("div");
  identity.append(element("h4", "", `${member.firstName} ${member.lastName}`));
  identity.append(element("small", "", `Assigned ${formatDate(member.assignedAt, false)}`));
  identity.append(element("small", "", member.fieldOfStudy || "Background or experience not provided"));

  const contact = element("div", "admin-team-member-contact");
  if (member.email) {
    const email = element("a", "", member.email);
    email.href = `mailto:${member.email}`;
    contact.append(email);
  } else contact.append(element("span", "", "Email not provided"));
  if (member.phone) {
    const phone = element("a", "", member.phone);
    phone.href = `tel:${member.phone.replace(/[^0-9+]/g, "")}`;
    contact.append(phone);
  } else {
    contact.append(element("span", "", "Cell phone not provided"));
  }
  contact.append(element("span", "", `Prefers ${titleCase(member.contactPreference).toLowerCase()} · ${plural(member.submissionCount, "request")} · ${plural(member.replyCount, "reply")}`));

  const interests = element("div", "admin-request-interests");
  appendInterests(interests, member.interests, 4);

  const actions = element("div", "admin-team-member-actions");
  const view = element("button", "admin-button admin-button-outline", "Full record");
  view.type = "button";
  view.addEventListener("click", () => openPerson(member.id));
  const remove = element("button", "admin-button admin-button-quiet", "Remove");
  remove.type = "button";
  remove.addEventListener("click", async () => {
    if (!window.confirm(`Remove ${member.firstName} ${member.lastName} from ${team.name}?`)) return;
    setBusy(remove, true, "Removing…");
    detailStatus.textContent = "";
    try {
      await api(`/teams/${team.id}/members/remove`, { method: "POST", body: { personId: member.id } });
      detailStatus.textContent = `${member.firstName} was removed from ${team.name}.`;
      await Promise.all([loadTeamDetail(team.id), loadRecords()]);
    } catch (error) {
      detailStatus.textContent = error.message;
    } finally {
      setBusy(remove, false);
    }
  });
  actions.append(view, remove);
  card.append(identity, contact, interests, actions);
  return card;
}

function renderTeamDetail(team) {
  const fragment = document.createDocumentFragment();
  const hero = element("section", "admin-detail-hero");
  const copy = element("div");
  copy.append(element("h3", "", team.name));
  copy.append(element("p", "", team.description || "No team description has been added yet."));
  copy.append(element("p", "", `Created ${formatDate(team.createdAt, false)}`));
  const actions = element("div", "admin-team-detail-actions");
  const emailTeam = element("button", "admin-button admin-button-primary", "Email entire team");
  emailTeam.type = "button";
  emailTeam.disabled = team.members.length === 0;
  emailTeam.addEventListener("click", () => openTeamEmail(team));
  actions.append(element("strong", "", plural(team.members.length, "member")), emailTeam);
  hero.append(copy, actions);
  fragment.append(hero);

  const grid = element("div", "admin-detail-grid");
  const emailNote = element("section", "admin-detail-card admin-detail-card-wide");
  emailNote.append(element("p", "admin-team-email-note", "The team email button opens this machine’s preferred email app and places every team member’s email address in the To field. All recipients will be able to see the other addresses."));

  const add = element("section", "admin-detail-card admin-detail-card-wide");
  add.append(element("h3", "", "Add an applicant"));
  if (team.availablePeople.length) {
    const form = element("form", "admin-team-add-form");
    const label = element("label");
    label.append(element("span", "", "Applicant"));
    const select = document.createElement("select");
    select.name = "personId";
    select.required = true;
    team.availablePeople.forEach(person => {
      const interests = person.interests?.map(interest => interest.title).slice(0, 3).join(", ") || "No interests recorded";
      const option = element("option", "", `${person.lastName}, ${person.firstName} — ${interests} — ${person.email} — ${person.phone || "No cell"}`);
      option.value = person.id;
      select.append(option);
    });
    label.append(select);
    const addButton = element("button", "admin-button admin-button-primary", "Add to team");
    addButton.type = "submit";
    form.append(label, addButton);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      setBusy(addButton, true, "Adding…");
      detailStatus.textContent = "";
      try {
        await api(`/teams/${team.id}/members`, { method: "POST", body: { personId: select.value } });
        detailStatus.textContent = "Applicant added to the team.";
        await Promise.all([loadTeamDetail(team.id), loadRecords()]);
      } catch (error) {
        detailStatus.textContent = error.message;
      } finally {
        setBusy(addButton, false);
      }
    });
    add.append(form);
  } else {
    add.append(element("p", "admin-reply-help", "Every applicant is already assigned to this team."));
  }

  const members = element("section", "admin-detail-card admin-detail-card-wide");
  members.append(element("h3", "", "Team members and submitted information"));
  const memberList = element("div", "admin-team-member-list");
  if (team.members.length) team.members.forEach(member => memberList.append(createTeamMemberCard(team, member)));
  else memberList.append(element("p", "admin-reply-help", "No applicants have been assigned to this team yet."));
  members.append(memberList);
  grid.append(
    emailNote,
    add,
    members,
    createDeletionPanel({
      title: "Delete this team",
      description: `Permanently removes the team and its ${plural(team.members.length, "assignment")}. Applicant records and submitted information remain in the portal.`,
      buttonLabel: "Delete team permanently",
      promptMessage: `Delete ${team.name}? Applicants will remain, but the team and all assignments to it will be removed. This cannot be undone.`,
      path: `/teams/${team.id}`,
      successMessage: `${team.name} was permanently deleted. Applicant records were kept.`,
    }),
  );
  fragment.append(grid);
  submissionDetail.replaceChildren(fragment);
}

function renderMinistryEditor(ministry) {
  const options = ministry.options || { trips: [] };
  const fragment = document.createDocumentFragment();
  const intro = element("section", "admin-detail-hero");
  const copy = element("div");
  copy.append(element("h3", "", `Edit ${ministry.name}`));
  copy.append(element("p", "", "Maintain the ministry’s contact information and connect the trips you share."));
  intro.append(copy);
  fragment.append(intro);

  const form = element("form", "admin-detail-card admin-detail-card-wide admin-contact-editor");
  const fields = element("div", "admin-editor-grid");
  fields.append(
    editorField("Ministry name", "name", ministry.name, { required: true, maximum: 160 }),
    editorSelect("Status", "status", [["active", "Active"], ["inactive", "Inactive"]], ministry.status),
    editorField("Email address", "email", ministry.email, { type: "email", maximum: 254 }),
    editorField("Phone number", "phone", ministry.phone, { type: "tel", maximum: 40 }),
    editorField("Website", "website", ministry.website, { type: "url", maximum: 300, placeholder: "https://" }),
    editorField("Address line 1", "addressLine1", ministry.addressLine1, { maximum: 160 }),
    editorField("Address line 2", "addressLine2", ministry.addressLine2, { maximum: 160 }),
    editorField("City", "city", ministry.city, { maximum: 100 }),
    editorField("State / province / region", "region", ministry.region, { maximum: 100 }),
    editorField("Postal code", "postalCode", ministry.postalCode, { maximum: 30 }),
    editorField("Country", "country", ministry.country, { maximum: 100 }),
    editorField("Description", "description", ministry.description, { multiline: true, maximum: 2000, rows: 4, wide: true }),
    editorCheckboxGroup("Trips with this ministry", "tripIds", (options.trips || []).map(trip => ({
      value: trip.id,
      label: `${trip.title}${trip.location ? ` — ${trip.location}` : ""}`,
    })), ministry.trips?.map(trip => trip.id) || []),
    editorField("Internal notes", "notes", ministry.notes, { multiline: true, maximum: 5000, rows: 6, wide: true }),
  );
  const actions = element("div", "admin-editor-actions admin-editor-wide");
  const cancel = element("button", "admin-button admin-button-quiet", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", () => loadMinistryDetail(ministry.id));
  const save = element("button", "admin-button admin-button-primary", "Save ministry");
  save.type = "submit";
  actions.append(cancel, save);
  fields.append(actions);
  form.append(fields);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    setBusy(save, true, "Saving…");
    detailStatus.textContent = "";
    const formData = new FormData(form);
    const body = Object.fromEntries(["name", "status", "email", "phone", "website", "addressLine1", "addressLine2", "city", "region", "postalCode", "country", "description", "notes"].map(name => [name, String(formData.get(name) || "")]));
    body.tripIds = formData.getAll("tripIds");
    try {
      await api(`/ministries/${ministry.id}`, { method: "PUT", body });
      detailStatus.textContent = "Ministry saved.";
      await Promise.all([loadMinistryDetail(ministry.id), state.view === "ministries" ? loadMinistries() : Promise.resolve()]);
    } catch (error) {
      detailStatus.textContent = error.message;
      setBusy(save, false);
    }
  });
  fragment.append(form);
  submissionDetail.replaceChildren(fragment);
}

function createMinistryContactCard(ministry, contact) {
  const card = element("article", "admin-team-member");
  const identity = element("div");
  identity.append(element("h4", "", `${contact.firstName} ${contact.lastName}`));
  identity.append(element("small", "", [contact.role, contact.isPrimary ? "Primary contact" : ""].filter(Boolean).join(" · ") || "Ministry contact"));
  identity.append(element("small", "", contact.organization || "No organization recorded"));
  const contactInfo = element("div", "admin-team-member-contact");
  if (contact.email) {
    const email = element("a", "", contact.email);
    email.href = `mailto:${contact.email}`;
    contactInfo.append(email);
  } else contactInfo.append(element("span", "", "No email address"));
  if (contact.phone) {
    const phone = element("a", "", contact.phone);
    phone.href = `tel:${contact.phone.replace(/[^0-9+]/g, "")}`;
    contactInfo.append(phone);
  } else contactInfo.append(element("span", "", "No cell number"));
  const actions = element("div", "admin-team-member-actions");
  const view = element("button", "admin-button admin-button-outline", "Full contact");
  view.type = "button";
  view.addEventListener("click", () => openPerson(contact.id));
  const remove = element("button", "admin-button admin-button-quiet", "Remove link");
  remove.type = "button";
  remove.addEventListener("click", async () => {
    if (!window.confirm(`Remove ${contact.firstName} ${contact.lastName} from ${ministry.name}? The contact record will remain.`)) return;
    setBusy(remove, true, "Removing…");
    try {
      await api(`/ministries/${ministry.id}/contacts/remove`, { method: "POST", body: { personId: contact.id } });
      detailStatus.textContent = "The ministry connection was removed. The contact record was kept.";
      await loadMinistryDetail(ministry.id);
    } catch (error) {
      detailStatus.textContent = error.message;
      setBusy(remove, false);
    }
  });
  actions.append(view, remove);
  card.append(identity, contactInfo, actions);
  return card;
}

function renderMinistryDetail(ministry) {
  const fragment = document.createDocumentFragment();
  const hero = element("section", "admin-detail-hero");
  const copy = element("div");
  copy.append(element("h3", "", ministry.name), element("p", "", ministry.description || "No ministry description has been added yet."));
  const action = element("div", "admin-team-detail-actions");
  action.append(statusPill(ministry.status));
  const edit = element("button", "admin-button admin-button-primary", "Edit ministry");
  edit.type = "button";
  edit.addEventListener("click", () => {
    detailEyebrow.textContent = "Partner ministries";
    detailTitle.textContent = "Edit ministry";
    renderMinistryEditor(ministry);
  });
  action.append(edit);
  hero.append(copy, action);
  fragment.append(hero);

  const grid = element("div", "admin-detail-grid");
  const profile = element("section", "admin-detail-card");
  profile.append(element("h3", "", "Ministry profile"));
  const address = [ministry.addressLine1, ministry.addressLine2, [ministry.city, ministry.region, ministry.postalCode].filter(Boolean).join(", "), ministry.country].filter(Boolean).join(" · ");
  profile.append(detailList([
    ["Address", address],
    ["Email", ministry.email],
    ["Phone", ministry.phone],
    ["Created", formatDate(ministry.createdAt)],
    ["Last updated", formatDate(ministry.updatedAt)],
  ]));
  if (ministry.website) {
    const website = element("a", "admin-profile-link", ministry.website);
    website.href = ministry.website;
    website.target = "_blank";
    website.rel = "noopener noreferrer";
    profile.append(website);
  }
  if (ministry.notes) profile.append(element("p", "admin-record-notes", ministry.notes));

  const trips = element("section", "admin-detail-card");
  trips.append(element("h3", "", "Connected trips"));
  const tripList = element("div", "admin-request-interests");
  ministry.trips.forEach(trip => tripList.append(element("span", "admin-interest-pill", `${trip.title}${trip.location ? ` · ${trip.location}` : ""}`)));
  if (!ministry.trips.length) tripList.append(element("p", "admin-reply-help", "No trips are connected yet. Use Edit ministry to add them."));
  trips.append(tripList);

  const add = element("section", "admin-detail-card admin-detail-card-wide");
  add.append(element("h3", "", "Add a ministry contact"));
  if (ministry.availableContacts.length) {
    const form = element("form", "admin-team-add-form admin-ministry-contact-form");
    const contactLabel = element("label");
    contactLabel.append(element("span", "", "Contact"));
    const select = document.createElement("select");
    select.name = "personId";
    select.required = true;
    ministry.availableContacts.forEach(contact => {
      const option = element("option", "", `${contact.lastName}, ${contact.firstName} — ${contact.organization || contact.email || contact.phone || "Contact record"}`);
      option.value = contact.id;
      select.append(option);
    });
    contactLabel.append(select);
    const role = editorField("Role with ministry", "role", "", { maximum: 120, placeholder: "Director, coordinator, pastor…" });
    const primaryLabel = element("label", "admin-inline-check");
    const primary = document.createElement("input");
    primary.type = "checkbox";
    primary.name = "isPrimary";
    primaryLabel.append(primary, element("span", "", "Primary contact"));
    const addButton = element("button", "admin-button admin-button-primary", "Connect contact");
    addButton.type = "submit";
    form.append(contactLabel, role, primaryLabel, addButton);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      setBusy(addButton, true, "Connecting…");
      detailStatus.textContent = "";
      const formData = new FormData(form);
      try {
        await api(`/ministries/${ministry.id}/contacts`, {
          method: "POST",
          body: { personId: select.value, role: String(formData.get("role") || ""), isPrimary: primary.checked },
        });
        detailStatus.textContent = "Contact connected to the ministry.";
        await loadMinistryDetail(ministry.id);
      } catch (error) {
        detailStatus.textContent = error.message;
        setBusy(addButton, false);
      }
    });
    add.append(form);
  } else add.append(element("p", "admin-reply-help", "Every active contact is already linked. Add another contact from the Contacts tab if needed."));

  const contacts = element("section", "admin-detail-card admin-detail-card-wide");
  contacts.append(element("h3", "", "Ministry contacts"));
  const contactList = element("div", "admin-team-member-list");
  if (ministry.contacts.length) ministry.contacts.forEach(contact => contactList.append(createMinistryContactCard(ministry, contact)));
  else contactList.append(element("p", "admin-reply-help", "No people are connected to this ministry yet."));
  contacts.append(contactList);

  grid.append(
    profile,
    trips,
    add,
    contacts,
    createDeletionPanel({
      title: "Delete this ministry",
      description: `Permanently removes the ministry and its ${plural(ministry.contacts.length, "contact link")} and ${plural(ministry.trips.length, "trip link")}. Contact and trip records remain.`,
      buttonLabel: "Delete ministry permanently",
      promptMessage: `Delete ${ministry.name}? Linked contacts and trips will remain in the portal, but the ministry record cannot be recovered.`,
      path: `/ministries/${ministry.id}`,
      successMessage: `${ministry.name} was permanently deleted. Linked contacts and trips were kept.`,
    }),
  );
  fragment.append(grid);
  submissionDetail.replaceChildren(fragment);
}

async function loadMinistryDetail(ministryId) {
  detailStatus.textContent = "Loading ministry…";
  try {
    const { result } = await api(`/ministries/${ministryId}`);
    renderMinistryDetail(result.ministry);
    detailTitle.textContent = result.ministry.name;
    detailStatus.textContent = "";
  } catch (error) {
    if (error.status !== 401) detailStatus.textContent = error.message;
  }
}

async function openMinistry(ministryId) {
  state.currentRecordId = ministryId;
  submissionDetail.replaceChildren();
  detailEyebrow.textContent = "Partner ministry";
  detailTitle.textContent = "Ministry details";
  if (!submissionDialog.open) submissionDialog.showModal();
  await loadMinistryDetail(ministryId);
}

async function loadTeamDetail(teamId) {
  detailStatus.textContent = "Loading team…";
  try {
    const { result } = await api(`/teams/${teamId}`);
    renderTeamDetail(result.team);
    detailTitle.textContent = result.team.name;
    detailStatus.textContent = "";
  } catch (error) {
    if (error.status !== 401) detailStatus.textContent = error.message;
  }
}

async function openTeam(teamId) {
  state.currentRecordId = teamId;
  submissionDetail.replaceChildren();
  detailEyebrow.textContent = "Complete team record";
  detailTitle.textContent = "Team details";
  if (!submissionDialog.open) submissionDialog.showModal();
  await loadTeamDetail(teamId);
}

async function loadSubmissionDetail(submissionId) {
  detailStatus.textContent = "Loading request…";
  try {
    const { result } = await api(`/submissions/${submissionId}`);
    renderSubmissionDetail(result.submission);
    detailTitle.textContent = `${result.submission.firstName} ${result.submission.lastName}`;
    detailStatus.textContent = "";
  } catch (error) {
    if (error.status !== 401) detailStatus.textContent = error.message;
  }
}

async function loadPersonDetail(personId) {
  detailStatus.textContent = "Loading complete record…";
  try {
    const { result } = await api(`/people/${personId}`);
    renderPersonDetail(result.person);
    detailTitle.textContent = `${result.person.firstName} ${result.person.lastName}`;
    detailStatus.textContent = "";
  } catch (error) {
    if (error.status !== 401) detailStatus.textContent = error.message;
  }
}

async function openSubmission(submissionId) {
  state.currentRecordId = submissionId;
  submissionDetail.replaceChildren();
  detailEyebrow.textContent = "Individual request";
  detailTitle.textContent = "Request details";
  if (!submissionDialog.open) submissionDialog.showModal();
  await loadSubmissionDetail(submissionId);
}

async function openPerson(personId) {
  state.currentRecordId = personId;
  submissionDetail.replaceChildren();
  detailEyebrow.textContent = "Complete person record";
  detailTitle.textContent = "Everything gathered";
  if (!submissionDialog.open) submissionDialog.showModal();
  await loadPersonDetail(personId);
}

function contactImportFormData(file) {
  const formData = new FormData();
  formData.append("file", file, file.name);
  return formData;
}

function resetContactImport(focusFile = false) {
  contactImportForm.reset();
  state.contactImportFile = null;
  contactImportPreview.hidden = true;
  contactImportTableShell.replaceChildren();
  contactImportStatus.textContent = "";
  contactImportStatus.classList.remove("is-success");
  commitContactImportButton.disabled = false;
  commitContactImportButton.textContent = "Import valid rows";
  if (focusFile) contactImportFile.focus();
}

function renderContactImportRows(rows, committed) {
  const table = element("table", "admin-import-table");
  table.append(element("caption", "", committed ? "Contact spreadsheet import results" : "Contact spreadsheet import preview"));
  const head = document.createElement("thead");
  const headingRow = document.createElement("tr");
  for (const label of ["Row", "Action", "Contact", "Review details"]) headingRow.append(element("th", "", label));
  head.append(headingRow);
  const body = document.createElement("tbody");
  for (const item of rows) {
    const row = document.createElement("tr");
    if (item.action === "error") row.classList.add("admin-import-row-error");
    row.append(element("td", "", String(item.rowNumber)));

    const actionCell = document.createElement("td");
    const actionLabel = item.action === "error"
      ? "Needs correction"
      : committed
        ? item.action === "create" ? "Created" : "Updated"
        : item.action === "create" ? "Create" : "Update";
    actionCell.append(element("span", `admin-import-action admin-import-action-${item.action}`, actionLabel));
    row.append(actionCell);

    const contactCell = element("td", "admin-import-contact");
    contactCell.append(element("strong", "", item.name || "Unnamed row"));
    if (item.email) contactCell.append(element("span", "", item.email));
    if (item.phone) contactCell.append(element("span", "", item.phone));
    row.append(contactCell);

    const detailsCell = document.createElement("td");
    const messages = element("ul", "admin-import-messages");
    if (item.matchedBy) messages.append(element("li", "", `Matched by ${item.matchedBy}.`));
    for (const warning of item.warnings || []) messages.append(element("li", "admin-import-message-warning", warning));
    for (const error of item.errors || []) messages.append(element("li", "admin-import-message-error", error));
    if (!messages.children.length) messages.append(element("li", "", item.action === "create" ? "Ready to add as a new contact." : "Ready to merge with the existing contact."));
    detailsCell.append(messages);
    row.append(detailsCell);
    body.append(row);
  }
  table.append(head, body);
  return table;
}

function renderContactImportResult(result, committed = false) {
  contactImportFileName.textContent = result.fileName;
  contactImportCreates.textContent = String(result.creates || 0);
  contactImportUpdates.textContent = String(result.updates || 0);
  contactImportErrors.textContent = String(result.errors || 0);
  contactImportHelp.textContent = committed
    ? `${plural(result.created || 0, "new contact")} added and ${plural(result.updated || 0, "contact")} updated. Rows needing correction were not saved.`
    : "Rows needing correction are skipped. Blank cells do not erase existing contact details, and list values are merged.";
  contactImportTableShell.replaceChildren(renderContactImportRows(result.rows || [], committed));
  contactImportPreview.hidden = false;
  commitContactImportButton.disabled = committed || !result.canImport;
  commitContactImportButton.textContent = committed ? "Import complete" : "Import valid rows";
  contactImportPreview.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function selectedContactImportFile() {
  const file = contactImportFile.files?.[0];
  if (!file) throw new Error("Choose the completed Excel or CSV spreadsheet.");
  if (file.size > 2 * 1024 * 1024) throw new Error("Choose a spreadsheet smaller than 2 MB.");
  if (!/\.(xlsx|csv)$/i.test(file.name)) throw new Error("Choose an Excel .xlsx file or a CSV version of the template.");
  return file;
}

importContactsButton.addEventListener("click", () => {
  resetContactImport();
  if (!contactImportDialog.open) contactImportDialog.showModal();
  contactImportFile.focus();
});

closeContactImportDialog.addEventListener("click", () => contactImportDialog.close());
contactImportDialog.addEventListener("close", () => resetContactImport());
contactImportFile.addEventListener("change", () => {
  state.contactImportFile = null;
  contactImportPreview.hidden = true;
  contactImportStatus.textContent = "";
  contactImportStatus.classList.remove("is-success");
});
chooseAnotherImportButton.addEventListener("click", () => resetContactImport(true));

contactImportForm.addEventListener("submit", async event => {
  event.preventDefault();
  contactImportStatus.classList.remove("is-success");
  contactImportStatus.textContent = "Checking every spreadsheet row…";
  setBusy(previewContactImportButton, true, "Reviewing…");
  try {
    const file = selectedContactImportFile();
    const { result } = await api("/contact-imports/preview", {
      method: "POST",
      body: contactImportFormData(file),
    });
    state.contactImportFile = file;
    renderContactImportResult(result.preview);
    contactImportStatus.textContent = result.preview.canImport
      ? "Review the actions below, then import the valid rows when ready."
      : "No rows are ready to import. Correct the listed items in Excel and review the file again.";
  } catch (error) {
    state.contactImportFile = null;
    contactImportPreview.hidden = true;
    contactImportStatus.textContent = error.message;
  } finally {
    setBusy(previewContactImportButton, false);
  }
});

commitContactImportButton.addEventListener("click", async () => {
  if (!state.contactImportFile) {
    contactImportStatus.textContent = "Review the spreadsheet again before importing it.";
    return;
  }
  contactImportStatus.classList.remove("is-success");
  contactImportStatus.textContent = "Saving valid contacts…";
  setBusy(commitContactImportButton, true, "Importing…");
  try {
    const { result } = await api("/contact-imports", {
      method: "POST",
      body: contactImportFormData(state.contactImportFile),
    });
    setBusy(commitContactImportButton, false);
    renderContactImportResult(result.import, true);
    contactImportStatus.classList.add("is-success");
    contactImportStatus.textContent = `Import complete: ${plural(result.import.created, "new contact")} and ${plural(result.import.updated, "updated contact")}.`;
    await loadPeople();
  } catch (error) {
    contactImportStatus.textContent = error.message;
    setBusy(commitContactImportButton, false);
  }
});

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  const submit = loginForm.querySelector("button[type='submit']");
  setBusy(submit, true, "Checking…");
  loginStatus.textContent = "Checking your password…";
  try {
    const { result } = await api("/login", {
      method: "POST",
      body: {
        password: passwordInput.value,
        rememberMe: loginForm.elements.rememberMe.checked,
      },
    });
    loginForm.reset();
    showDashboard(result);
  } catch (error) {
    loginStatus.textContent = error.message;
    passwordInput.value = "";
    passwordInput.focus();
  } finally {
    setBusy(submit, false);
  }
});

document.querySelector("#admin-signout").addEventListener("click", async event => {
  accountMenu.open = false;
  setBusy(event.currentTarget, true, "Signing out…");
  try { await api("/logout", { method: "POST", body: {} }); } catch { /* The local session is cleared regardless. */ }
  showLogin("You have signed out.");
  setBusy(event.currentTarget, false);
});

document.querySelectorAll("[data-password-toggle]").forEach(button => {
  button.addEventListener("click", () => {
    const input = document.querySelector(`#${button.getAttribute("aria-controls")}`);
    if (!input) return;
    const revealing = input.type === "password";
    input.type = revealing ? "text" : "password";
    button.setAttribute("aria-pressed", String(revealing));
    button.setAttribute("aria-label", `${revealing ? "Hide" : "Show"} ${input.name === "password" ? "administrator" : input.name === "currentPassword" ? "current" : input.name === "newPassword" ? "new" : "confirmed"} password`);
    input.focus();
  });
});

document.querySelector("#open-change-password").addEventListener("click", () => {
  accountMenu.open = false;
  changePasswordForm.reset();
  resetPasswordVisibility(changePasswordForm);
  changePasswordStatus.classList.remove("is-success");
  changePasswordStatus.textContent = "";
  if (!changePasswordDialog.open) changePasswordDialog.showModal();
  currentPasswordInput.focus();
});

document.addEventListener("click", event => {
  if (accountMenu.open && !accountMenu.contains(event.target)) accountMenu.open = false;
});

changePasswordForm.addEventListener("submit", async event => {
  event.preventDefault();
  const submit = changePasswordForm.querySelector("button[type='submit']");
  const formData = new FormData(changePasswordForm);
  changePasswordStatus.classList.remove("is-success");
  changePasswordStatus.textContent = "Updating the portal password…";
  setBusy(submit, true, "Updating…");
  try {
    await api("/password", {
      method: "POST",
      body: {
        currentPassword: String(formData.get("currentPassword") || ""),
        newPassword: String(formData.get("newPassword") || ""),
        confirmPassword: String(formData.get("confirmPassword") || ""),
      },
    });
    changePasswordStatus.classList.add("is-success");
    changePasswordStatus.textContent = "Password updated. Other signed-in devices have been logged out.";
    changePasswordForm.reset();
    resetPasswordVisibility(changePasswordForm);
  } catch (error) {
    changePasswordStatus.textContent = error.message;
    currentPasswordInput.focus();
  } finally {
    setBusy(submit, false);
  }
});

peopleViewTab.addEventListener("click", () => switchView("people"));
requestsViewTab.addEventListener("click", () => switchView("requests"));
gridViewTab.addEventListener("click", () => switchView("grid"));
csmInboxViewTab.addEventListener("click", () => switchView("csm-inbox"));
teamsViewTab.addEventListener("click", () => switchView("teams"));
ministriesViewTab.addEventListener("click", () => switchView("ministries"));
internshipToolkitViewTab.addEventListener("click", () => switchView("internship-toolkit"));
document.querySelector(".admin-view-tabs").addEventListener("keydown", event => {
  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  const views = ["people", "requests", "grid", "csm-inbox", "teams", "ministries", "internship-toolkit"];
  const direction = event.key === "ArrowRight" ? 1 : -1;
  const nextIndex = (views.indexOf(state.view) + direction + views.length) % views.length;
  switchView(views[nextIndex], true);
});

addContactButton.addEventListener("click", () => {
  state.currentRecordId = "";
  detailEyebrow.textContent = "Master contact list";
  detailTitle.textContent = "Add contact";
  detailStatus.textContent = "";
  renderContactEditor();
  if (!submissionDialog.open) submissionDialog.showModal();
});

teamCreateForm.addEventListener("submit", async event => {
  event.preventDefault();
  const submit = teamCreateForm.querySelector("button[type='submit']");
  const formData = new FormData(teamCreateForm);
  setBusy(submit, true, "Creating…");
  teamCreateStatus.textContent = "";
  try {
    const { result } = await api("/teams", {
      method: "POST",
      body: {
        name: String(formData.get("name") || ""),
        description: String(formData.get("description") || ""),
      },
    });
    teamCreateForm.reset();
    teamCreateStatus.textContent = `${result.team.name} was created.`;
    await loadTeams();
  } catch (error) {
    teamCreateStatus.textContent = error.message;
  } finally {
    setBusy(submit, false);
  }
});

ministryCreateForm.addEventListener("submit", async event => {
  event.preventDefault();
  const submit = ministryCreateForm.querySelector("button[type='submit']");
  const formData = new FormData(ministryCreateForm);
  setBusy(submit, true, "Creating…");
  ministryCreateStatus.textContent = "";
  try {
    const { result } = await api("/ministries", {
      method: "POST",
      body: {
        name: String(formData.get("name") || ""),
        description: String(formData.get("description") || ""),
      },
    });
    ministryCreateForm.reset();
    ministryCreateStatus.textContent = "Ministry created. Add its details and contacts next.";
    await loadMinistries();
    await openMinistry(result.ministryId);
  } catch (error) {
    ministryCreateStatus.textContent = error.message;
  } finally {
    setBusy(submit, false);
  }
});

csmInboxFilter.addEventListener("change", loadCsmInbox);
approveAllCsmInboxButton.addEventListener("click", approveAllCsmInbox);
viewCsmDonorsButton.addEventListener("click", viewCsmDonors);

filterForm.addEventListener("submit", event => {
  event.preventDefault();
  state.page = 1;
  loadRecords();
});
document.querySelector("#reset-filters").addEventListener("click", () => {
  filterForm.reset();
  state.page = 1;
  loadRecords();
});
document.querySelector("#refresh-submissions").addEventListener("click", event => {
  setBusy(event.currentTarget, true, "Refreshing…");
  loadRecords().finally(() => setBusy(event.currentTarget, false));
});
previousPage.addEventListener("click", () => { if (state.page > 1) { state.page -= 1; loadRecords(); } });
nextPage.addEventListener("click", () => { if (state.page < state.pages) { state.page += 1; loadRecords(); } });

exportButton.addEventListener("click", async event => {
  const button = event.currentTarget;
  setBusy(button, true, "Preparing…");
  submissionsStatus.textContent = "";
  try {
    const params = filterQuery();
    params.delete("page");
    params.delete("pageSize");
    params.set("view", state.view === "requests" ? "requests" : "people");
    const response = await fetch(`${API_BASE}/export.csv?${params}`, { credentials: "same-origin" });
    if (!response.ok) {
      if (response.status === 401) showLogin("Your session ended. Sign in again.");
      throw new Error("The export could not be prepared.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const disposition = response.headers.get("content-disposition") || "";
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] || "hope-sojourns-interest.csv";
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    submissionsStatus.textContent = "The filtered CSV export was downloaded.";
  } catch (error) {
    submissionsStatus.textContent = error.message;
  } finally {
    setBusy(button, false);
  }
});

document.querySelector("#close-submission-dialog").addEventListener("click", () => submissionDialog.close());
submissionDialog.addEventListener("click", event => {
  if (event.target === submissionDialog) submissionDialog.close();
});
document.querySelector("#close-change-password-dialog").addEventListener("click", () => changePasswordDialog.close());
changePasswordDialog.addEventListener("click", event => {
  if (event.target === changePasswordDialog) changePasswordDialog.close();
});
document.querySelector("#year").textContent = new Date().getFullYear();

(async function startPortal() {
  try {
    const { result } = await api("/session");
    showDashboard(result);
  } catch (error) {
    if (error.status === 503) showLogin("The portal is being configured. Please try again shortly.");
    else showLogin();
  }
})();
