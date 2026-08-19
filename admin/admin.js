"use strict";

const API_BASE = "/api/interest/admin";
const loginPanel = document.querySelector("#login-panel");
const dashboardPanel = document.querySelector("#dashboard-panel");
const loginForm = document.querySelector("#admin-login-form");
const passwordInput = document.querySelector("#admin-password");
const loginStatus = document.querySelector("#login-status");
const peopleList = document.querySelector("#people-list");
const submissionsList = document.querySelector("#submissions-list");
const peopleGrid = document.querySelector("#people-grid");
const teamsWorkspace = document.querySelector("#teams-workspace");
const teamsList = document.querySelector("#teams-list");
const teamCreateForm = document.querySelector("#team-create-form");
const teamCreateStatus = document.querySelector("#team-create-status");
const submissionsEmpty = document.querySelector("#submissions-empty");
const submissionsStatus = document.querySelector("#submissions-status");
const filterForm = document.querySelector("#submission-filters");
const opportunityFilter = document.querySelector("#opportunity-filter");
const teamFilter = document.querySelector("#team-filter");
const resultsCount = document.querySelector("#results-count");
const recordsTitle = document.querySelector("#records-title");
const peopleViewTab = document.querySelector("#people-view-tab");
const requestsViewTab = document.querySelector("#requests-view-tab");
const gridViewTab = document.querySelector("#grid-view-tab");
const teamsViewTab = document.querySelector("#teams-view-tab");
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

