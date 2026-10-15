(()=>{
 const el=(tag,text,className)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(className)n.className=className;return n;};
 function videoPart(m){
  if(m.kind!=='video')return null;
  const match=String(m.title||'').match(/^(.*?)\s*(?:[—–-]\s*)?part\s+(\d+)\s+of\s+(\d+)\s*$/i);
  if(!match)return null;
  const title=match[1].trim().replace(/\s+/g,' ').toLowerCase(),part=Number(match[2]),total=Number(match[3]);
  return title&&Number.isSafeInteger(part)&&Number.isSafeInteger(total)&&part>=1&&part<=total&&total>1?{title,part,total,date:m.event_date||''}:null;
 }
 function nextVideoPart(items,index){
  const current=videoPart(items[index]);if(!current||current.part===current.total)return -1;
  const series=items.map((m,i)=>({i,part:videoPart(m)})).filter(({part})=>part&&part.title===current.title&&part.total===current.total&&part.date===current.date);
  const next=series.filter(({part})=>part.part===current.part+1);
  return series.filter(({part})=>part.part===current.part).length===1&&next.length===1?next[0].i:-1;
 }
 let viewer=null,viewerNumber=0;
 function openMedia(items,index,trigger){
  const overflow=viewer?viewer.dataset.originalOverflow:document.body.style.overflow;
  if(viewer)viewer.close();
  const dialog=el('dialog',null,'memory-media-viewer'),header=el('header'),close=el('button','Close'),heading=el('h2'),stage=el('div',null,'memory-media-stage'),caption=el('p',null,'memory-media-caption'),credit=el('p',null,'memory-credit'),status=el('p',null,'memory-media-status'),navigation=el('nav'),previous=el('button','← Previous'),next=el('button','Next →'),position=el('span',null,'memory-media-position');
  heading.id='memory-media-heading-'+(++viewerNumber);dialog.setAttribute('aria-labelledby',heading.id);navigation.setAttribute('aria-label','Photos and videos');position.setAttribute('aria-live','polite');position.setAttribute('aria-atomic','true');status.setAttribute('role','status');
  [close,previous,next].forEach(button=>button.type='button');previous.setAttribute('aria-label','Previous photo or video');next.setAttribute('aria-label','Next photo or video');previous.disabled=next.disabled=items.length<2;
  const continuation=el('p',null,'memory-media-continuation');continuation.append(el('em','(The next segment will play automatically when this one ends.)'));
  header.append(heading,close);navigation.append(previous,position,next);dialog.append(header,stage,navigation,caption,credit,status,continuation);
  let media=null;
  function clear(){if(media?.tagName==='VIDEO'){media.pause();media.removeAttribute('src');media.load();}stage.replaceChildren();media=null;}
  function show(){
   clear();const m=items[index];heading.textContent=m.title;caption.textContent=m.caption||'';caption.hidden=!m.caption;credit.textContent=m.credit||'';credit.hidden=!m.credit;status.textContent='';position.textContent=`${index+1} of ${items.length}`;
   continuation.hidden=nextVideoPart(items,index)<0;
   const current=el(m.kind==='video'?'video':'img');media=current;current.src=m.image_url;
   current.addEventListener('error',()=>{if(media===current)status.textContent=m.kind==='video'?'This video could not be played. Try another browser or choose another item.':'This photo could not be loaded. Try another item or reopen the viewer.';});
   if(m.kind==='video'){
    current.controls=true;current.playsInline=true;current.preload='metadata';current.setAttribute('aria-label',m.title);
    current.addEventListener('ended',()=>{if(media!==current||viewer!==dialog||!dialog.open||current.error)return;const following=nextVideoPart(items,index);if(following>=0){index=following;show();}});
   }else current.alt=m.alt_text||m.title;
   stage.append(current);
   if(m.kind==='video')current.play().catch(()=>{if(media===current&&!current.error)status.textContent='Press Play to start the video.';});
  }
  function move(step){index=(index+step+items.length)%items.length;show();}
  previous.onclick=()=>move(-1);next.onclick=()=>move(1);close.onclick=()=>dialog.close();
  dialog.addEventListener('keydown',event=>{if(event.target.tagName==='VIDEO'||event.altKey||event.ctrlKey||event.metaKey)return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();move(event.key==='ArrowLeft'?-1:1);}});
  dialog.dataset.originalOverflow=overflow;document.body.style.overflow='hidden';
  dialog.addEventListener('close',()=>{clear();dialog.remove();if(viewer===dialog){document.body.style.overflow=overflow;viewer=null;if(trigger.isConnected)trigger.focus();}});
  document.body.append(dialog);viewer=dialog;dialog.showModal();show();close.focus();
 }
 function memory(m,items=[],index=0){const f=el(m.kind!=='note'?'figure':'article',null,'memory-card');if(m.kind==='photo'){const button=el('button',null,'memory-photo-tile');button.type='button';button.setAttribute('aria-label',`View full-size photo: ${m.title}`);const img=el('img');img.src=m.image_url;img.alt=m.alt_text||m.title;img.loading='lazy';button.append(img);button.onclick=()=>openMedia(items,index,button);f.append(button);}else if(m.kind==='video'){const button=el('button',null,'memory-video-tile'),preview=el('video'),label=el('span','▶ Play video','memory-play-label');button.type='button';button.setAttribute('aria-label',`Play video: ${m.title}`);preview.src=m.image_url+'#t=0.1';preview.preload='metadata';preview.muted=true;preview.playsInline=true;preview.setAttribute('aria-hidden','true');preview.tabIndex=-1;button.append(preview,label);button.onclick=()=>openMedia(items,index,button);f.append(button);}f.append(el('h3',m.title));if(m.event_date)f.append(el('p',m.event_date,'memory-date'));if(m.caption)f.append(el('p',m.caption));if(m.content)f.append(window.HSJourneyContent.render(m.content));if(m.credit)f.append(el('p',m.credit,'memory-credit'));return f;}
 function collection(container,items,{preserveOrder=false,notesFirst=false}={}){
  container.replaceChildren();
  const photos=items.filter(m=>['photo','video'].includes(m.kind)).sort((a,b)=>preserveOrder?0:(a.event_date||'9999-12-31').localeCompare(b.event_date||'9999-12-31')||(a.created_at||'').localeCompare(b.created_at||'')||String(a.id||'').localeCompare(String(b.id||''))),notes=items.filter(m=>m.kind==='note');
  const appendNotes=()=>{if(notes.length){container.append(el('h2','Notes from the journey'));notes.forEach(m=>container.append(memory(m)));}};
  if(notesFirst)appendNotes();
  if(photos.length){container.append(el('h2',photos.some(m=>m.kind==='video')?'Trip photos & videos':'Trip photos'));const grid=el('div',null,'memory-gallery');photos.forEach((m,index)=>grid.append(memory(m,photos,index)));container.append(grid);}
  if(!notesFirst)appendNotes();
 }
 function story(container,s){container.replaceChildren(el('h1',s.title),el('p',[s.location,s.start_date,s.end_date].filter(Boolean).join(' · '),'memory-date'),el('p',s.summary));if(s.story)container.append(window.HSJourneyContent.render(s.story));const studies=el('section');s.content.forEach(c=>{const d=el('details',null,'memory-study');d.append(el('summary',[c.event_date,c.title].filter(Boolean).join(' · ')));d.append(window.HSJourneyContent.render(c.content,{study:c.content_type==='devotional'}));if(c.link_url&&/^https:\/\//i.test(c.link_url)){const a=el('a','Open related resource');a.href=c.link_url;a.target='_blank';a.rel='noopener';d.append(a);}studies.append(d);});if(s.content.length)container.append(el('h2','Devotionals and trip resources'),studies);const memories=el('section');collection(memories,s.memories,{preserveOrder:true});container.append(memories);}
 window.HSTripMemoriesView={collection,story};
})();
