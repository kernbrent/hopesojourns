const API_BASE = "/api/interest";
const REQUEST_TIMEOUT_MS = 15_000;
const SESSION_RETRY_DELAYS = [300, 800];
const login = document.querySelector("#journey-login");
const portal = document.querySelector("#journey-portal");
const status = document.querySelector("[data-journey-status]");

function node(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = String(text);
  return item;
}

function dateLabel(value) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(date);
}

function setStatus(message, type = "") {
  status.textContent = message;
  if (type) status.dataset.status = type;
  else status.removeAttribute("data-status");
}

function delay(milliseconds) {
  return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}

function setLoginBusy(form, busy) {
  form.setAttribute("aria-busy", String(busy));
  form.querySelector('button[type="submit"]').disabled = busy;
}

async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      credentials: "same-origin",
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    let result = {};
    try {
      result = await response.json();
    } catch {
      result = {};
    }
    if (!response.ok) {
      const error = new Error(result.error || "The traveler portal is not available.");
      error.status = response.status;
      error.code = result.code || "";
      throw error;
    }
    return result;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("The traveler portal took too long to respond. Please try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function loadPortalSession() {
  for (let attempt = 0; attempt <= SESSION_RETRY_DELAYS.length; attempt += 1) {
    try {
      return await api("/portal/session");
    } catch (error) {
      if (error.status !== 401 || attempt === SESSION_RETRY_DELAYS.length) throw error;
      await delay(SESSION_RETRY_DELAYS[attempt]);
    }
  }
  throw new Error("The traveler portal session could not be opened. Please try again.");
}

function resetPasswordVisibility() {
  const input = document.querySelector("#journey-password");
  const button = document.querySelector("#journey-password-toggle");
  input.type = "password";
  button.setAttribute("aria-pressed", "false");
  button.setAttribute("aria-label", "Show trip password");
}

document.querySelector("#journey-password-toggle").addEventListener("click", event => {
  const input = document.querySelector("#journey-password");
  const revealing = input.type === "password";
  input.type = revealing ? "text" : "password";
  event.currentTarget.setAttribute("aria-pressed", String(revealing));
  event.currentTarget.setAttribute("aria-label", `${revealing ? "Hide" : "Show"} trip password`);
  input.focus();
});

const labels = {
  overview: "Overview",
  devotional: "Daily devotionals",
  instruction: "Instructions",
  itinerary: "Itinerary",
  resource: "Resources",
  update: "Updates",
};

function render(data) {
  resetPasswordVisibility();
  login.hidden = true;
  portal.hidden = false;
  document.querySelector("#journey-code").textContent = data.trip.code;
  document.querySelector("#journey-title").textContent = data.trip.title;
  document.querySelector("#journey-meta").textContent = `${data.trip.start_date ? `${dateLabel(data.trip.start_date)}${data.trip.end_date ? ` \u2013 ${dateLabel(data.trip.end_date)}` : ""} \u00b7 ` : ""}${data.trip.location}`;
  document.title = `${data.trip.title} | Traveler Portal`;

  const navigation = document.querySelector(".journey-nav");
  const content = document.querySelector("#journey-content");
  navigation.replaceChildren();
  content.replaceChildren();
  const grouped = new Map();
  data.content.forEach(item => {
    if (!grouped.has(item.content_type)) grouped.set(item.content_type, []);
    grouped.get(item.content_type).push(item);
  });
  grouped.forEach((items, type) => {
    const section = node("section", "journey-section");
    section.id = `journey-${type}`;
    section.append(node("h2", "", labels[type] || type));
    items.forEach(item => {
      const article = node("article", "journey-item");
      article.append(node("h3", "", item.title));
      const meta = node("div", "journey-item-meta");
      [item.event_date ? dateLabel(item.event_date) : "", item.event_time, item.location]
        .filter(Boolean)
        .forEach(value => meta.append(node("span", "", value)));
      if (meta.childNodes.length) article.append(meta);
      article.append(node("p", "", item.content));
      if (item.link_url) {
        const link = node("a", "text-link", "Open resource \u2192");
        link.href = item.link_url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        article.append(link);
      }
      section.append(article);
    });
    content.append(section);
    const link = node("a", "", labels[type] || type);
    link.href = `#${section.id}`;
    navigation.append(link);
  });
  if (!data.content.length) {
    content.append(node("section", "journey-section", "Your trip leader is still preparing the portal. Please check back soon."));
  }

  const team = document.querySelector("#journey-team-grid");
  team.replaceChildren();
  data.members.forEach(person => {
    const card = node("article", "journey-person");
    card.append(
      node("h3", "", `${person.preferred_name || person.first_name} ${person.last_name}`),
      node("p", "", [person.role, person.city, person.region].filter(Boolean).join(" \u00b7 ")),
    );
    if (person.email) {
      const email = node("a", "text-link", person.email);
      email.href = `mailto:${person.email}`;
      card.append(email);
    }
    if (person.phone) {
      const phone = node("a", "text-link", person.phone);
      phone.href = `tel:${person.phone}`;
      card.append(phone);
    }
    team.append(card);
  });
  document.querySelector("#journey-team").hidden = !data.members.length;
}

async function restore() {
  try {
    const data = await api("/portal/session");
    setStatus("");
    render(data);
  } catch (error) {
    login.hidden = false;
    portal.hidden = true;
    setStatus(error.status === 401 ? "" : error.message, error.status === 401 ? "" : "error");
    const requested = new URLSearchParams(location.search).get("trip");
    if (requested) {
      document.querySelector("#journey-login-form").elements.loginId.value = requested.toUpperCase();
    }
  }
}

document.querySelector("#journey-login-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const progressTimer = window.setTimeout(
    () => setStatus("Still opening your trip. This may take a few more seconds\u2026"),
    4_000,
  );
  setLoginBusy(form, true);
  setStatus("Opening your trip\u2026");
  try {
    await api("/portal/login", {
      method: "POST",
      body: JSON.stringify({ loginId: form.elements.loginId.value, password: form.elements.password.value }),
    });
    const data = await loadPortalSession();
    form.elements.password.value = "";
    resetPasswordVisibility();
    setStatus("");
    render(data);
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    window.clearTimeout(progressTimer);
    setLoginBusy(form, false);
  }
});

document.querySelector("#journey-signout").addEventListener("click", async () => {
  try {
    await api("/portal/logout", { method: "POST", body: "{}" });
  } finally {
    portal.hidden = true;
    login.hidden = false;
    document.querySelector("#journey-login-form").elements.password.value = "";
    resetPasswordVisibility();
    setStatus("");
  }
});

restore();
