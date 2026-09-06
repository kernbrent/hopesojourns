function node(tag, className, text) { const item = document.createElement(tag); if (className) item.className = className; if (text !== undefined) item.textContent = String(text); return item; }
function titleCase(value) { return String(value || "").replace(/_/g, " ").replace(/\b\w/g, character => character.toUpperCase()); }
function dateLabel(value) { if (!value) return "Dates being finalized"; return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`)); }
async function loadTrip() {
  const slug = new URLSearchParams(location.search).get("trip") || "";
  const loading = document.querySelector("#actual-trip-loading");
  const errorPanel = document.querySelector("#actual-trip-error");
  const page = document.querySelector("#actual-trip");
  try {
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("Trip not found");
    const response = await fetch(`/api/interest/public/trips/${encodeURIComponent(slug)}`, { headers: { Accept: "application/json" } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Trip not found");
    const trip = data.trip;
    document.title = `${trip.title} | Hope Sojourns`;
    document.querySelector("#actual-trip-code").textContent = trip.code;
    document.querySelector("#actual-trip-title").textContent = trip.title;
    document.querySelector("#actual-trip-summary").textContent = trip.public_summary || trip.subtitle || "A Hope Sojourns mission journey.";
    document.querySelector("#actual-trip-dates").textContent = trip.end_date && trip.end_date !== trip.start_date ? `${dateLabel(trip.start_date)} – ${dateLabel(trip.end_date)}` : dateLabel(trip.start_date);
    document.querySelector("#actual-trip-location").textContent = trip.location;
    document.querySelector("#actual-trip-status").textContent = titleCase(trip.status);
    document.querySelector("#actual-trip-capacity").textContent = trip.capacity ? `Up to ${trip.capacity} travelers` : "Team size being finalized";
    document.querySelector("#actual-trip-description").textContent = trip.public_description || trip.public_summary || "Details are being prepared with our ministry partners.";
    const interestUrl = trip.interest_enabled ? `/interest/?type=trip&opportunity=${encodeURIComponent(trip.opportunity_id || "")}&trip=${encodeURIComponent(trip.id)}` : "/schedule/";
    document.querySelectorAll("#actual-trip-interest, #actual-trip-interest-final").forEach(link => { link.href = interestUrl; link.textContent = trip.interest_enabled ? (trip.public_call_to_action || "I'm interested in this trip") : "Talk with Hope Sojourns"; });
    const content = document.querySelector("#actual-trip-content");
    content.replaceChildren();
    data.content.forEach(item => { const card = node("article"); const detail = [item.event_date ? dateLabel(item.event_date) : "", item.location].filter(Boolean).join(" · "); if (detail) card.append(node("small", "", detail)); card.append(node("h2", "", item.title), node("p", "", item.content)); if (item.link_url) { const link = node("a", "text-link", "Learn more →"); link.href = item.link_url; link.target = "_blank"; link.rel = "noopener noreferrer"; card.append(link); } content.append(card); });
    loading.hidden = true; page.hidden = false;
  } catch { loading.hidden = true; errorPanel.hidden = false; }
}
loadTrip();
