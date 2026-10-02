/* Home totals use the same operating ledger and included status as finance reports. */
window.HSHomeFinance = {
  async render(planning) {
    if (!planning?.isConnected) return;
    let bottom = planning.querySelector('.home-planning-bottom');
    if (!bottom) {
      const heading = [...planning.querySelectorAll('h2')].find(node => node.textContent === 'Tasks and deadlines');
      if (!heading) return;
      bottom = document.createElement('div');
      while (heading.nextSibling) bottom.append(heading.nextSibling);
      bottom.prepend(heading);
      planning.append(bottom);
    }
    bottom.classList.add('home-financial-layout');
    const notes = document.createElement('div');
    notes.className = 'home-planning-notes';
    while (bottom.firstChild) notes.append(bottom.firstChild);
    bottom.append(notes);
    const panel = document.createElement('section');
    panel.className = 'home-panel home-financial-summary';
    panel.setAttribute('aria-label', 'Financial summary');
    panel.innerHTML = '<h2>Financial summary</h2><p role="status">Loading financial totals…</p>';
    bottom.append(panel);
    try {
      const year = new Intl.DateTimeFormat('en-US', {timeZone:'America/Chicago',year:'numeric'}).format(new Date());
      const load = async suffix => {
        const response = await fetch('/api/interest/admin/finance/records?status=included'+suffix, {credentials:'same-origin',cache:'no-store'});
        if (!response.ok) throw new Error('Unable to load totals.');
        const {summary} = await response.json();
        if (![summary?.income,summary?.expenses].every(value => typeof value === 'number' && Number.isFinite(value))) throw new Error('Invalid totals.');
        return summary;
      };
      const [current,total] = await Promise.all([load('&from='+year+'-01-01&to='+year+'-12-31'),load('')]);
      if (!panel.isConnected) return;
      const cash = value => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(value);
      const group = (label,summary) => `<section><h3>${label}</h3><div class="home-financial-totals"><a href="/admin/finance/#income" data-admin-link><span>Total income</span><strong>${cash(summary.income)}</strong><small>View income &rarr;</small></a><a href="/admin/finance/#expenses" data-admin-link><span>Total expenses</span><strong>${cash(summary.expenses)}</strong><small>View expenses &rarr;</small></a></div></section>`;
      panel.innerHTML = `<h2>Financial summary</h2><p class="muted">Included records</p>${group('Current year · '+year,current)}${group('All time',total)}<p class="muted">Income is after payment fees. Transfers, pending gifts, and records needing review or excluded from reports are not counted. Links open the full Income or Expenses list.</p>`;
    } catch {
      if (panel.isConnected) panel.querySelector('[role="status"]').textContent = 'Financial totals are unavailable. Refresh to try again, or open Finances.';
    }
  }
};
