/* Local, transparent navigation. No inferred identity, tracking, or stored profile. */
(() => {
  const storyPanels = [...document.querySelectorAll('[data-story-panel]')];
  const curiosityPanels = [...document.querySelectorAll('[data-curiosity-panel]')];
  function showCurrent(focus = false) {
    const hash = location.hash.slice(1);
    if (storyPanels.length) {
      const current = storyPanels.find(panel => panel.id === hash) || storyPanels[0];
      storyPanels.forEach(panel => { panel.hidden = panel !== current; });
      document.title = `${current.querySelector('.hs-story-meta span').textContent} | Hope Sojourns`;
      if (focus) current.querySelector('h1').focus({ preventScroll:true });
    }
    if (curiosityPanels.length) {
      const current = curiosityPanels.find(panel => panel.id === hash) || curiosityPanels[0];
      curiosityPanels.forEach(panel => { panel.hidden = panel !== current; });
      document.querySelectorAll('[data-curiosity-link]').forEach(link => {
        if (link.dataset.curiosityLink === current.id) link.setAttribute('aria-current','true');
        else link.removeAttribute('aria-current');
      });
      if (focus) current.querySelector('h2').focus({preventScroll:true});
    }
  }
  // Reveal the destination before native anchor scrolling; history/back remain native.
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const target = document.getElementById(link.hash.slice(1));
    if (!target?.matches('[data-story-panel], [data-curiosity-panel]')) return;
    target.hidden = false;
  });
  window.addEventListener('hashchange', () => showCurrent(true));
  showCurrent();
})();
