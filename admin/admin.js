"use strict";

const API_BASE = "/api/interest/admin";
const loginPanel = document.querySelector("#login-panel");
const dashboardPanel = document.querySelector("#dashboard-panel");
const loginForm = document.querySelector("#admin-login-form");
const passwordInput = document.querySelector("#admin-password");
const loginStatus = document.querySelector("#login-status");
const submissionsList = document.querySelector("#submissions-list");
const submissionsEmpty = document.querySelector("#submissions-empty");
const submissionsStatus = document.querySelector("#submissions-status");
const filterForm = document.querySelector("#submission-filters");
const resultsCount = document.querySelector("#results-count");
const previousPage = document.querySelector("#previous-page");
const nextPage = document.querySelector("#next-page");
const pageLabel = document.querySelector("#page-label");
const submissionDialog = document.querySelector("#submission-dialog");
const submissionDetail = document.querySelector("#submission-detail");
const detailStatus = document.querySelector("#detail-status");

const state = {
  csrfToken: "",
  page: 1,
  pages: 1,
  currentSubmissionId: "",
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
  loadSubmissions();
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
  contact.append(element("small", "", submission.phone || `Prefers ${submission.contactPreference}`));

  const interests = element("span", "admin-request-interests");
  submission.interests.slice(0, 3).forEach(item => {
    interests.append(interestPill(item));
    interests.append(statusPill(item.status));
  });
  if (submission.interests.length > 3) interests.append(element("span", "admin-interest-pill", `+${submission.interests.length - 3} more`));

  const arrow = element("span", "admin-request-arrow", "→");
  arrow.setAttribute("aria-hidden", "true");
  arrow.append(element("small", "", submission.replyCount ? `${submission.replyCount} saved ${submission.replyCount === 1 ? "reply" : "replies"}` : "Open request"));
  card.append(person, contact, interests, arrow);
  return card;
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
  for (const key of ["search", "status", "kind"]) {
    const value = String(formData.get(key) || "").trim();
    if (value) params.set(key, value);
  }
  return params;
}

