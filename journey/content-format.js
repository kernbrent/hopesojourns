/* Render saved plain-text studies as safe, readable document sections. */
(() => {
  const books = [
    'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth',
    '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra',
    'Nehemiah', 'Esther', 'Job', 'Psalm', 'Psalms', 'Proverbs', 'Ecclesiastes',
    'Song of Solomon', 'Song of Songs', 'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel',
    'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk',
    'Zephaniah', 'Haggai', 'Zechariah', 'Malachi', 'Matthew', 'Mark', 'Luke', 'John',
    'Acts', 'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians',
    'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy',
    '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter',
    '1 John', '2 John', '3 John', 'Jude', 'Revelation'
  ].sort((a, b) => b.length - a.length);
  const passage = '\\d{1,3}(?::\\d{1,3})?(?:\\s*[-–—]\\s*\\d{1,3})?';
  const numberedBook = '[1-3]\\s+(?:Samuel|Kings|Chronicles|Corinthians|Thessalonians|Timothy|Peter|John)\\b';
  const scripturePattern = new RegExp(`\\b(${books.join('|')})\\s+(${passage}(?:\\s*[,;]\\s*(?!${numberedBook})${passage})*)`, 'gi');
  const cleanPassage = value => value.replace(/[–—]/g, '-').replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim();
  function references(value) {
    const text = String(value || '');
    const found = [];
    for (const match of text.matchAll(new RegExp(scripturePattern.source, 'gi'))) {
      const book = match[1];
      const parts = match[0].split(/([;,]\s*)/);
      let offset = match.index;
      let chapter = '';
      let verseContext = false;
      parts.forEach((part, index) => {
        if (index % 2) { offset += part.length; return; }
        const first = index === 0;
        const reference = first ? part.slice(book.length).trim() : part;
        const separator = index > 0 ? parts[index - 1][0] : '';
        let passageText;
        if (first || reference.includes(':') || separator === ';' || !verseContext) {
          chapter = reference.match(/^\d{1,3}/)?.[0] || chapter;
          verseContext = reference.includes(':');
          passageText = `${book} ${reference}`;
        } else {
          passageText = `${book} ${chapter}:${reference}`;
        }
        found.push({ start: offset, end: offset + part.length, passage: cleanPassage(passageText) });
        offset += part.length;
      });
    }
    return found;
  }
  function appendScriptureLinks(element, value) {
    const text = String(value || '');
    let cursor = 0;
    for (const reference of references(text)) {
      element.append(document.createTextNode(text.slice(cursor, reference.start)));
      const link = document.createElement('a');
      link.textContent = text.slice(reference.start, reference.end);
      link.href = `https://www.biblegateway.com/passage/?search=${encodeURIComponent(reference.passage)}&version=NIV`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', `Read ${reference.passage} in the NIV on Bible Gateway (opens in a new tab)`);
      element.append(link);
      cursor = reference.end;
    }
    element.append(document.createTextNode(text.slice(cursor)));
    return element;
  }
  function render(text, { study = false } = {}) {
    const root = document.createElement('div');
    root.className = 'journey-prose';
    let section = '';
    let list = null;
    const blocks = String(text || '').replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/);
    const append = (tag, value, className = '') => {
      const element = document.createElement(tag);
      element.className = className;
      appendScriptureLinks(element, value);
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
          appendScriptureLinks(item, line.replace(numbered ? /^\d+[.)]\s+/ : bulleted ? /^[-•]\s+/ : /$^/, ''));
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
        p.append(strong, document.createTextNode(' '));
        appendScriptureLinks(p, value.slice(label[0].length));
        if (label[1] === 'Read aloud from the NIV:') p.classList.add('journey-scripture');
      } else if (study && section === 'CLOSING PRAYER') {
        const em = document.createElement('em');
        appendScriptureLinks(em, value);
        p.className = 'journey-prayer';
        p.append(em);
      } else {
        appendScriptureLinks(p, value);
      }
    }
    return root;
  }
  globalThis.HSJourneyContent = { render, references, appendScriptureLinks };
})();
