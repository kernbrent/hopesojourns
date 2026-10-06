/* Only the public MMT destination feed is used here. */
(async()=>{
 const grids=[...document.querySelectorAll('.destination-links')];
 const status=document.createElement('p');status.className='destination-status';status.setAttribute('role','status');status.textContent='Loading current journey details…';grids[0].before(status);
 const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
 try{
  const response=await fetch('/api/destinations',{cache:'no-store'});if(!response.ok)throw Error();
  const {destinations}=await response.json();
  const featured=['england','mexico-city','athens'];
  grids.forEach((grid,index)=>{
   const items=index?destinations.filter(d=>!featured.includes(d.slug)):featured.map(s=>destinations.find(d=>d.slug===s)).filter(Boolean);
   grid.replaceChildren();
   items.forEach(d=>{
    const card=el('article','journey-tile','');
    const photo=el('div','journey-photo','');const img=document.createElement('img');img.src=new URL(d.image_url,'https://hopesojourns.com').href;img.alt=d.image_alt||d.title;img.loading='lazy';photo.append(img);
    const heading=el('div','journey-heading','');heading.append(el('span','journey-location',d.location),el('h3','',d.title));
    const button=el('button','journey-disclosure','View journey details +');button.type='button';button.setAttribute('aria-expanded','false');const id='journey-info-'+d.slug;button.setAttribute('aria-controls',id);
    const details=el('div','journey-details','');details.id=id;details.append(el('p','journey-summary',d.summary));
    if(d.dates_text){const dates=el('ul','journey-dates','');d.dates_text.split('\n').filter(Boolean).forEach(line=>dates.append(el('li','',line)));details.append(dates);}
    const link=el('a','journey-explore','Explore '+d.title+' →');link.href=['athens','kenya','belize','nice','arkansas','mexico-city','others'].includes(d.slug)?'https://hopesojourns.com/trips/'+encodeURIComponent(d.slug)+'/':'https://hopesojourns.com/destination/?destination='+encodeURIComponent(d.slug);details.append(link);
    const setOpen=open=>{card.classList.toggle('details-open',open);button.setAttribute('aria-expanded',String(open));button.textContent=open?'Hide journey details −':'View journey details +';};
    button.addEventListener('click',()=>setOpen(!card.classList.contains('details-open')));
    card.addEventListener('mouseenter',()=>{if(matchMedia('(hover:hover) and (pointer:fine)').matches)setOpen(true);});
    card.addEventListener('mouseleave',()=>{if(!card.contains(document.activeElement))setOpen(false);});
    card.addEventListener('focusout',e=>{if(!card.contains(e.relatedTarget))setOpen(false);});
    card.addEventListener('keydown',e=>{if(e.key==='Escape'){setOpen(false);button.focus();}});
    card.append(photo,heading,button,details);grid.append(card);
   });
  });status.remove();
 }catch{status.textContent='Current journey details could not load. Select a destination to view its latest information.';}
})();
