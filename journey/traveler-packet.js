/* Download a self-contained traveler packet for offline reading or printing. */
(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function download(trip, content, members = []) {
    const items = content.filter(item => item.publication_status === 'published' && item.visibility !== 'admin')
      .slice().sort((a, b) => (a.event_date || '9999').localeCompare(b.event_date || '9999')
        || (a.event_time || '').localeCompare(b.event_time || '') || (a.sort_order || 0) - (b.sort_order || 0));
    const contentHtml = items.map(item => {
      const body = window.HSJourneyContent?.render
        ? window.HSJourneyContent.render(item.content, {study: item.content_type === 'devotional'}).outerHTML
        : `<div>${esc(item.content)}</div>`;
      const resource = /^https:\/\//i.test(item.link_url || '')
        ? `<p><a href="${esc(item.link_url)}">Open resource</a></p>` : '';
      return `<article><h2>${esc(item.title)}</h2><p>${esc([item.event_date, item.event_time, item.location].filter(Boolean).join(' · '))}</p>${body}${resource}</article>`;
    }).join('');
    const teamHtml = members.length ? '<h2>Selected team contacts</h2>' + members.map(member =>
      `<article><h3>${esc((member.preferred_name || member.first_name) + ' ' + member.last_name)}</h3><p>${esc([member.role, member.email, member.phone].filter(Boolean).join(' · '))}</p></article>`
    ).join('') : '';
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(trip.title)} — Traveler packet</title><style>body{font:18px/1.6 Georgia,serif;max-width:850px;margin:2rem auto;padding:1rem}article{break-inside:avoid;margin:2rem 0}.journey-prose p,.journey-prose li{white-space:pre-wrap}.journey-prose h4{margin:1.5rem 0 .5rem}h1,h2,h3{line-height:1.2}a{overflow-wrap:anywhere}@media print{body{font-size:11pt;margin:0}.print-help{display:none}h2,h3{break-after:avoid}article{break-inside:auto}}</style><h1>${esc(trip.title)}</h1><p>${esc([trip.start_date, trip.end_date, trip.location].filter(Boolean).join(' · '))}</p><p class="print-help">Saved for offline use. Use your browser’s Print command to print or save as PDF. Scripture and external resource links need an internet connection.</p><p>Prepared ${esc(new Date().toLocaleDateString())}. This copy does not update automatically.</p>${contentHtml}${teamHtml}</html>`;
    const url = URL.createObjectURL(new Blob([html], {type: 'text/html;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = (trip.code || 'trip').replace(/[^a-z0-9_-]/gi, '-') + '-traveler-packet.html';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.HSTravelerPacket = {download};
})();
