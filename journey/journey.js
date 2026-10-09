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
      result = await response.json(); window.HSPhones?.records(result);
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
  devotional: "Bible Studies & Worship",
  instruction: "Instructions",
  itinerary: "Daily itinerary",
  travel: "Travel",
  resource: "Resources",
  update: "Updates",
};

function openStudyAnchor() {
  let id;
  try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
  const day = document.getElementById(id);
  if (!day?.matches('details.journey-study-day')) return;
  const section=day.closest('.journey-section');
  if(section?.hidden){section.hidden=false;const view=document.querySelector('#journey-view');if(view){view.value=section.id;view.dispatchEvent(new Event('change'));}}
  day.open = true;
  day.querySelector('summary').focus({ preventScroll: true });
  day.scrollIntoView({ block: 'start', behavior: 'instant' });
}
window.addEventListener('hashchange', openStudyAnchor);

function studyDays(section, items, trip) {
  const jump = node('nav', 'journey-day-links');
  jump.setAttribute('aria-label', 'Choose a devotional day');
  section.append(node('p', 'journey-day-help', 'Choose a day to open its study, or select a banner below.'), jump);
  const groups = new Map();
  items.forEach((item, index) => {
    const key = item.event_date || `undated-${item.id || index}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  const hosts = new Map();
  [...groups].sort(([a], [b]) => a.localeCompare(b)).forEach(([key, entries]) => {
    const first = entries[0];
    const offset = first.event_date && trip.start_date
      ? (Date.parse(`${first.event_date}T00:00:00Z`) - Date.parse(`${trip.start_date}T00:00:00Z`)) / 86400000 + 1 : NaN;
    const titleDay = first.title.match(/^Day\s+(\d+)\b/i)?.[1];
    const dayLabel = Number.isInteger(offset) && offset > 0 ? `Day ${offset}` : titleDay ? `Day ${titleDay}` : 'Additional study';
    const date = first.event_date ? dateLabel(first.event_date) : 'Date to be announced';
    const details = node('details', 'journey-study-day');
    details.id = `journey-devotional-${key}`;
    const summary = node('summary', 'journey-study-summary');
    const heading = node('h3', 'journey-study-heading');
    heading.append(node('span', 'journey-study-day-label', dayLabel), node('span', 'journey-study-date', date));
    summary.append(heading);
    summary.append(node('span', 'journey-study-title', entries.length === 1
      ? first.title.replace(/^Day\s+\d+\s*/i, '').replace(/^[—–:-]\s*/, '')
      : `${entries.length} studies and devotionals`));
    const readings = [...new Set(entries.map(item => String(item.content || '').match(/^(?:Read aloud from the NIV|Scripture(?: reading)?|Bible reading):[ \t]*(.+)$/im)?.[1]?.trim()).filter(Boolean))];
    const scripture = node('span', 'journey-study-scripture');
    window.HSJourneyContent.appendScriptureLinks(scripture, readings.length ? `Scripture: ${readings.join(' · ')}` : 'Scripture readings inside the study');
    summary.append(scripture);
    const cue = node('span', 'journey-study-toggle', 'Open study');
    summary.append(cue);
    details.addEventListener('toggle', () => { cue.textContent = details.open ? 'Close study' : 'Open study'; });
    const body = node('div', 'journey-study-body');
    details.append(summary, body);
    section.append(details);
    entries.forEach(item => hosts.set(item, body));
    const link = node('a', '', first.event_date ? `${dayLabel} · ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${first.event_date}T12:00:00`))}` : `${dayLabel} · ${first.title}`);
    link.href = `#${details.id}`;
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (location.hash !== link.hash) history.pushState(null, '', link.hash);
      openStudyAnchor();
    });
    jump.append(link);
  });
  return hosts;
}