async function loadSubmissions() {
  submissionsStatus.textContent = "Loading requests…";
  submissionsList.setAttribute("aria-busy", "true");
  previousPage.disabled = true;
  nextPage.disabled = true;
  try {
    const { result } = await api(`/submissions?${filterQuery()}`);
    submissionsList.replaceChildren(...result.submissions.map(renderSubmissionCard));
    submissionsEmpty.hidden = result.submissions.length > 0;
    renderSummary(result.summary);
    state.page = result.pagination.page;
    state.pages = result.pagination.pages;
    pageLabel.textContent = `Page ${state.page} of ${state.pages}`;
    previousPage.disabled = state.page <= 1;
    nextPage.disabled = state.page >= state.pages;
    resultsCount.textContent = `${result.pagination.total} ${result.pagination.total === 1 ? "request" : "requests"}`;
    submissionsStatus.textContent = "";
  } catch (error) {
    if (error.status !== 401) submissionsStatus.textContent = error.message;
  } finally {
    submissionsList.removeAttribute("aria-busy");
  }
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

function createInterestRow(submission, interest) {
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
    setBusy(save, true, "Saving…");
    detailStatus.textContent = "";
    try {
      await api(`/submissions/${submission.id}/status`, {
        method: "POST",
        body: { interestId: interest.id, status: select.value },
      });
      detailStatus.textContent = `${interest.title} is now ${titleCase(select.value).toLowerCase()}.`;
      await Promise.all([loadSubmissionDetail(submission.id), loadSubmissions()]);
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

function createReplyItem(reply, submissionId) {
  const item = element("article", "admin-reply-item");
  const header = element("header");
  header.append(element("h4", "", reply.subject), statusPill(reply.deliveryStatus));
  const body = element("p", "", reply.body);
  const footer = element("footer");
  footer.append(element("span", "", reply.deliveryStatus === "sent"
    ? `Marked sent ${formatDate(reply.sentAt)}`
    : `Saved ${formatDate(reply.createdAt)}`));
  if (reply.deliveryStatus !== "sent") {
    const markSent = element("button", "admin-button admin-button-outline", "Mark sent");
    markSent.type = "button";
    markSent.addEventListener("click", async () => {
      setBusy(markSent, true, "Saving…");
      try {
        await api(`/replies/${reply.id}/sent`, { method: "POST", body: {} });
        detailStatus.textContent = "Reply marked as sent.";
        await Promise.all([loadSubmissionDetail(submissionId), loadSubmissions()]);
      } catch (error) {
        detailStatus.textContent = error.message;
      } finally {
        setBusy(markSent, false);
      }
    });
    footer.append(markSent);
  }
  item.append(header, body, footer);
  return item;
}

function replyDraft(submission) {
  const selected = submission.interests.filter(interest => interest.selectedInSubmission).map(interest => interest.title);
  const opportunityText = selected.length ? selected.join(", ") : "Hope Sojourns";
  return {
    subject: `Hope Sojourns follow-up for ${submission.firstName}`,
    message: `Hi ${submission.firstName},\n\nThank you for sharing your interest in ${opportunityText}. I would be glad to learn more about what you are hoping for and answer your questions.\n\nWhat days or times would work well for a short conversation?\n\nGo with Hope. Serve with Faith.\nHope Sojourns`,
  };
}

function renderSubmissionDetail(submission) {
  const fragment = document.createDocumentFragment();
  const hero = element("section", "admin-detail-hero");
  const heroCopy = element("div");
  heroCopy.append(element("h3", "", `${submission.firstName} ${submission.lastName}`));
  const email = element("a", "", submission.email);
  email.href = `mailto:${submission.email}`;
  heroCopy.append(email);
  if (submission.phone) {
    const phone = element("p");
    const phoneLink = element("a", "", submission.phone);
    phoneLink.href = `tel:${submission.phone.replace(/[^0-9+]/g, "")}`;
    phone.append(phoneLink);
    heroCopy.append(phone);
  }
  const received = element("div");
  received.append(element("p", "", "Received"), element("strong", "", formatDate(submission.createdAt)));
  hero.append(heroCopy, received);
  fragment.append(hero);

  const grid = element("div", "admin-detail-grid");
  const profile = element("section", "admin-detail-card");
  profile.append(element("h3", "", "Contact profile"));
  profile.append(detailList([
    ["Preferred contact", titleCase(submission.contactPreference)],
    ["School or field", submission.fieldOfStudy],
    ["Preferred timing", submission.preferredTiming],
    ["Consent recorded", formatDate(submission.consentAt)],
  ]));

  const message = element("section", "admin-detail-card");
  message.append(element("h3", "", "What they shared"));
  message.append(element("p", "", submission.message || "No additional message was included."));

  const interests = element("section", "admin-detail-card admin-detail-card-wide");
  interests.append(element("h3", "", "Trips and internships"));
  submission.interests.forEach(interest => interests.append(createInterestRow(submission, interest)));

  const reply = element("section", "admin-detail-card");
  reply.append(element("h3", "", "Prepare a reply"));
  const form = element("form", "admin-reply-form");
  const draft = replyDraft(submission);
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
      const { result } = await api(`/submissions/${submission.id}/replies`, {
        method: "POST",
        body: { subject: subject.value, message: replyMessage.value },
      });
      detailStatus.textContent = result.message;
      window.location.href = result.mailtoUrl;
      await Promise.all([loadSubmissionDetail(submission.id), loadSubmissions()]);
    } catch (error) {
      detailStatus.textContent = error.message;
    } finally {
      setBusy(send, false);
    }
  });

  const history = element("section", "admin-detail-card");
  history.append(element("h3", "", "Reply history"));
  const historyList = element("div", "admin-reply-history");
  if (submission.replies.length) submission.replies.forEach(item => historyList.append(createReplyItem(item, submission.id)));
  else historyList.append(element("p", "admin-reply-help", "No replies have been prepared for this request yet."));
  history.append(historyList);

  grid.append(profile, message, interests, reply, history);
  fragment.append(grid);
  submissionDetail.replaceChildren(fragment);
}

async function loadSubmissionDetail(submissionId) {
  detailStatus.textContent = "Loading request…";
  try {
    const { result } = await api(`/submissions/${submissionId}`);
    renderSubmissionDetail(result.submission);
    document.querySelector("#detail-title").textContent = `${result.submission.firstName} ${result.submission.lastName}`;
    detailStatus.textContent = "";
  } catch (error) {
    if (error.status !== 401) detailStatus.textContent = error.message;
  }
}

async function openSubmission(submissionId) {
  state.currentSubmissionId = submissionId;
  submissionDetail.replaceChildren();
  document.querySelector("#detail-title").textContent = "Request details";
  if (!submissionDialog.open) submissionDialog.showModal();
  await loadSubmissionDetail(submissionId);
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

filterForm.addEventListener("submit", event => {
  event.preventDefault();
  state.page = 1;
  loadSubmissions();
});
document.querySelector("#reset-filters").addEventListener("click", () => {
  filterForm.reset();
  state.page = 1;
  loadSubmissions();
});
document.querySelector("#refresh-submissions").addEventListener("click", event => {
  setBusy(event.currentTarget, true, "Refreshing…");
  loadSubmissions().finally(() => setBusy(event.currentTarget, false));
});
previousPage.addEventListener("click", () => { if (state.page > 1) { state.page -= 1; loadSubmissions(); } });
nextPage.addEventListener("click", () => { if (state.page < state.pages) { state.page += 1; loadSubmissions(); } });

document.querySelector("#export-submissions").addEventListener("click", async event => {
  const button = event.currentTarget;
  setBusy(button, true, "Preparing…");
  submissionsStatus.textContent = "";
  try {
    const response = await fetch(`${API_BASE}/export.csv`, { credentials: "same-origin" });
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
    submissionsStatus.textContent = "The CSV export was downloaded.";
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
