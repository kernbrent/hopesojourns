/* Shared, text-only travel details for admin, travelers, and offline packets. */
(() => {
  function lines(item) {
    if (item.content_type !== 'travel') return [];
    const joined = parts => parts.filter(Boolean).join(' · ');
    return [
      'Departure: ' + joined([item.event_date, item.event_time, item.location]),
      'Arrival: ' + (joined([item.arrival_date, item.arrival_time, item.arrival_location]) || 'To be confirmed'),
      joined([item.travel_mode, item.service_number]),
      'Times are local to each departure or arrival location.',
    ].filter(Boolean);
  }
  function render(item) {
    const container = document.createElement('div');
    container.className = 'journey-travel-details';
    lines(item).forEach(line => {
      const paragraph = document.createElement('p');
      paragraph.textContent = line;
      container.append(paragraph);
    });
    return container;
  }
  window.HSTravelDetails = { lines, render };
})();
