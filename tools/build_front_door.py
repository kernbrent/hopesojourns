"""Generate the public story-led pages. Shared trip catalog is retained in explore/index.html."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
REV = '20260910'

def page(route, title, description, content, body=''):
    target = ROOT / route / 'index.html'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="{description}">
  <title>{title} | Hope Sojourns</title>
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Hope Sojourns">
  <meta property="og:title" content="{title} | Hope Sojourns">
  <meta property="og:description" content="{description}">
  <meta property="og:image" content="https://hopesojourns.com/assets/hope-sojourns-social-share.jpg">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/assets/hope-sojourns-icon.png">
  <link rel="stylesheet" href="/styles.css?v={REV}">
  <link rel="stylesheet" href="/experience.css?v={REV}">
  <script src="/script.js?v={REV}" defer></script>
  <script src="/experience.js?v={REV}" defer></script>
</head>
<body class="hs-redesign {body}">
<main id="main">{content}</main>
</body>
</html>
''', encoding='utf-8')

def link(text, url, secondary=False):
    return f'<a class="hs-action{" hs-action-quiet" if secondary else ""}" href="{url}">{text}<span aria-hidden="true">↗</span></a>'

def choice(title, description, url, n):
    return f'<a class="hs-choice" href="{url}"><span class="hs-index">{n}</span><div><h3>{title}</h3><p>{description}</p></div><span class="hs-choice-arrow" aria-hidden="true">↗</span></a>'

def section_intro(kicker, title, desc):
    return f'<div class="hs-section-heading"><div><p class="hs-kicker">{kicker}</p><h2>{title}</h2></div><p>{desc}</p></div>'

# On initial generation retain the complete existing opportunity catalog, including current dates.
catalog_file = ROOT / 'tools' / 'front-door-journey-catalog.inc'
if not catalog_file.exists():
    original = (ROOT / 'index.html').read_text(encoding='utf-8')
    start = original.index('      <div class="trip-grid">')
    end = original.index('</section>', start)
    catalog_file.parent.mkdir(exist_ok=True)
    catalog_file.write_text(original[start:end].strip(), encoding='utf-8')
catalog = catalog_file.read_text(encoding='utf-8').replace('Shephard of the Ozarks', 'Shepherd of the Ozarks')

page('', 'See and be seen', 'Meaningful journeys, local ministry partnerships, and experiences that change how we see one another.', f'''
  <section class="hs-welcome">
    <div class="hs-welcome-copy">
      <p class="hs-kicker"><span class="hs-short-rule"></span> An invitation to see differently</p>
      <h1>Sometimes,<br>the journey<br>begins with<br><em>one person.</em></h1>
      <p class="hs-intro">A conversation. A shared meal. A moment that changes the way you see someone—and yourself.</p>
      <div class="hs-action-row">{link('Step into a story', '/stories/')}{link('Explore the main site', '/explore/', True)}</div>
      <p class="hs-pace">A short story. Always at your pace.</p>
    </div>
    <div class="hs-welcome-art">
      <div class="hs-art-top"><span>SEE &amp; BE SEEN</span><span>HOPE SOJOURNS</span></div>
      <div class="hs-quote-display"><span class="hs-quote-mark" aria-hidden="true">“</span><p>She wanted<br>a <em>red</em><br>juice box.</p><span class="hs-art-rule"></span><p class="hs-art-caption">One ordinary encounter.<br>An invitation to look again.</p></div>
      <a class="hs-art-bottom" href="/stories/">The moment that stayed with Brent <span aria-hidden="true">→</span></a>
    </div>
  </section>
  <section class="hs-welcome-after"><p>Christian faith. Shared humanity. A world of possibility.</p><a href="/explore/">Get to know Hope Sojourns <span aria-hidden="true">↓</span></a></section>
''', 'hs-entry')

page('explore', 'A world of people worth knowing', 'Explore Hope Sojourns journeys, internships, ministry partnerships, and ways to support the work.', f'''
  <section class="hs-main-hero hs-wrap">
    <div><p class="hs-kicker">Go with hope. Serve with faith.</p><h1>A world of people<br><em>worth knowing.</em></h1><p class="hs-intro">Come alongside local ministries. Make room for an encounter. Discover how service can change what you carry home.</p><div class="hs-action-row">{link('Find your next step', '/discover/')}{link('Explore journeys', '#trips', True)}</div></div>
    <figure class="hs-main-photo"><img src="/assets/ministry-gathering-athens.jpg" alt="Sofia and Nikos of Hellenic Ministries with members of the Hope Sojourns team" fetchpriority="high" width="900" height="700"><figcaption><span>People first. Wherever we go.</span><small>Athens · One of the places our relationships began</small></figcaption></figure>
  </section>
  <section class="hs-belief"><div class="hs-wrap"><p class="hs-kicker">At the heart of every journey</p><p>We go to serve.<br><em>We make time to see.</em></p><div>Hope Sojourns brings willing people alongside ministries already caring for their communities. We begin by listening, contribute where we can, and stay open to what we might learn.</div><a href="/about/">Get to know us <span aria-hidden="true">↗</span></a></div></section>
  <section class="hs-wrap hs-section" id="possibilities">{section_intro('Where could this lead?', 'Follow your curiosity.', 'There is more than one way to take part. You don’t need to have it figured out before you begin.')}<div class="hs-choice-list">{choice('What might I discover?', 'A few days away. A longer season of learning. A different perspective.', '/discover/#discover', '01')}{choice('Whose work could I join?', 'Meet the purpose behind local partnership and ongoing support.', '/discover/#partners', '02')}{choice('What could we make possible together?', 'Imagine the invitation reaching your church, students, or community.', '/discover/#together', '03')}</div></section>
  <section class="hs-journeys" id="trips"><div class="hs-wrap hs-section">{section_intro('Places to begin', 'The place is part<br>of the story.', 'Explore current and developing journeys. Each one grows from a local relationship, with its own people, needs, and possibilities.')}<p class="hs-catalog-note">Some opportunities are still taking shape. See each journey for its dates, planning status, and details.</p>{catalog}</div></section>
  <section class="hs-wrap hs-section hs-feature"><div class="hs-feature-image"><img src="/assets/mexico-city.jpg" alt="A view of Mexico City, one of our developing destinations" width="800" height="700" loading="lazy"><span>New places. New perspective.</span></div><div><p class="hs-kicker">Give your gifts room to grow</p><h2>What if learning<br><em>took you closer?</em></h2><p class="hs-intro">Connect your education and skills with the daily work of a ministry. Explore a supported internship shaped around your learning and a partner’s needs.</p><div class="hs-action-row">{link('Explore internships', '/internships/')}</div><a class="hs-underlink" href="/students/">Helping students find their next step?</a></div></section>
  <section class="hs-wrap hs-story-teaser"><div><p class="hs-kicker">The story behind the invitation</p><h2>“Brent… she wanted<br>a red juice box.”</h2><p>A small moment asked a much bigger question: had I really seen the person in front of me?</p>{link('Read Brent’s story', '/stories/', True)}</div><div class="hs-author"><img src="/assets/brent-kern-headshot-casual-color.png" alt="Brent Kern" width="150" height="150" loading="lazy"><p>Brent Kern<br><span>Founder, Hope Sojourns</span></p><a href="/stories/#john-1">Another encounter: John’s story ↗</a></div></section>
''')

stories = [
('red-1', '01', 'The red juice box', 'It seemed like<br><em>such a small thing.</em>', '<p>One evening in Athens, I handed a woman a sandwich and a juice box. She accepted the food, but pushed the drink back.</p><p>Our guide helped me understand: she wanted a red juice box. All I had left were blue ones.</p><p>I found myself wondering why she couldn’t just be grateful.</p>', None, 'red-2', 'Stay with the story'),
('red-2', '02', 'The red juice box', 'Then Amanda<br><em>said my name.</em>', '<p>Back at the apartment, I told the team what had happened. Amanda listened.</p><blockquote>“Brent… she wanted a red juice box.”</blockquote><p>She had to say it twice. This woman had preferences. Wants. A life of her own. I had offered her something to drink, but I hadn’t really seen her.</p>', 'red-1', None, 'Where could this lead?'),
('john-1', '01', 'An evening with John', 'A little time<br><em>on a bench.</em>', '<p>I met John during an evening walk in Athens. While the group continued, I sat beside him and talked.</p><p>The next evening, I went back. This time, we stayed together longer. He told me about his life, his daughter, and the bench he called his office.</p>', None, 'john-2', 'Stay with the story'),
('john-2', '02', 'An evening with John', 'An honest<br><em>answer.</em>', '<p>As I was leaving, I told John to take care of himself.</p><blockquote>“Brent, the problem isn’t taking care of myself. The problem is loneliness.”</blockquote><p>Thousands of people could pass him every day. I was beginning to understand what it meant to stop.</p>', 'john-1', None, 'Where could this lead?')
]
story_markup = ''
for key, number, title, heading, prose, prev, nxt, label in stories:
    story_markup += f'''<article class="hs-story-panel" id="{key}" data-story-panel>
      <div class="hs-story-meta"><span>{title} · {number} / 02</span><a href="/explore/">Skip to the main site ↗</a></div>
      <div class="hs-story-layout"><div><p class="hs-kicker">From Brent’s story · Athens, Greece</p><h1 tabindex="-1">{heading}</h1><p class="hs-story-location">The place where this story happened.<br>One of many places hope can lead.</p></div><div class="hs-prose">{prose}<div class="hs-story-controls">{link('Previous moment', '#'+prev, True) if prev else '<a class="hs-underlink" href="/">Back to the invitation</a>'}{link(label, '#'+nxt if nxt else '/discover/')}</div></div></div>
    </article>'''
page('stories', 'A moment worth staying with', 'Two encounters from Brent’s story about dignity, loneliness, and learning to see one another.', f'<div class="hs-wrap hs-story-shell">{story_markup}<div class="hs-story-switch"><span>Another moment to sit with</span><a href="#red-1">The red juice box</a><a href="#john-1">An evening with John</a></div></div>', 'hs-story-page')

discovery = [
('discover','What might I discover?','Make room for an encounter','You don’t have to arrive<br><em>with all the answers.</em>','Bring your curiosity, your willingness to listen, and the part of your life you’re ready to share.', [('A few days, a new perspective','Explore a short journey alongside a local ministry.','/explore/#trips'),('More time to learn and serve','Connect your skills and education with meaningful work.','/internships/'),('People I’d love to bring','Imagine a shared experience for your community.','/groups/')]),
('partners','Whose work could I join?','The people who stay','The work has a home.<br><em>We’re invited into it.</em>','Local ministries know their communities. Their relationships help shape where we go and how we serve.', [('This sounds like the work we’re doing.','Tell us about your ministry and the people you serve.','/partners/'),('I’d like to help that work continue.','Explore ways to support ongoing ministry and participation.','/giving/'),('I want to experience it alongside them.','Explore the journeys growing from these relationships.','/explore/#trips')]),
('together','What could we make possible together?','An invitation you can share','Who comes to mind<br><em>when you imagine going?</em>','A few friends. Your church. Students you teach. The people you work beside every day.', [('I can picture people coming with me.','Explore a journey for your church, workplace, or community.','/groups/'),('I’m thinking about students and their future.','Connect learning, practical skills, and service.','/students/'),('I could help make this possible.','Support the people and relationships behind a journey.','/giving/')])
]
tabs = ''.join(f'<a href="#{d[0]}" data-curiosity-link="{d[0]}">{d[1]}</a>' for d in discovery)
panels=''
for key,label,kicker,title,desc,items in discovery:
    panels += f'<section class="hs-discovery-panel" id="{key}" data-curiosity-panel><p class="hs-kicker">{kicker}</p><h2 tabindex="-1">{title}</h2><p class="hs-intro">{desc}</p><div class="hs-choice-list">'+''.join(choice(t,d,u,f'0{i+1}') for i,(t,d,u) in enumerate(items))+'</div></section>'
page('discover', 'Follow your curiosity', 'Find a meaningful next step through journeys, learning, community, and local ministry.', f'''<section class="hs-wrap hs-discovery"><div class="hs-discovery-intro"><p class="hs-kicker">One encounter opens another</p><h1>What draws<br><em>you closer?</em></h1><p>You might find more than one way to take part. Follow a question and see where it leads.</p><nav class="hs-curiosity-nav" aria-label="Explore a question">{tabs}</nav><a class="hs-underlink" href="/explore/">I’d like to see the whole site ↗</a></div><div>{panels}</div></section>''')

details = [
('partners','Local ministry partnerships','Start with your community','What could we build<br><em>alongside you?</em>','You know the people you serve. We’d like to hear about your work and where a partnership might be useful.','A visiting team or an intern should contribute to the work you are already doing. Your priorities, capacity, and community help shape that possibility.','Begin with your perspective',['What your community needs','What visitors or interns could contribute','What a sustainable relationship requires'],'Talk about a partnership','/schedule/','Explore internship possibilities','/internships/'),
('groups','Journeys for your community','Share the invitation','A shared journey.<br><em>A new conversation.</em>','Bring people from your church, workplace, or community into an experience of listening and service.','The journey begins with who is coming, what they hope to learn, and how they could contribute alongside a local partner. Tell us what you imagine, and we’ll explore the possibilities together.','Begin with your people',['Who you imagine coming with you','What you hope to learn together','The time and resources you have'],'Let’s imagine it together','/schedule/','See current journeys','/explore/#trips'),
('students','College and university partnerships','Learning with a human context','Help learning become<br><em>lived experience.</em>','Explore how a ministry placement could connect your students’ disciplines with purposeful work.','We begin with your students, their learning goals, and the structure your institution needs. Together, we can consider where ministry needs and educational goals align.','Build the experience thoughtfully',['Learning outcomes and suitable work','Support, supervision, and communication','Timing and institutional requirements'],'Talk about your program','/schedule/','See the internship experience','/internships/')
]
for route,title,kicker,heading,lead,body,note,items,action,url,other,otherurl in details:
    page(route,title,lead,f'''<section class="hs-wrap hs-detail-page"><a class="hs-underlink" href="/discover/">← Keep exploring</a><p class="hs-kicker">{kicker}</p><h1>{heading}</h1><div class="hs-detail-grid"><div><p class="hs-intro">{lead}</p><p>{body}</p><div class="hs-action-row">{link(action,url)}</div><a class="hs-underlink" href="{otherurl}">{other} ↗</a></div><aside><p class="hs-kicker">A conversation to begin</p><h2>{note}</h2><ol>{''.join('<li>'+x+'</li>' for x in items)}</ol><p>Start with a question. We’ll work through the possibilities together.</p></aside></div></section>''')

print('Built 7 story-led public pages.')
