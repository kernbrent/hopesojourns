(function () {
  'use strict';
  const gallery = document.getElementById('archive-gallery');
  const filters = document.getElementById('gallery-filters');
  const status = document.getElementById('gallery-status');
  const requested = new URLSearchParams(window.location.search).get('trip');
  function photoCard(item) {
    const figure = document.createElement('figure'); figure.className = 'archive-photo';
    const link = document.createElement('a'); link.href = item.url; link.target = '_blank'; link.rel = 'noopener'; link.setAttribute('aria-label', `Open full-size photo: ${item.caption}`);
    const image = document.createElement('img'); image.src = item.url; image.alt = item.caption; image.loading = 'lazy'; image.decoding = 'async';
    const caption = document.createElement('figcaption'); const trip = document.createElement('strong'); trip.textContent = item.trip; caption.append(trip, document.createTextNode(item.caption));
    link.append(image); figure.append(link, caption); return figure;
  }
  function render(items, trip) {
    const visible = trip === 'All trips' ? items : items.filter(item => item.trip === trip);
    gallery.replaceChildren(...visible.map(photoCard));
    status.textContent = `${visible.length} ${visible.length === 1 ? 'photo' : 'photos'} shown${trip === 'All trips' ? '' : ` from ${trip}`}.`;
    filters.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.trip === trip)));
  }
  fetch('/past-trips/gallery/gallery-data.json?v=4').then(response => { if (!response.ok) throw new Error('Gallery unavailable'); return response.json(); }).then(data => {
    const trips = ['All trips', ...new Set(data.images.map(item => item.trip))]; const initial = trips.includes(requested) ? requested : 'All trips';
    for (const trip of trips) { const button = document.createElement('button'); button.type = 'button'; button.className = 'gallery-filter'; button.dataset.trip = trip; button.textContent = trip; button.addEventListener('click', () => render(data.images, trip)); filters.append(button); }
    render(data.images, initial);
  }).catch(() => { status.textContent = 'The photo archive could not be loaded. Please try again later.'; });
}());