function render(data) {
  resetPasswordVisibility();
  login.hidden = true;
  portal.hidden = false;
  document.querySelector("#journey-code").textContent = data.trip.code;
  document.querySelector("#journey-title").textContent = data.trip.title;
  document.querySelector("#journey-meta").textContent = `${data.trip.start_date ? `${dateLabel(data.trip.start_date)}${data.trip.end_date ? ` \u2013 ${dateLabel(data.trip.end_date)}` : ""} \u00b7 ` : ""}${data.trip.location}`;
  document.title = `${data.trip.title} | Traveler Portal`;
  const publicLink=document.querySelector('#journey-public-link');
  publicLink.hidden=!data.trip.public_enabled;
  publicLink.href='/trip/?trip='+encodeURIComponent(data.trip.slug);
  window.HSTripCalendar.render(document.querySelector('#journey-calendar'),data.trip,data.content);

  const navigation = document.querySelector(".journey-nav");
  const content = document.querySelector("#journey-content");
  navigation.replaceChildren();
  const packetButton=node('button','journey-packet-download','Download traveler packet');packetButton.type='button';packetButton.onclick=()=>window.HSTravelerPacket.download(data.trip,data.content,data.members);navigation.append(packetButton);
  content.replaceChildren();
  if(data.memories?.length){const section=node('section','journey-section');section.id='trip-memories';const link=node('a','', 'Photos & memories');link.href='#trip-memories';navigation.append(link);window.HSTripMemoriesView.collection(section,data.memories);content.append(section);}
  const I=window.HSItinerary;
  const sorted=data.content.slice().sort((a,b)=>(a.event_date||'9999').localeCompare(b.event_date||'9999')||(a.event_time||'').localeCompare(b.event_time||'')||(a.sort_order||0)-(b.sort_order||0));
  function entry(item){
    const article=node('article','journey-item');article.append(node('h3','',item.title));
    article.append(node('p','journey-item-meta',[I.isItinerary(item)?I.labels[I.category(item)]:'',item.event_date?dateLabel(item.event_date):'Date to be announced',item.event_time,item.location].filter(Boolean).join(' · ')));
    if(I.category(item)==='transportation')article.append(window.HSTravelDetails.render(item));
    article.append(I.render(item),window.HSJourneyContent.render(item.content,{study:item.content_type==='devotional'}));
    if(item.link_url){const a=node('a','text-link','Open resource →');a.href=item.link_url;a.target='_blank';a.rel='noopener noreferrer';article.append(a);}return article;
  }
  function section(id,title){const host=node('section','journey-section');host.id=id;host.append(node('h2','',title));content.append(host);const link=node('a','',title);link.href='#'+id;navigation.append(link);return host;}
  const schedule=sorted.filter(I.isItinerary);
  if(schedule.length){
    const host=section('journey-by-day','By day'),days=new Map();
    schedule.forEach(item=>I.dates(item).forEach(day=>{if(!days.has(day))days.set(day,[]);days.get(day).push(item);}));
    [...days].sort(([a],[b])=>a.localeCompare(b)).forEach(([day,items])=>{const group=node('details','journey-study-day');group.append(node('summary','journey-study-summary',day==='undated'?'Dates to be announced':dateLabel(day)));items.forEach(item=>group.append(entry(item)));host.append(group);});
  }
  const grouped=new Map();sorted.forEach(item=>I.sections(item).forEach(type=>{if(!grouped.has(type))grouped.set(type,[]);grouped.get(type).push(item);}));
  grouped.forEach((items,type)=>{
    if(type==='daily')return; // Daily overviews are already in By day; tags add specialty views.
    const host=section(type==='worship'?'journey-devotional':'journey-'+type,I.labels[type]||labels[type]||type);
    const dayHosts=type==='worship'?studyDays(host,items,data.trip):null;
    items.forEach(item=>(dayHosts?.get(item)||host).append(entry(item)));
  });
  const viewLabel=node('label','journey-view-label','Show '),view=node('select','journey-view');view.id='journey-view';view.add(new Option('All sections','all'));
  content.querySelectorAll('.journey-section').forEach(host=>view.add(new Option(host.querySelector('h2')?.textContent||'Photos & memories',host.id)));
  view.addEventListener('change',()=>content.querySelectorAll('.journey-section').forEach(host=>host.hidden=view.value!=='all'&&host.id!==view.value));
  navigation.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{view.value=link.hash.slice(1);view.dispatchEvent(new Event('change'));}));
  viewLabel.append(view);navigation.prepend(viewLabel);
  if (!data.content.length && !data.memories?.length) {
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
  openStudyAnchor();
}

function requestedTripMatches(trip) {
  const params = new URLSearchParams(location.search);
  const tripId = params.get("tripId");
  if (tripId) return String(trip.id) === tripId;
  const publicTrip = params.get("publicTrip");
  if (publicTrip) return trip.slug === publicTrip;
  const requested = params.get("trip")?.trim().toUpperCase();
  return !requested || [trip.code, trip.slug, trip.portal_login_id]
    .some(value => value && String(value).toUpperCase() === requested);
}

async function restore() {
  const requested = new URLSearchParams(location.search).get("trip");
  if (requested) document.querySelector("#journey-login-form").elements.loginId.value = requested.toUpperCase();
  try {
    const data = await api("/portal/session");
    if (!requestedTripMatches(data.trip)) {
      login.hidden = false;
      portal.hidden = true;
      setStatus("Enter this trip's password to open the trip you selected.");
      return;
    }
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
    const signedIn = await api("/portal/login", {
      method: "POST",
      body: JSON.stringify({ loginId: form.elements.loginId.value, password: form.elements.password.value }),
    });
    const data = await loadPortalSession();
    if (data.trip.slug !== signedIn.trip.slug) {
      throw new Error("Your trip session changed. Please sign in to the selected trip again.");
    }
    const url = new URL(location.href);
    url.searchParams.set("trip", form.elements.loginId.value.trim().toUpperCase());
    url.searchParams.set("tripId", data.trip.id);
    history.replaceState(null, "", url);
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

async function initialize() {
  const params = new URLSearchParams(location.search);
  const publicSlug = params.get('publicTrip');
  if (publicSlug && /^[a-z0-9-]+$/.test(publicSlug)) {
    try {
      const data = await api('/public/trips/' + encodeURIComponent(publicSlug));
      const link = document.querySelector('#journey-public-login-link');
      link.href = '/trip/?trip=' + encodeURIComponent(data.trip.slug);
      link.textContent = 'Follow ' + data.trip.title + ' publicly — no sign-in needed →';
      if (data.trip.portal_available && data.trip.portal_login_id) {
        const url = new URL(location.href);
        url.searchParams.set('trip', data.trip.portal_login_id);
        url.searchParams.set('tripId', data.trip.id);
        history.replaceState(null, '', url);
      }
    } catch {
      // Keep manual sign-in available if the public trip lookup fails.
    }
  }
  await restore();
}
initialize();
