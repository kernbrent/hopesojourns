(() => {
  const grid = document.getElementById("resource-grid");
  if (!grid) return;
  const filters = document.getElementById("resource-filters");
  const search = document.getElementById("resource-search");
  const count = document.getElementById("resource-count");
  const empty = document.getElementById("resource-empty");
  const featured = document.getElementById("featured-resource");
  let items = [];
  let activeType = "All";
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  const date = value => value ? new Intl.DateTimeFormat("en-US", {year:"numeric",month:"short",day:"numeric"}).format(new Date(`${value}T12:00:00`)) : "";
  const isAudio = item => Boolean(item.url && /\.(mp3|m4a|aac|wav|ogg)(?:[?#].*)?$/i.test(item.url));
  const related = item => (item.relatedIds || []).map(id => items.find(x => x.id === id)).filter(Boolean);
  const card = (item, isFeatured = false) => {
    const connected = related(item);
    const meta = [item.type, item.format, item.pageCount, item.fileSize, item.duration, date(item.date), item.status].filter(Boolean).map(esc).join(" · ");
    const action = isAudio(item)
      ? `<audio class="resource-audio" controls preload="metadata" src="${esc(item.url)}" aria-label="Play ${esc(item.title)}">Your browser does not support audio playback. <a href="${esc(item.url)}">Open the audio file</a>.</audio>`
      : item.url && item.downloadUrl
      ? `<div class="resource-download-actions"><a class="text-link" href="${esc(item.url)}"${/^https?:/.test(item.url) ? ' target="_blank" rel="noopener"' : ''}>${esc(item.actionLabel || "Explore")} &rarr;</a><a class="button compact secondary on-light" href="${esc(item.downloadUrl)}" download="${esc(item.downloadName || "")}" aria-label="${esc(item.downloadLabel || "Download PDF")} version of ${esc(item.title)}">${esc(item.downloadLabel || "Download PDF")} <span aria-hidden="true">&darr;</span></a></div>`
      : item.url && item.downloadLabel
      ? `<div class="resource-download-actions"><a class="button" href="${esc(item.url)}" target="_blank" rel="noopener" aria-label="${esc(item.actionLabel || "Open the PDF")} (PDF, opens in a new tab)">${esc(item.actionLabel || "Open the PDF")}</a><a class="text-link" href="${esc(item.url)}" download="${esc(item.downloadName || "")}" aria-label="${esc(item.downloadLabel)}${item.fileSize ? ` (${esc(item.fileSize)})` : ""}">${esc(item.downloadLabel)} <span aria-hidden="true">&darr;</span></a></div>`
      : item.url
      ? `<a class="text-link" href="${esc(item.url)}"${/^https?:/.test(item.url) ? ' target="_blank" rel="noopener"' : ''}>${esc(item.actionLabel || "Explore")} &rarr;</a>`
      : `<span class="resource-coming">${esc(item.status || "Coming soon")}</span>`;
    const links = connected.length ? `<div class="resource-related"><strong>Continue this theme</strong>${connected.map(x => x.url ? `<a href="${esc(x.url)}"${/^https?:/.test(x.url) ? ' target="_blank" rel="noopener"' : ''}>${esc(x.type)}: ${esc(x.title)}</a>` : `<span>${esc(x.type)}: ${esc(x.title)} (${esc(x.status || "Coming soon")})</span>`).join("")}</div>` : "";
    return `<article class="resource-card${isFeatured ? " resource-card-featured" : ""}" data-type="${esc(item.type)}"><div class="resource-card-top"><span class="resource-type">${esc(item.type)}</span>${item.collection ? `<span class="resource-collection">Part of ${esc(item.collection)}</span>` : ""}</div><h3>${esc(item.title)}</h3>${item.subtitle ? `<p class="resource-subtitle">${esc(item.subtitle)}</p>` : ""}<p>${esc(item.description)}</p><div class="resource-meta">${meta}</div>${links}<div class="resource-action">${action}</div></article>`;
  };
  const render = () => {
    const q = search.value.trim().toLowerCase();
    const visible = items.filter(item => {
      const haystack = [item.title,item.subtitle,item.description,item.author,item.collection,item.type,...(item.tags || [])].join(" ").toLowerCase();
      return (activeType === "All" || item.type === activeType) && (!q || haystack.includes(q));
    });
    const featuredItems = visible.filter(x => x.featured);
    const featuredIds = new Set(featuredItems.map(x => x.id));
    featured.innerHTML = featuredItems.length ? `<p class="eyebrow">Featured</p><div class="featured-resource-grid">${featuredItems.map(x => card(x, true)).join("")}</div>` : "";
    grid.innerHTML = visible.filter(x => !featuredIds.has(x.id)).map(x => card(x)).join("");
    count.textContent = `${visible.length} ${visible.length === 1 ? "resource" : "resources"}`;
    empty.hidden = visible.length !== 0;
  };
  fetch("/resources/resources.json", {cache:"no-store"}).then(r => { if (!r.ok) throw new Error("Resources unavailable"); return r.json(); }).then(data => {
    items = data.items || [];
    const types = ["All", ...new Set(items.map(x => x.type).filter(Boolean))];
    filters.innerHTML = types.map(type => `<button class="resource-filter" type="button" aria-pressed="${type === "All"}" data-type="${esc(type)}">${esc(type)}</button>`).join("");
    filters.addEventListener("click", event => { const button = event.target.closest("button[data-type]"); if (!button) return; activeType = button.dataset.type; filters.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === button))); render(); });
    search.addEventListener("input", render);
    render();
  }).catch(() => { count.textContent = "Resources could not be loaded."; empty.hidden = false; empty.textContent = "Please try again later."; });

  document.addEventListener("play", event => {
    if (!event.target.matches("audio.resource-audio")) return;
    document.querySelectorAll("audio.resource-audio").forEach(player => {
      if (player !== event.target && !player.paused) player.pause();
    });
  }, true);
})();
