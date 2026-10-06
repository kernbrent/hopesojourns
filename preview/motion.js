(() => {
  const body=document.body;
  const menu=document.querySelector('.nav-toggle');
  const links=document.querySelector('.nav-links');
  function closeMenu(){menu.setAttribute('aria-expanded','false');links.classList.remove('open');}
  menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));links.classList.toggle('open',open);});
  links.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeMenu));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.getAttribute('aria-expanded')==='true'){closeMenu();menu.focus();}});
  function showTrips(){if(location.hash==='#trips'){document.querySelector('#trips').scrollIntoView({behavior:'instant'});document.querySelector('#journeys-title').focus({preventScroll:true});}}
  window.addEventListener('hashchange',showTrips);
  showTrips();
  const button=document.querySelector('.motion-toggle');
  const preference=matchMedia('(prefers-reduced-motion: reduce)');
  let paused=preference.matches;
  function apply(){
    body.classList.toggle('motion-paused',paused);
    button.setAttribute('aria-pressed',String(paused));
    button.disabled=preference.matches;
    button.textContent=preference.matches?'Motion reduced':paused?'Resume motion ▶':'Pause motion Ⅱ';
    button.title=preference.matches?'Follows your device’s reduced-motion setting':'';
  }
  button.addEventListener('click',()=>{paused=!paused;apply();});
  preference.addEventListener('change',event=>{paused=event.matches;apply();});
  apply();
  for (const [story, chapter] of [['red', 'chapter-1'], ['john', 'chapter-2']]) {
    const controls = document.querySelector(`#${story}-6 .story-controls`);
    const invitation = document.createElement('div');
    invitation.className = 'full-chapter-invitation';
    invitation.innerHTML = `<p>There’s more to this encounter.</p><a class="solid-link" href="/book/${chapter}/">Read the full chapter <span aria-hidden="true">↗</span></a><small>Read at your own pace, or explore the other chapters.</small>`;
    controls.before(invitation);
  }
  document.querySelectorAll('.scene-art').forEach(art=>{
    const john=art.classList.contains('john');
    const note=art.querySelector('.scene-note').textContent;
    art.removeAttribute('aria-label');
    art.innerHTML=`<figure class="story-photo"><img src="/assets/story-${john?'park-bench':'red-juice'}-realistic.png" alt="${john?'An empty wooden bench beside an olive-lined path at dusk':'A small red juice carton on a stone ledge at dusk'}"><figcaption>Story illustration · AI-created</figcaption></figure><p class="scene-note"></p>`;
    art.querySelector('.scene-note').textContent=note;
  });
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
    entry.target.classList.toggle('is-in-view',entry.isIntersecting);
  }),{threshold:.12});
  document.querySelectorAll('.story-option,.people-strip,.destination-links a').forEach(el=>observer.observe(el));
})();
