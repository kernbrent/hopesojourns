/* Render saved plain-text studies as safe, readable document sections. */
(() => {
  function render(text, { study = false } = {}) {
    const root = document.createElement('div');
    root.className = 'journey-prose';
    let section = '';
    let list = null;
    const blocks = String(text || '').replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/);
    const append = (tag, value, className = '') => {
      const element = document.createElement(tag);
      element.className = className;
      element.textContent = value;
      root.append(element);
      return element;
    };
    for (const block of blocks) {
      const value = block.trim();
      if (!value) continue;
      if (study && value.length <= 120 && /^[A-Z][A-Z0-9\s’'–—,:-]*$/.test(value) && !value.includes('\n')) {
        section = value;
        list = null;
        const heading = value.toLowerCase().replace(/^./, letter => letter.toUpperCase())
          .replace(/\b(god|jesus|christ|niv)\b/g, word => ({god: 'God', jesus: 'Jesus', christ: 'Christ', niv: 'NIV'})[word])
          .replace(/\bgods\b/g, 'God’s');
        append('h4', heading, /^DAY \d+\b/.test(value) ? 'journey-study-part' : '');
        continue;
      }
      const numbered = value.split('\n').every(line => /^\d+[.)]\s+\S/.test(line));
      const bulleted = value.split('\n').every(line => /^[-•]\s+\S/.test(line));
      if (numbered || bulleted || (study && section === 'TALKING POINTS')) {
        const tag = numbered ? 'OL' : 'UL';
        if (!list || list.tagName !== tag) list = append(tag.toLowerCase(), '', 'journey-study-list');
        const lines = numbered || bulleted ? value.split('\n') : [value];
        for (const line of lines) {
          const item = document.createElement('li');
          if (numbered) item.value = Number(line.match(/^\d+/)[0]);
          item.textContent = line.replace(numbered ? /^\d+[.)]\s+/ : bulleted ? /^[-•]\s+/ : /$^/, '');
          list.append(item);
        }
        continue;
      }
      list = null;
      const reading = value.match(/^NIV reading:\s*(https:\/\/\S+)$/i);
      if (reading) {
        try {
          const url = new URL(reading[1]);
          if (url.protocol === 'https:') {
            const p = append('p', '', 'journey-reading-link');
            const link = document.createElement('a');
            link.textContent = 'Read the passage in the NIV';
            link.href = url.href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            p.append(link);
            continue;
          }
        } catch { /* Invalid links remain readable plain text. */ }
      }
      const label = value.match(/^(Read aloud from the NIV:|Focus:|Leader reminder:)\s*/);
      const p = append('p', '', label ? 'journey-study-note' : '');
      if (label) {
        const strong = document.createElement('strong');
        strong.textContent = label[1];
        p.append(strong, document.createTextNode(' ' + value.slice(label[0].length)));
        if (label[1] === 'Read aloud from the NIV:') p.classList.add('journey-scripture');
      } else if (study && section === 'CLOSING PRAYER') {
        const em = document.createElement('em');
        em.textContent = value;
        p.className = 'journey-prayer';
        p.append(em);
      } else {
        p.textContent = value;
      }
    }
    return root;
  }
  globalThis.HSJourneyContent = { render };
})();
