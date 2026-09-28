/* Column selections are local to the People list and combine with its search filters. */
(() => {
  const values = (person, key) => key === 'contactTypes'
    ? (person.contactTypes?.length ? person.contactTypes : [''])
    : [String(person.organization || '').trim()];
  const matches = (person, selections) => Object.entries(selections).every(([key, selected]) =>
    selected === null || values(person, key).some(value => selected.has(value)));
  // Preserve server escaping and all exported columns, including quoted multiline notes.
  function filterCsv(csv, ids) {
    const rows = []; let start = 0; let quoted = false;
    for (let i = 0; i < csv.length; i++) {
      if (csv[i] === '"') { if (quoted && csv[i + 1] === '"') i++; else quoted = !quoted; }
      else if (csv[i] === '\n' && !quoted) { rows.push(csv.slice(start, i).replace(/\r$/, '')); start = i + 1; }
    }
    if (start < csv.length) rows.push(csv.slice(start));
    return [rows[0], ...rows.slice(1).filter(row => ids.has(row.match(/^"((?:[^"]|"")*)",/)?.[1].replace(/""/g, '"')))].join('\r\n');
  }
  function create(onChange, typeLabel) {
    const selections = { contactTypes: null, organization: null };
    let records = [];
    const node = (tag, text = '') => { const el = document.createElement(tag); el.textContent = text; return el; };
    function header(key, label) {
      const details = node('details');
      details.className = 'admin-column-filter';
      details.dataset.contactColumn = key;
      const summary = node('summary', label);
      summary.setAttribute('aria-label', `Filter ${label}${selections[key] === null ? '' : ' (active)'}`);
      if (selections[key] !== null) details.classList.add('is-active');
      const icon = node('span', selections[key] === null ? '▽' : '▼');
      icon.setAttribute('aria-hidden', 'true');
      summary.append(icon);
      const panel = node('div'); panel.className = 'admin-column-filter-panel';
      details.append(summary, panel);
      function build() {
        panel.replaceChildren();
        const options = [...new Set([...records.flatMap(person => values(person, key)), ...(selections[key] || [])])];
        const display = value => value ? (key === 'contactTypes' ? typeLabel(value) : value) : '(Blanks)';
        options.sort((a, b) => display(a).localeCompare(display(b)));
        const searchLabel = node('label', `Find ${label.toLowerCase()}`);
        const search = node('input'); search.type = 'search'; searchLabel.append(search);
        const choices = node('fieldset'); choices.append(node('legend', `Show contacts with ${label.toLowerCase()}`));
        const boxes = options.map(value => {
          const row = node('label'); const box = node('input'); box.type = 'checkbox'; box.value = value;
          box.checked = selections[key] === null || selections[key].has(value);
          row.append(box, node('span', display(value))); choices.append(row);
          return { row, box, label: display(value) };
        });
        search.addEventListener('input', () => boxes.forEach(item => { item.row.hidden = !item.label.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()); }));
        const actions = node('div'); actions.className = 'admin-column-filter-actions';
        const button = (text, action) => { const b = node('button', text); b.type = 'button'; b.addEventListener('click', action); return b; };
        const finish = selection => { selections[key] = selection; onChange(); document.querySelector(`[data-contact-column="${key}"] summary`)?.focus(); };
        actions.append(
          button('Select all', () => boxes.forEach(({ box }) => { box.checked = true; })),
          button('Select none', () => boxes.forEach(({ box }) => { box.checked = false; })),
          button('Clear filter', () => finish(null)),
          button('Apply', () => finish(boxes.every(({ box }) => box.checked) ? null : new Set(boxes.filter(({ box }) => box.checked).map(({ box }) => box.value)))),
          button('Cancel', () => { details.open = false; summary.focus(); })
        );
        panel.append(searchLabel, actions, choices);
        if (!options.length) panel.append(node('p', 'No values in the current results.'));
      }
      details.addEventListener('toggle', () => { if (details.open) { document.querySelectorAll('.admin-column-filter[open]').forEach(other => { if (other !== details) other.open = false; }); build(); } });
      details.addEventListener('keydown', event => { if (event.key === 'Escape') { details.open = false; summary.focus(); } });
      return details;
    }
    document.addEventListener('click', event => document.querySelectorAll('.admin-column-filter[open]').forEach(el => { if (!el.contains(event.target)) el.open = false; }));
    return {
      header,
      setRecords: people => { records = people; },
      filter: () => records.filter(person => matches(person, selections)),
      active: () => Object.values(selections).some(value => value !== null),
      reset: () => { selections.contactTypes = null; selections.organization = null; }
    };
  }
  window.HSContactColumnFilters = { create, matches, filterCsv };
})();
