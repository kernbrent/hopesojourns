(() => {
  const endpoint = '/admin/trip-platform/devotionals';
  const dialog = document.querySelector('#devotional-library-dialog');
  const masterForm = document.querySelector('#devotional-master-form');
  const status = document.querySelector('#devotional-library-status');
  const search = document.querySelector('#devotional-search');
  const deleted = document.querySelector('#devotional-deleted');
  let items = [], selected = null, picking = false, dirty = false, sequence = 0;
  const notice = (message, type = '') => setStatus(status, message, type);
  const safe = action => async event => { try { await action(event); } catch (error) { notice(error.message, 'error'); } };
  function discard() { return !dirty || window.confirm('Discard unsaved changes to this library master?'); }
  function syncTripForm() {
    const form = document.querySelector('#trip-content-form');
    const linked = Boolean(form.elements.devotionalId.value);
    const isDevotional = form.elements.contentType.value === 'devotional';
    document.querySelector('#trip-devotional-source').textContent = linked ? 'Library copy: your edits change only this trip. The master stays unchanged.' : '';
    document.querySelector('#trip-save-library-label').hidden = linked || !isDevotional;
    form.elements.saveToLibrary.disabled = linked || !isDevotional;
    if (linked || !isDevotional) form.elements.saveToLibrary.checked = false;
  }
  function renderList() {
    const terms = search.value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const filtered = items.filter(item => {
      const text = [item.title, item.scripture, item.topics, item.content].join(' ').toLocaleLowerCase();
      return terms.every(term => text.includes(term));
    });
    document.querySelector('#devotional-result-count').textContent = `${filtered.length} ${deleted.checked ? 'deleted ' : ''}devotional${filtered.length === 1 ? '' : 's'}`;
    const list = document.querySelector('#devotional-library-list');
    list.replaceChildren();
    filtered.forEach(item => {
      const result = node('div', 'devotional-library-result');
      const button = node('button', 'devotional-library-entry');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(selected?.id === item.id));
      button.append(node('strong', '', item.title), node('small', '', item.topics || 'No topics added'));
      button.addEventListener('click', safe(async () => { if (discard()) await select(item.id); }));
      result.append(button);
      const scripture = node('div', 'devotional-library-scripture-links');
      window.HSJourneyContent.appendScriptureLinks(scripture, item.scripture || 'No Scripture reference');
      result.append(scripture);
      list.append(result);
    });
    if (!filtered.length) list.append(node('p', '', 'No devotionals match. Try another topic or Scripture reference.'));
  }
  async function load() {
    const result = await api(`${endpoint}?deleted=${deleted.checked}`);
    items = result.items;
    renderList();
  }
  function renderDetail(item, uses) {
    selected = item;
    masterForm.reset();
    masterForm.elements.id.value = ""; masterForm.elements.updatedAt.value = "";
    setFormValues(masterForm, item || {});
    dirty = false;
    document.querySelector('#devotional-detail').hidden = false;
    document.querySelector('#devotional-editor-title').textContent = item?.id ? 'Edit library master' : 'New library master';
    const removed = Boolean(item?.deleted_at);
    for (const field of masterForm.querySelectorAll('input:not([type="hidden"]),textarea')) field.disabled = removed;
    document.querySelector('#devotional-save').hidden = removed;
    document.querySelector('#devotional-delete').hidden = !item?.id || removed;
    document.querySelector('#devotional-restore').hidden = !removed;
    document.querySelector('#devotional-pick-fields').hidden = !picking || !item?.id || removed;
    document.querySelector('#devotional-usage').hidden = !item?.id;
    const list = document.querySelector('#devotional-usage-list');
    list.replaceChildren();
    uses.forEach(use => {
      const article = node('article');
      const title = node(use.trip_id ? 'a' : 'strong', '', use.trip_title);
      if (use.trip_id) title.href = `/admin/trips/?trip=${encodeURIComponent(use.trip_id)}`;
      const date = use.event_date ? dateLabel(use.event_date) : 'Date not recorded';
      const label = use.removed_at ? 'Removed from trip' : use.publication_status === 'historical' ? 'Original trip use' : `${titleCase(use.publication_status)} trip copy${use.trip_status === 'canceled' ? ' · Canceled trip' : ''}`;
      article.append(title, node('p', '', `${date} · ${label}`));
      list.append(article);
    });
    if (!uses.length) list.append(node('p', '', 'This devotional has not been assigned to a trip.'));
    renderList();
  }
  async function select(id) {
    const requestId = ++sequence;
    notice('Opening devotional…');
    const result = await api(`${endpoint}/${id}`);
    if (requestId !== sequence || !dialog.open) return;
    renderDetail(result.item, result.uses);
    notice('');
  }
  async function open(forTrip = false) {
    if (forTrip && !state.workspace) throw new Error('Open or create a trip first.');
    picking = forTrip;
    selected = null; dirty = false; sequence++;
    deleted.checked = false; search.value = '';
    document.querySelector('#devotional-detail').hidden = true;
    dialog.showModal();
    notice('Loading your devotional library…');
    if (forTrip) {
      const trip = state.workspace.trip;
      document.querySelector('#devotional-pick-trip').textContent = `Make a separate copy for ${trip.title}.`;
      const date = document.querySelector('#devotional-pick-date');
      date.min = trip.start_date || ''; date.max = trip.end_date || '';
      date.value = document.querySelector('#trip-content-form').elements.eventDate.value || trip.start_date || '';
    }
    await load(); notice(''); search.focus();
  }
  document.querySelectorAll('[data-open-devotional-library]').forEach(button => button.addEventListener('click', safe(() => open(false))));
  document.querySelectorAll('[data-pick-devotional]').forEach(button => button.addEventListener('click', safe(() => open(true))));
  document.querySelector('#devotional-library-close').addEventListener('click', () => { if (discard()) dialog.close(); });
  dialog.addEventListener('cancel', event => { if (!discard()) event.preventDefault(); });
  search.addEventListener('input', renderList);
  masterForm.addEventListener('input', () => { dirty = true; });
  deleted.addEventListener('change', safe(async () => {
    if (!discard()) { deleted.checked = !deleted.checked; return; }
    sequence++; selected = null; dirty = false;
    document.querySelector('#devotional-detail').hidden = true;
    await load();
  }));
  document.querySelector('#devotional-new').addEventListener('click', () => {
    if (!discard()) return;
    sequence++; renderDetail(null, []); masterForm.elements.title.focus();
  });
  masterForm.addEventListener('submit', safe(async event => {
    event.preventDefault();
    const button = document.querySelector('#devotional-save'); button.disabled = true;
    notice('Saving library master…');
    try {
      const body = serializeForm(masterForm);
      const result = await api(body.id ? `${endpoint}/${body.id}` : endpoint, {method: body.id ? 'PUT' : 'POST',body:JSON.stringify(body)});
      dirty = false; deleted.checked = false;
      await load(); await select(result.id);
      notice('Master saved. Existing trip copies have not changed.', 'success');
    } finally { button.disabled = false; }
  }));
  document.querySelector('#devotional-delete').addEventListener('click', safe(async () => {
    if (!selected || !window.confirm('Delete this master from the library? Existing trip copies and history will remain. You can restore it from Show deleted.')) return;
    await api(`${endpoint}/${selected.id}`, {method:'DELETE',body:JSON.stringify({updatedAt:masterForm.elements.updatedAt.value})});
    sequence++; selected = null; dirty = false;
    document.querySelector('#devotional-detail').hidden = true;
    await load(); notice('Master deleted. Trip copies are unchanged.', 'success');
  }));
  document.querySelector('#devotional-restore').addEventListener('click', safe(async () => {
    const id = selected.id;
    await api(`${endpoint}/${id}/restore`, {method:'POST',body:JSON.stringify({updatedAt:masterForm.elements.updatedAt.value})});
    deleted.checked = false; await load(); await select(id); notice('Master restored.', 'success');
  }));
  document.querySelector('#devotional-use').addEventListener('click', safe(() => {
    const date = document.querySelector('#devotional-pick-date');
    if (!date.reportValidity()) return;
    if (dirty) { notice('Save the master changes before making a trip copy, or reopen the saved devotional.', 'error'); return; }
    const form = document.querySelector('#trip-content-form');
    if ((form.elements.title.value || form.elements.content.value) && !window.confirm('Replace the current unsaved trip editor contents with this library copy?')) return;
    form.reset();
    form.elements.id.value = '';
    const placeholder = state.workspace.content.find(item => item.content_type === 'devotional' && !item.devotional_id && item.event_date === date.value && item.content.replace(/\s/g, '') === 'Scripture:Reflection:Discussion:Prayer:');
    if (placeholder) form.elements.id.value = placeholder.id;
    form.elements.contentType.value = 'devotional';
    form.elements.devotionalId.value = selected.id;
    form.elements.title.value = selected.title;
    const body = selected.content.replace(/^Scripture:[^\n]*(?:\r?\n)*/i, '');
    form.elements.content.value = selected.scripture ? `Scripture: ${selected.scripture}\n\n${body}` : body;
    form.elements.linkUrl.value = selected.link_url || '';
    form.elements.eventDate.value = date.value;
    form.querySelector('[data-cancel-edit]').hidden = false;
    syncTripForm(); dialog.close(); activateTab('content');
    form.scrollIntoView({block:'start',behavior:'smooth'});
    form.elements.title.focus();
    setStatus(form.querySelector('[data-form-status]'), 'Trip copy ready. Personalize it, then save it for this day.');
  }));
  document.querySelector('#trip-content-form').elements.contentType.addEventListener('change', syncTripForm);
  window.HSDevotionals = {open,syncTripForm,openedFromUrl:false};
})();
