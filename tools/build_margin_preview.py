"""Derive the margin comparison from the current pages without duplicating content."""
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]
def build_margin_variant(out):
 sources=['in-motion/index.html','internships/index.html','corporate/index.html','mission-journeys/index.html']+[p.relative_to(out).as_posix() for p in (out/'book').glob('*/index.html')]
 routes=[]
 for source in sources:
  target='in-motion-margins/'+('index.html' if source=='in-motion/index.html' else source)
  html=(out/source).read_text(encoding='utf-8')
  html=html.replace('<body class="','<body class="production-margins ',1)
  html=html.replace('</head>','<link rel="stylesheet" href="/production-margins.css"></head>',1)
  for route in ['in-motion','internships','corporate','mission-journeys','book']:
   html=html.replace('href="/'+route+'/', 'href="/in-motion-margins/'+('' if route=='in-motion' else route+'/'))
  html=html.replace('src="/motion.js"','src="/margin-motion.js"')
  p=out/target;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(html,encoding='utf-8');routes.append(target)
 (out/'margin-motion.js').write_text((ROOT/'preview/motion.js').read_text(encoding='utf-8').replace('/book/','/in-motion-margins/book/'),encoding='utf-8')
 return routes+['margin-motion.js']
