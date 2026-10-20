"""Build the administrator-only developer guide for private guide-bucket upload."""
from pathlib import Path
import html
import re
from build_mmt_user_guide_web import inline, slug

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs/tech-admin/Hope-Sojourns-Developer-Guide.md'
OUTPUT = ROOT / '.tmp/mmt-developer-guide.html'

def render(lines):
    blocks, toc, ids = [], [], {}
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        heading = re.match(r'^(#{2,6})\s+(.+)$', line)
        if heading:
            level, title = len(heading[1]), heading[2]
            base = slug(title) or 'section'
            ids[base] = ids.get(base, 0) + 1
            anchor = base if ids[base] == 1 else f'{base}-{ids[base]}'
            blocks.append(f'<h{level} id="{anchor}">{inline(title)}</h{level}>')
            if level == 2:
                toc.append(f'<li><a href="#{anchor}">{inline(title)}</a></li>')
                blocks.append('<p class="mmt-guide-back"><a href="#table-of-contents">Back to contents</a></p>')
            i += 1
        elif line.startswith('```'):
            code = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith('```'):
                code.append(lines[i])
                i += 1
            blocks.append('<pre><code>' + html.escape('\n'.join(code)) + '</code></pre>')
            i += 1
        elif line.startswith('|') and i+1 < len(lines) and re.match(r'^\s*\|[\s:|\-]+\|\s*$', lines[i+1]):
            rows = []
            header = True
            while i < len(lines) and lines[i].strip().startswith('|'):
                row = lines[i].strip()
                i += 1
                if re.match(r'^\|[\s:|\-]+\|$', row):
                    continue
                tag = 'th' if header else 'td'
                cells = re.split(r'(?<!\\)\|', row.strip('|'))
                rows.append('<tr>' + ''.join(f'<{tag}'+(' scope="col"' if header else '')+f'>{inline(c.replace(chr(92)+"|", "|"))}</{tag}>' for c in cells) + '</tr>')
                header = False
            blocks.append('<div class="mmt-guide-table"><table><thead>'+rows[0]+'</thead><tbody>'+''.join(rows[1:])+'</tbody></table></div>')
        elif re.match(r'^(?:[-*]|\d+\.)\s+', line):
            ordered = bool(re.match(r'^\d+\.', line))
            tag = 'ol' if ordered else 'ul'
            pattern = r'^\d+\.\s+(.+)' if ordered else r'^[-*]\s+(.+)'
            items = []
            while i < len(lines) and (m := re.match(pattern, lines[i].strip())):
                items.append('<li>'+inline(m[1])+'</li>')
                i += 1
            blocks.append(f'<{tag}>'+''.join(items)+f'</{tag}>')
        else:
            blocks.append('<p>'+inline(line)+'</p>')
            i += 1
    return '<nav aria-label="Table of contents" id="table-of-contents"><h2>Table of contents</h2><ol>'+''.join(toc)+'</ol></nav>\n'+'\n'.join(blocks)

def build():
    lines = SOURCE.read_text(encoding='utf-8').splitlines()
    version = next(x for x in lines if x.startswith('Version '))
    reviewed = next(x for x in lines if x.startswith('Last reviewed:'))
    body = render(lines[next(i for i,x in enumerate(lines) if x.startswith('## ')):])
    document = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive,nosnippet"><meta name="referrer" content="no-referrer">
<title>MMT developer guide | Hope Sojourns</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/admin/mmt-user-guide.css?v=2026-10-20.1"></head>
<body class="mmt-guide-page"><a class="skip-link" href="#guide-content">Skip to guide</a>
<header class="mmt-guide-header"><a class="mmt-guide-brand" href="/admin/ministry/"><img src="/assets/hope-sojourns-logo.png" alt="Hope Sojourns"></a><a class="mmt-guide-return" href="/admin/ministry/">Return to portal</a></header>
<main id="guide-content" class="mmt-guide-main"><p class="mmt-guide-eyebrow">Technical administration</p><h1>Hope Sojourns MMT developer guide</h1><p class="mmt-guide-meta">{html.escape(version)} · {html.escape(reviewed)}</p><p class="mmt-guide-intro">Architecture, integrations, security, maintenance, and release procedures for portal administrators. Choose a topic in the contents to jump to that section.</p>{body}</main>
<footer class="mmt-guide-page-footer"><a href="/api/interest/admin/user-guide">MMT user guide</a><br><a href="/api/interest/admin/developer-guide">MMT developer guide</a><br><a href="/admin/ministry/">Return to portal</a></footer></body></html>'''
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(document,encoding='utf-8')
    print(OUTPUT)

if __name__ == '__main__':
    build()
