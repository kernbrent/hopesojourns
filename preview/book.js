(() => {
  const body = document.body;
  const size = document.querySelector('#reading-size');
  const motion = document.querySelector('#book-motion');
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = false;
  document.querySelector('.reader-tools').hidden = false;
  try {
    const saved = localStorage.getItem('hope-book-text-size');
    if (['standard', 'large', 'largest'].includes(saved)) size.value = saved;
    paused = localStorage.getItem('hope-book-motion-paused') === 'true';
  } catch {}
  function applyMotion() {
    body.classList.toggle('book-paused', paused || preference.matches);
    motion.disabled = preference.matches;
    motion.setAttribute('aria-pressed', String(paused || preference.matches));
    motion.textContent = preference.matches ? 'Motion reduced' : paused ? 'Resume animation' : 'Pause animation';
  }
  body.dataset.readingSize = size.value;
  size.addEventListener('change', () => {
    body.dataset.readingSize = size.value;
    try { localStorage.setItem('hope-book-text-size', size.value); } catch {}
    updateProgress();
  });
  motion.addEventListener('click', () => {
    paused = !paused;
    try { localStorage.setItem('hope-book-motion-paused', String(paused)); } catch {}
    applyMotion();
  });
  preference.addEventListener('change', applyMotion);
  applyMotion();
  const menu = document.querySelector('.chapter-menu');
  if (matchMedia('(max-width:800px)').matches) menu.open = false;
  const text = document.querySelector('.chapter-text');
  const progress = document.querySelector('.reading-progress span');
  function updateProgress() {
    const box = text.getBoundingClientRect();
    const amount = Math.max(0, Math.min(1, (innerHeight - box.top) / box.height));
    progress.style.transform = `scaleX(${amount})`;
  }
  let scheduled = false;
  addEventListener('scroll', () => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(() => { updateProgress(); scheduled = false; }); }
  }, {passive:true});
  addEventListener('resize', updateProgress);
  addEventListener('load', updateProgress);
  updateProgress();
})();