async function api(path, options = {}) {
  const method = options.method || "GET";
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (method !== "GET" && path !== "/login" && state.csrfToken) headers.set("X-CSRF-Token", state.csrfToken);
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: "same-origin",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
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
  identity.append(element("small", "", `Latest activity ${formatDate(person.lastSubmissionAt)}`));
  identity.append(element("small", "", person.teams?.length
    ? `Teams: ${person.teams.map(team => team.name).join(", ")}`
    : "Not assigned to a team"));

  const contact = element("span", "admin-request-contact");
  contact.append(element("span", "", person.email));
  contact.append(element("small", "", person.phone || `Prefers ${titleCase(person.contactPreference).toLowerCase()}`));

  const interests = element("span", "admin-request-interests");
  appendInterests(interests, person.interests);

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
  ["Name", "Email", "Cell phone", "Contact by", "School or field", "Teams", "Latest activity", "Trips and internships", "Requests", "Replies"].forEach(label => {
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

    const emailCell = gridCell(row, "");
    const email = element("a", "admin-grid-email", person.email);
    email.href = `mailto:${person.email}`;
    emailCell.append(email);
    gridCell(row, person.phone || "—", person.phone ? "" : "admin-grid-muted");
    gridCell(row, titleCase(person.contactPreference));
    gridCell(row, person.fieldOfStudy || "—", person.fieldOfStudy ? "" : "admin-grid-muted");
    const teamsCell = gridCell(row, "");
    const teamList = element("div", "admin-request-interests");
    if (person.teams?.length) person.teams.forEach(team => teamList.append(teamPill(team)));
    else teamList.append(element("span", "admin-grid-muted", "Unassigned"));
    teamsCell.append(teamList);
    gridCell(row, formatDate(person.lastSubmissionAt));

    const interestsCell = gridCell(row, "");
    const interestList = element("div", "admin-grid-opportunities");
    person.interests.forEach(interest => {
      const item = element("div", "admin-grid-opportunity");
      item.append(element("span", "", interest.title), statusPill(interest.status));
      interestList.append(item);
    });
    if (!person.interests.length) interestList.append(element("span", "admin-grid-muted", "None recorded"));
    interestsCell.append(interestList);
    gridCell(row, String(person.submissionCount), "admin-grid-count");
    gridCell(row, String(person.replyCount), "admin-grid-count");
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
}

function filterQuery() {
  const formData = new FormData(filterForm);
  const params = new URLSearchParams({ page: String(state.page), pageSize: "25" });
  for (const key of ["search", "status", "kind", "opportunity", "contactPreference", "replyState", "team", "dateFrom", "dateTo", "sort"]) {
    const value = String(formData.get(key) || "").trim();
    if (value) params.set(key, value);
  }
  return params;
}

function populateOpportunityFilter(filterOptions = {}) {
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

async function loadRecords() {
  previousPage.disabled = true;
  nextPage.disabled = true;
  if (state.view === "people") await loadPeople();
  else if (state.view === "requests") await loadSubmissions();
  else if (state.view === "grid") await loadPeopleGrid();
  else await loadTeams();
}

function switchView(view, focusTab = false) {
  state.view = view;
  state.page = 1;
  const showPeople = view === "people";
  const showRequests = view === "requests";
  const showGrid = view === "grid";
  const showTeams = view === "teams";
  peopleViewTab.classList.toggle("is-active", showPeople);
  peopleViewTab.setAttribute("aria-selected", String(showPeople));
  peopleViewTab.tabIndex = showPeople ? 0 : -1;
  requestsViewTab.classList.toggle("is-active", showRequests);
  requestsViewTab.setAttribute("aria-selected", String(showRequests));
  requestsViewTab.tabIndex = showRequests ? 0 : -1;
  gridViewTab.classList.toggle("is-active", showGrid);
  gridViewTab.setAttribute("aria-selected", String(showGrid));
  gridViewTab.tabIndex = showGrid ? 0 : -1;
  teamsViewTab.classList.toggle("is-active", showTeams);
  teamsViewTab.setAttribute("aria-selected", String(showTeams));
  teamsViewTab.tabIndex = showTeams ? 0 : -1;
  peopleList.hidden = !showPeople;
  submissionsList.hidden = !showRequests;
  peopleGrid.hidden = !showGrid;
  teamsWorkspace.hidden = !showTeams;
  filterForm.hidden = showTeams;
  recordsPagination.hidden = showTeams;
  exportButton.hidden = showTeams;
  submissionsEmpty.hidden = true;
  recordsTitle.textContent = showPeople ? "All people" : showRequests ? "Individual requests" : showGrid ? "People spreadsheet" : "Teams";
  if (focusTab) (showPeople ? peopleViewTab : showRequests ? requestsViewTab : showGrid ? gridViewTab : teamsViewTab).focus();
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
  const email = element("a", "", record.email);
  email.href = `mailto:${record.email}`;
  heroCopy.append(email);
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
  if (state.view === "teams") {
    await loadTeams();
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
    ["School or field", submission.fieldOfStudy],
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
    list.append(record);
  });
  section.append(list);
  return section;
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
  hero.append(renderPersonStats(person));
  fragment.append(hero);

  const grid = element("div", "admin-detail-grid");
  const profile = element("section", "admin-detail-card");
  profile.append(element("h3", "", "Contact profile"));
  profile.append(detailList([
    ["Preferred contact", titleCase(person.contactPreference)],
    ["School or field", person.fieldOfStudy],
    ["First recorded", formatDate(person.createdAt)],
    ["Last updated", formatDate(person.updatedAt)],
  ]));

  const interests = element("section", "admin-detail-card admin-detail-card-wide");
  interests.append(element("h3", "", "All trips and internships"));
  person.interests.forEach(interest => interests.append(createInterestRow(person, interest, "person")));
  if (!person.interests.length) interests.append(element("p", "admin-reply-help", "No interests are recorded for this person."));

  grid.append(profile, createTeamAssignments(person), interests, renderSubmissionHistory(person));
  const registrations = renderRegistrations(person);
  if (registrations) grid.append(registrations);
  grid.append(
    createReplyComposer(person, person.latestSubmissionId, "person"),
    createReplyHistory(person, "person"),
    createDeletionPanel({
      title: "Delete this applicant and all records",
      description: `Permanently removes the applicant, ${plural(person.submissions.length, "request")}, ${plural(person.interests.length, "interest")}, ${plural(person.replies.length, "saved reply")}, ${plural(person.registrations.length, "registration")}, and every team assignment.`,
      buttonLabel: "Delete applicant permanently",
      promptMessage: `Delete ${person.firstName} ${person.lastName} and all information connected to this applicant? This cannot be undone.`,
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
  identity.append(element("small", "", member.fieldOfStudy || "School or field not provided"));

  const contact = element("div", "admin-team-member-contact");
  const email = element("a", "", member.email);
  email.href = `mailto:${member.email}`;
  contact.append(email);
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

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  const submit = loginForm.querySelector("button[type='submit']");
  setBusy(submit, true, "Checking…");
  loginStatus.textContent = "Checking your password…";
  try {
    const { result } = await api("/login", { method: "POST", body: { password: passwordInput.value } });
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
  setBusy(event.currentTarget, true, "Signing out…");
  try { await api("/logout", { method: "POST", body: {} }); } catch { /* The local session is cleared regardless. */ }
  showLogin("You have signed out.");
  setBusy(event.currentTarget, false);
});

peopleViewTab.addEventListener("click", () => switchView("people"));
requestsViewTab.addEventListener("click", () => switchView("requests"));
gridViewTab.addEventListener("click", () => switchView("grid"));
teamsViewTab.addEventListener("click", () => switchView("teams"));
document.querySelector(".admin-view-tabs").addEventListener("keydown", event => {
  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  const views = ["people", "requests", "grid", "teams"];
  const direction = event.key === "ArrowRight" ? 1 : -1;
  const nextIndex = (views.indexOf(state.view) + direction + views.length) % views.length;
  switchView(views[nextIndex], true);
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
