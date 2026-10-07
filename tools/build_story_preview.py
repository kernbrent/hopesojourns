"""Build only the public story prototype; never include portal or private files."""
from pathlib import Path
import shutil
from build_book_preview import build_book
from build_path_preview import build_paths
from build_margin_preview import build_margin_variant

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'outputs/story-preview-site'
OUT.mkdir(parents=True, exist_ok=True)
files = ('index.html', 'first-draft.html', 'preview.css', 'preview.js', 'directions.css', 'directions.js', 'motion.css', 'motion.js', 'intro.js', 'book.css', 'book.js', 'destinations.js', 'pathways.css', 'internships.js', 'corporate.js', 'production-margins.css')
routes = ('open-door', 'field-journal', 'people-first', 'wide-horizon', 'your-next-step', 'in-motion')
for name in files:
    shutil.copy2(ROOT / 'preview' / name, OUT / name)
for route in routes:
    (OUT / route).mkdir(exist_ok=True)
    shutil.copy2(ROOT / 'preview' / route / 'index.html', OUT / route / 'index.html')
# Keep the canonical stylesheet and its palette intact.
shutil.copy2(ROOT / 'styles.css', OUT / 'styles.css')
if (ROOT / 'experience.css').exists():
    shutil.copy2(ROOT / 'experience.css', OUT / 'experience.css')
(OUT / 'assets').mkdir(exist_ok=True)
images = ('corporate-house-service-mexico.png', 'athens.jpg', 'hope-sojourns-logo.png', 'hope-sojourns-icon.png', 'ministry-gathering-athens.jpg', 'ministry-gathering-athens-with-brent.png', 'athens-team-2026.jpg', 'brent-kern-headshot-casual-color.png', 'kenya.jpg', 'mexico-city.jpg', 'england-halifax.jpg', 'story-red-juice-realistic.png', 'story-park-bench-realistic.png', 'soto-buffalo-conference-center.png', 'belize-cotton-wood-lodge-loft.png', 'nice-old-town-tile.png')
for name in images:
    shutil.copy2(ROOT / 'assets' / name, OUT / 'assets' / name)
(OUT / 'robots.txt').write_text('User-agent: *\nDisallow: /\n', encoding='utf-8')
(OUT / '_headers').write_text('''/*
  X-Robots-Tag: noindex, nofollow
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Content-Security-Policy: default-src 'self'; img-src 'self' https://hopesojourns.com https://christiansteps.net; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'
  Cache-Control: no-cache
''', encoding='utf-8')
(OUT / '404.html').write_text('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><link rel="stylesheet" href="/styles.css"><title>Hope Sojourns preview</title></head><body><main><h1>This is the story preview.</h1><p><a href="/">Return to the stories</a></p><p><a href="https://hopesojourns.com/">Visit the main Hope Sojourns site</a></p></main></body></html>', encoding='utf-8')
(OUT / 'internships').mkdir(exist_ok=True)
shutil.copy2(ROOT / 'preview/internships/opportunities.json', OUT / 'internships/opportunities.json')
allowed = set(build_paths(OUT)) | {'internships/opportunities.json'} | set(build_book(OUT)) | set(files) | {f'{route}/index.html' for route in routes} | {f'assets/{name}' for name in images} | {'styles.css','experience.css','robots.txt','_headers','404.html'}
allowed |= set(build_margin_variant(OUT))
actual = {p.relative_to(OUT).as_posix() for p in OUT.rglob('*') if p.is_file()}
assert actual <= allowed, f'Unexpected files in preview artifact: {actual-allowed}'
print(f'Built {len(actual)} allowlisted public files in {OUT}')
