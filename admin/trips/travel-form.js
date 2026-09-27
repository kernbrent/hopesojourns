(() => {
  const form = document.querySelector('#trip-content-form');
  function sync() {
    const travel = form.elements.contentType.value === 'travel';
    form.querySelector('[data-travel-fields]').hidden = !travel;
    form.querySelectorAll('[data-travel-fields] input').forEach(input => { input.disabled = !travel; });
    form.elements.eventDate.required = travel;
    form.elements.location.required = travel;
    form.elements.content.required = !travel;
    form.querySelector('[data-event-date-label]').textContent = travel ? 'Departure date' : 'Date (optional)';
    form.querySelector('[data-event-time-label]').textContent = travel ? 'Departure time (local, optional)' : 'Time (optional)';
    form.querySelector('[data-location-label]').textContent = travel ? 'Departure location' : 'Location (optional)';
    form.querySelector('[data-content-label]').textContent = travel ? 'Travel notes (optional)' : 'Content';
    const publicOption = form.elements.visibility.querySelector('[value="public"]');
    publicOption.disabled = travel;
    if (travel && form.elements.visibility.value === 'public') form.elements.visibility.value = 'travelers';
  }
  form.elements.contentType.addEventListener('change', sync);
  form.addEventListener('reset', () => setTimeout(sync, 0));
  window.HSTravelForm = { sync };
  sync();
})();
