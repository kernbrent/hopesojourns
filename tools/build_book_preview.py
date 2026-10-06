"""Render all reading pages and navigation from one book catalog."""
from pathlib import Path
from html import escape
import json
import math

ROOT = Path(__file__).resolve().parents[1]

def build_book(out):
    book = json.loads((ROOT / 'preview/book/chapters.json').read_text(encoding='utf-8'))
    chapters = book['chapters']
    assert len({c['slug'] for c in chapters}) == len(chapters)
    routes = []
    def link(c, label=None):
        return f'<a href="/book/{escape(c["slug"])}/">{escape(label or c["label"] + " · " + c["title"])}</a>'
    for i, c in enumerate(chapters):
        slug = c['slug']
        assert slug.replace('-', '').isalnum()
        nav = ''.join(f'<a href="/book/{escape(x["slug"])}/"' + (' aria-current="page"' if x == c else '') + f'><small>{escape(x["label"])}</small><span>{escape(x["title"])}</span></a>' for x in chapters)
        prose = ''.join(f'<p>{escape(p)}</p>' for p in c['paragraphs'])
        minutes = max(1, math.ceil(sum(len(p.split()) for p in c['paragraphs']) / 200))
        previous = link(chapters[i-1], '← ' + chapters[i-1]['label']) if i else '<a href="/in-motion/">← Explore Hope Sojourns</a>'
        next_link = link(chapters[i+1], 'Continue to ' + chapters[i+1]['label'] + ' →') if i+1 < len(chapters) else '<a href="/in-motion/#encounters">Back to the stories →</a>'
        image_note = 'AI-created scene illustration; not a photograph of the actual encounter.' if c['story'] else 'Hope Sojourns companions in Athens.'
        back = f'/in-motion/#{c["story"]}-6' if c['story'] else '/in-motion/'
        html = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>{escape(c['label'])} · {escape(c['title'])} · Hope Sojourns</title><link rel="icon" href="/assets/hope-sojourns-icon.png"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/book.css"><script src="/book.js" defer></script></head>
<body class="book-page"><a class="book-skip" href="#chapter-text">Skip to chapter text</a><header class="book-header"><a href="/in-motion/" aria-label="Hope Sojourns home"><img src="/assets/hope-sojourns-logo.png" alt="Hope Sojourns"></a><a href="{back}">← Back to the journey</a></header><div class="reading-progress" aria-hidden="true"><span></span></div>
<main><section class="book-cover" aria-labelledby="chapter-title"><img class="cover-image" src="/assets/athens-team-2026.jpg" alt=""><div class="cover-orbit" aria-hidden="true"></div><div class="cover-copy"><p class="book-eyebrow">Hope Sojourns · The book</p><p class="chapter-number">{escape(c['label'])}</p><h1 id="chapter-title">{escape(c['title'])}</h1><p class="book-byline">By Brent Kern <span>·</span> {minutes} min read</p><a class="begin-reading" href="#chapter-text">Begin reading ↓</a></div></section>
<div class="book-layout"><aside class="book-sidebar"><details class="chapter-menu" open><summary>Explore the book</summary><nav aria-label="Book chapters">{nav}</nav></details><div class="reader-tools" hidden><label for="reading-size">Text size</label><select id="reading-size"><option value="standard">Comfortable</option><option value="large">Larger</option><option value="largest">Largest</option></select><button type="button" id="book-motion" aria-pressed="false">Pause animation</button></div><p class="book-status">A book in progress.<br>Read the prologue and the chapters written so far.</p></aside>
<div class="reading-column"><figure class="chapter-scene"><img src="/assets/{escape(c['image'])}" alt="{escape(c['alt'])}"><figcaption>{image_note}</figcaption></figure><article class="chapter-text" id="chapter-text" tabindex="-1" aria-label="{escape(c['label'])} full text">{prose}</article><div class="chapter-end"><span aria-hidden="true">✦</span><p>End of {escape(c['label'].lower())}</p></div><nav class="chapter-pagination" aria-label="Continue reading">{previous}{next_link}</nav><a class="back-to-top" href="#chapter-title">Back to the top ↑</a></div></div></main><footer class="book-footer">Hope Sojourns · Go with Hope. Serve with Faith.<a href="/in-motion/">Return to Hope Sojourns →</a></footer></body></html>'''
        path = out / 'book' / slug / 'index.html'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(html, encoding='utf-8')
        routes.append(path.relative_to(out).as_posix())
    return routes
