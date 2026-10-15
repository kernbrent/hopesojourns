"""Add the isolated knowledge prototype to the existing public preview allowlist."""
from pathlib import Path
import shutil
ROOT=Path(__file__).resolve().parents[1]

def build_knowledge(out):
    names=('index.html','knowledge.css','app.mjs','engine.mjs','samples.mjs','catalog.json')
    directory=out/'knowledge'
    directory.mkdir(exist_ok=True)
    for name in names:
        shutil.copy2(ROOT/'preview/knowledge'/name,directory/name)
    # Separate from the existing illustrative internship catalog and every live route.
    route=out/'intern-assistant'
    route.mkdir(exist_ok=True)
    shutil.copy2(ROOT/'preview/knowledge/index.html',route/'index.html')
    index=out/'index.html'
    html=index.read_text(encoding='utf-8')
    tile='''<a class="compare-option sample-3" href="/intern-assistant/"><div class="sample"><img src="/assets/athens-team-2026.jpg" alt=""><span>Good questions.<br><em>Thoughtful answers.</em></span></div><div class="compare-copy"><span class="eyebrow">New · Working text prototype</span><h2>Internship knowledge assistant</h2><h3>Ask while you explore and watch</h3><p>Context-aware source lookup, ministry videos, feedback, editorial review, and a searchable FAQ. Browser-only demo; paid AI and voice remain off.</p><span class="compare-open">Try the assistant preview <b>↗</b></span></div></a>'''
    marker='<section class="compare-grid" aria-label="Design directions">'
    if marker not in html:
        raise ValueError('Preview comparison marker changed; review before inserting a tile.')
    index.write_text(html.replace(marker,marker+tile,1),encoding='utf-8')
    return {f'knowledge/{name}' for name in names}|{'intern-assistant/index.html'}
