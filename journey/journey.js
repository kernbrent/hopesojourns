const API_BASE = "/api/interest";
const login = document.querySelector("#journey-login");
const portal = document.querySelector("#journey-portal");
const status = document.querySelector("[data-journey-status]");

function node(tag, className, text) { const item = document.createElement(tag); if (className) item.className = className; if (text !== undefined) item.textContent = String(text); return item; }
function dateLabel(value) { if (!value) return ""; const date = new Date(`${value}T12:00:00`); return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(date); }
function setStatus(message, type = "") { status.textContent = message; if (type) status.dataset.status = type; else status.removeAttribute("data-status"); }
async function api(path, options = {}) { const response = await fetch(`${API_BASE}${path}`, { credentials: "same-origin", ...options, headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) } }); let result = {}; try { result = await response.json(); } catch { result = {}; } if (!response.ok) throw new Error(result.error || "The traveler portal is not available."); return result; }

const labels = { overview: "Overview", devotional: "Daily devotionals", instruction: "Instructions", itinerary: "Itinerary", resource: "Resources", update: "Updates" };

function render(data) {
  login.hidden = true;
  portal.hidden = false;
  document.querySelector("#journey-code").textContent = data.trip.code;
  document.querySelector("#journey-title").textContent = data.trip.title;
  document.querySelector("#journey-meta").textContent = `${data.trip.start_date ? `${dateLabel(data.trip.start_date)}${data.trip.end_date ? ` – ${dateLabel(data.trip.end_date)}` : ""} · ` : ""}${data.trip.location}`;
  document.title = `${data.trip.title} | Traveler Portal`;
  const navigation = document.querySelector(".journey-nav");
  const content = document.querySelector("#journey-content");
  navigation.replaceChildren(); content.replaceChildren();
  const grouped = new Map();
  data.content.forEach(item => { if (!grouped.has(item.content_type)) grouped.set(item.content_type, []); grouped.get(item.content_type).push(item); });
  grouped.forEach((items, type) => {
    const section = node("section", "journey-section"); section.id = `journey-${type}`;
    section.append(node("h2", "", labels[type] || type));
    items.forEach(item => { const article = node("article", "journey-item"); article.append(node("h3", "", item.title)); const meta = node("div", "journey-item-meta"); [item.event_date ? dateLabel(item.event_date) : "", item.event_time, item.location].filter(Boolean).forEach(value => meta.append(node("span", "", value))); if (meta.childNodes.length) article.append(meta); article.append(node("p", "", item.content)); if (item.link_url) { const link = node("a", "text-link", "Open resource →"); link.href = item.link_url; link.target = "_blank"; link.rel = "noopener noreferrer"; article.append(link); } section.append(article); });
    content.append(section); const link = node("a", "", labels[type] || type); link.href = `#${section.id}`; navigation.append(link);
  });
  if (!data.content.length) content.append(node("section", "journey-section", "Your trip leader is still preparing the portal. Please check back soon."));
  const team = document.querySelector("#journey-team-grid"); team.replaceChildren();
  data.members.forEach(person => { const card = node("article", "journey-person"); card.append(node("h3", "", `${person.preferred_name || person.first_name} ${person.last_name}`), node("p", "", [person.role, person.city, person.region].filter(Boolean).join(" · "))); if (person.email) { const email = node("a", "text-link", person.email); email.href = `mailto:${person.email}`; card.append(email); } if (person.phone) { const phone = node("a", "text-link", person.phone); phone.href = `tel:${person.phone}`; card.append(phone); } team.append(card); });
  document.querySelector("#journey-team").hidden = !data.members.length;
}

async function restore() { try { render(await api("/portal/session")); } catch { login.hidden = false; portal.hidden = true; const requested = new URLSearchParams(location.search).get("trip"); if (requested) document.querySelector("#journey-login-form").elements.loginId.value = requested.toUpperCase(); } }
document.querySelector("#journey-login-form").addEventListener("submit", async event => { event.preventDefault(); const form = event.currentTarget; setStatus("Opening your trip…"); try { await api("/portal/login", { method: "POST", body: JSON.stringify({ loginId: form.elements.loginId.value, password: form.elements.password.value }) }); form.elements.password.value = ""; render(await api("/portal/session")); } catch (error) { setStatus(error.message, "error"); } });
document.querySelector("#journey-signout").addEventListener("click", async () => { try { await api("/portal/logout", { method: "POST", body: "{}" }); } finally { portal.hidden = true; login.hidden = false; } });
restore();
