import {chapters,moods,encounters,responses,concerns,days,outlineText} from './content.js';
import {KEY,COOKIE,COOKIE_PATH,MAX_AGE,fresh,restore,checkpoint} from './state.js';

const root=document.querySelector('#experience');
let storage;
try { storage=window.localStorage; } catch { storage={getItem(){return null;},setItem(){throw Error('Storage unavailable');},removeItem(){}}; }
function readCookie(){try{return document.cookie;}catch{return '';}}
let state=restore(storage,readCookie()),storageMode='';
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
function btn(text,fn,cls='primary'){const node=el('button',text,cls);node.type='button';node.addEventListener('click',fn);return node;}
function link(text,href,cls='quiet',external=false){const node=el('a',text,cls);node.href=href;if(external){node.target='_blank';node.rel='noopener noreferrer';node.setAttribute('aria-label',text+' (opens a new tab)');}return node;}
function save(){
  state.updated=Date.now(); let local=false,cookie=false;
  try {storage.setItem(KEY,JSON.stringify(state));local=true;} catch {}
  try {document.cookie=`${COOKIE}=${encodeURIComponent(JSON.stringify(checkpoint(state)))}; Max-Age=${MAX_AGE}; Path=${COOKIE_PATH}; SameSite=Lax${location.protocol==='https:'?'; Secure':''}`;cookie=document.cookie.split('; ').some(x=>x.startsWith(COOKIE+'='));} catch {}
  storageMode=local&&cookie?'full':local?'local':cookie?'cookie':'none';
  document.querySelector('#save-status').textContent={full:'Your place is saved in this browser.',local:'Progress saved in browser storage. Cookies are blocked.',cookie:'Progress saved by cookie. Reflections will not persist.',none:'Saving is unavailable. Keep this tab open to continue.'}[storageMode];
}
function navigate(view){state.view=view;save();render();}
function move(chapter){state.chapter=chapter;save();render();}
function actions(...nodes){const row=el('div',undefined,'actions');row.append(...nodes);root.append(row);}
function intro(kicker,title,lead,duration='About 5 minutes'){
  const row=el('div',undefined,'chapter-top');row.append(el('p',kicker,'kicker'),el('span',duration,'duration'));root.append(row,el('h2',title));
  if(lead)root.append(el('p',lead,'lead'));
}
function feedback(title,text){const box=el('div',undefined,'feedback');box.setAttribute('role','status');box.append(el('strong',title),el('p',text));return box;}
function choices(key,items,title,after){
  const group=el('div',undefined,'choices');group.setAttribute('role','group');group.setAttribute('aria-label',title);
  const reveal=el('div');let next;
  function show(){
    reveal.replaceChildren();const chosen=items.find(x=>x[0]===state[key]);
    if(chosen){if(key==='encounter'){const notes=el('div',undefined,'field-notes');notes.append(el('p',chosen[2]));reveal.append(notes,feedback('A moment to notice',chosen[3]));}
    else if(key==='response')reveal.append(feedback(chosen[2],chosen[3]));
    else reveal.append(feedback(key==='concern'?'One practical step':'What you noticed',chosen[2]));}
    if(next)next.disabled=!chosen;
  }
  for(const [value,label] of items){const b=btn('',()=>{state[key]=value;save();for(const node of group.children){const selected=node.dataset.value===value;node.setAttribute('aria-pressed',String(selected));node.firstChild.textContent=selected?'✓':'';}show();},'choice');
    b.dataset.value=value;b.setAttribute('aria-pressed',String(state[key]===value));const mark=el('span',state[key]===value?'✓':'','choice-mark');mark.setAttribute('aria-hidden','true');b.append(mark,el('span',label));group.append(b);}
  root.append(group,reveal);next=btn('Continue',after);next.disabled=!state[key];show();actions(btn('Back',()=>move(state.chapter-1),'quiet'),next);
}
function passport(){
  const list=document.querySelector('#passport');list.replaceChildren();const preparing=state.view!=='game';
  document.querySelector('#passport-label').textContent=preparing?'Your preparation passport':'Your discovery passport';
  const labels=preparing?days.map(d=>d.word):chapters;
  labels.forEach((title,i)=>{const earned=preparing?state.days[i]:state.completed||state.chapter>i+1;const current=preparing?state.day===i:!state.completed&&state.chapter===i+1;
    const li=el('li',undefined,earned?'earned':current?'current':'');li.append(el('span',earned?'✓':String(i+1),'stamp'),el('span',title));li.setAttribute('aria-label',`${preparing?'Day':'Chapter'} ${i+1}: ${title}${earned?', complete':current?', current':''}`);list.append(li);});
}
function renderGame(){
  if(state.chapter===0){
    intro('An invitation to discover','What could change when you take one step beyond?','Step into a story. Make a few choices. Discover what a Mission Journey might open in you.');
    const quote=el('blockquote','“You don’t have to arrive with all the answers.”','pull-quote');root.append(quote);
    root.append(el('p','You’ll meet a host, join a table, and consider what it means to serve. Along the way, collect five passport stamps through reflection and discovery.'));
    const box=el('div',undefined,'field-notes');box.append(el('p','Five chapters. Your own pace.'),el('p','No scores or leaderboard. Your choices help shape a personal reflection. You can leave and return in this browser.'));root.append(box);
    actions(btn('Begin my journey',()=>move(1)),btn('Explore seven-day preparation',()=>navigate('prepare'),'quiet'));
    root.append(el('p','The encounter is fictional and illustrates respectful service. It is not a report about an identifiable person or a promise of a particular trip activity.','soft'));return;
  }
  const progress=el('div',undefined,'progress-row');const bar=el('progress');bar.max=5;bar.value=state.completed?5:state.chapter-1;bar.setAttribute('aria-label','Discovery chapters completed');progress.append(bar,el('span',`${state.completed?5:state.chapter-1} of 5 stamps`));root.append(progress);
  if(state.chapter===1){intro('Chapter 1 · Begin','Where are you starting today?','Before choosing a destination, take a moment to notice your own heart. Choose the thought that feels closest.');choices('mood',moods,'Your starting point',()=>move(2));}
  if(state.chapter===2){intro('Chapter 2 · Notice','Your plans meet a person.','Imagine arriving with a team at a community meal hosted by a local ministry.');
    root.append(el('p','You packed work clothes and prepared for a repair project. Your host welcomes you, then says the plan has changed. The team serving lunch could use some company at the tables. One neighbor is sitting alone.'));
    root.append(el('blockquote','“Thank you for coming. Could you join us here today?”','pull-quote'));root.append(el('p','You want to contribute. What do you do first?'));choices('encounter',encounters,'How you respond to your host',()=>move(3));}
  if(state.chapter===3){intro('Chapter 3 · Listen','There is more to the story.','At the table, you meet a neighbor whose life is different from your own.');
    root.append(el('p','The meal is a familiar weekly gathering for them. You are the visitor. Your host introduces you, then gives you both time to talk. You know little about this person beyond what you can see.'));
    root.append(el('p','How might you begin?'));choices('response',responses,'How you join the conversation',()=>move(4));}
  if(state.chapter===4){intro('Chapter 4 · Make room','What would you need to work through?','Perhaps you can imagine yourself joining a journey. Perhaps you still have questions. Both are a place to begin.');
    root.append(el('p','A changed perspective does not make schedules, costs, and responsibilities disappear. Name the concern you would most like to explore. You can revisit the others.'));choices('concern',concerns,'Your main question about going',()=>move(5));}
  if(state.chapter===5){
    intro('Chapter 5 · Take a step',state.completed?'Your next chapter is open.':'A journey can begin before you go.','Here is a reflection shaped by the choices you made.');
    const mood=moods.find(x=>x[0]===state.mood),response=responses.find(x=>x[0]===state.response),concern=concerns.find(x=>x[0]===state.concern);
    const box=el('div',undefined,'field-notes');box.append(el('p',mood?.[2]||'Stay curious as you explore.'),el('h3','At the table'),el('p',response?.[3]||'Listen before deciding how to help.'),el('h3',concern?.[1]||'Your next question'),el('p',concern?.[2]||'Bring your questions to a trip leader.'));root.append(box);
    root.append(el('p','This reflection follows your selected answers. It does not determine God’s calling or your readiness for a particular trip. Prayer, practical information, and trusted counsel can help you discern what comes next.','soft'));
    if(!state.completed)actions(btn('Back',()=>move(4),'quiet'),btn('Collect my final stamp',()=>{state.completed=true;save();render();}));
    else {root.append(feedback('Five discovery stamps collected','You made room to notice, listen, and consider a next step. Keep that curiosity with you.'));actions(btn('Prepare my heart for seven days',()=>navigate('prepare')),link('Explore Mission Journeys','https://hopesojourns.com/#trips','quiet',true));actions(link('Ask a trip leader a question','https://hopesojourns.com/interest/','quiet',true),btn('Revisit my choices',()=>move(1),'quiet'));}
  }
}
function renderPreparation(){
  const completed=state.days.filter(Boolean).length,d=days[state.day];
  intro('Seven days · An open heart','Prepare your heart for the journey.','Read. Reflect. Pray. Practice. About 8–10 minutes a day, with room to go at your own pace.','No missed-day penalties');
  const progress=el('div',undefined,'progress-row'),bar=el('progress');bar.max=7;bar.value=completed;bar.setAttribute('aria-label','Preparation days completed');progress.append(bar,el('span',`${completed} of 7 days complete`));root.append(progress);
  const nav=el('nav',undefined,'day-nav');nav.setAttribute('aria-label','Preparation days');
  days.forEach((item,i)=>{const b=btn('',()=>{state.day=i;save();render();},state.days[i]?'complete':'');b.append(el('span','DAY'),el('strong',state.days[i]?'✓':String(i+1)));b.setAttribute('aria-label',`Day ${i+1}: ${item.title}${state.days[i]?', complete':''}`);if(i===state.day)b.setAttribute('aria-current','step');nav.append(b);});root.append(nav);
  root.append(el('p',`Day ${state.day+1} · ${d.word}`,'kicker'),el('h3',d.title));
  const reading=el('div',undefined,'reading');reading.append(el('span','Read '+d.reference),link('Open the Scripture reading',`https://www.biblegateway.com/passage/?search=${encodeURIComponent(d.passage)}&version=KJV`,'',true));root.append(reading);
  root.append(el('p',d.devotional));const prayer=el('div',undefined,'field-notes');prayer.append(el('p','A prayer to make your own','kicker'),el('p',d.prayer));root.append(prayer,el('h3','One small practice'),el('p',d.practice));
  const label=el('label','A private reflection (optional)'),note=el('textarea');note.rows=3;note.maxLength=1500;note.placeholder=d.reflection;note.value=state.notes[state.day];const day=state.day;note.addEventListener('input',()=>{state.notes[day]=note.value;save();});label.append(note);root.append(el('p',d.reflection),label,el('p','Saved only in this browser when browser storage is available. Reflections are never included in the email or profile sharing.','soft'));
  const check=el('label',undefined,'check-label'),input=el('input');input.type='checkbox';input.checked=state.days[day];input.addEventListener('change',()=>{state.days[day]=input.checked;save();render(false);root.querySelector('input[type="checkbox"]').focus({preventScroll:true});});check.append(input,el('span','I’ve spent time with today’s reading, prayer, and practice.'));root.append(check);
  if(completed===7)root.append(feedback('Seven days of preparation completed','Choose one action and a date to take it. Keep listening, seek wise counsel, and carry these practices into everyday life.'));
  if(day<6)actions(btn('Continue to day '+(day+2),()=>{state.day++;save();render();}),btn('Get the full outline',()=>navigate('email'),'quiet'));
  else actions(link('Explore Mission Journeys','https://hopesojourns.com/#trips','primary',true),btn('Get the full outline',()=>navigate('email'),'quiet'));
  root.append(el('p','All seven days are available now. Come back tomorrow, or read ahead. These original devotionals are reflections on Scripture; read the full passages in your Bible.','soft'));
}
function field(form,label,name,type='text',required=false){const wrap=el('label',label),input=el('input');input.type=type;input.name=name;input.maxLength=type==='email'?254:100;input.required=required;input.autocomplete=({email:'email',name:'name',city:'address-level2'})[name]||'off';wrap.append(input);form.append(wrap);return input;}
function checkField(form,label,name,fn){const wrap=el('label',undefined,'check-label'),input=el('input');input.type='checkbox';input.name=name;wrap.append(input,el('span',label));if(fn)input.addEventListener('change',fn);form.append(wrap);return input;}
function downloadOutline(){const url=URL.createObjectURL(new Blob([outlineText()],{type:'text/plain;charset=utf-8'})),a=link('','');a.href=url;a.download='Hope-Sojourns-Seven-Day-Preparation.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
let outlineId='',outlineSignature='';
function renderEmail(){
  intro('Take the preparation with you','A little space for the days ahead.','Keep the complete seven-day outline, including every reading, devotional, prayer, and practice.','Optional');
  actions(btn('Download the full outline',downloadOutline),btn('Return to my preparation',()=>navigate('prepare'),'quiet'));
  root.append(el('h3','Email me the seven-day outline'),el('p','Request the complete outline by email. You can separately choose to share optional details with Hope Sojourns. No account is created.','soft'));
  const form=el('form');form.setAttribute('aria-label','Outline email and optional profile');
  field(form,'Your email address','email','email',true);
  const emailConsent=checkField(form,'Email me this seven-day preparation outline. This request does not sign me up for marketing.','emailConsent');emailConsent.required=true;
  const profile=el('fieldset');profile.hidden=true;profile.disabled=true;profile.append(el('legend','Optional details to share with Hope Sojourns'));
  const share=checkField(form,'I’d also like to share a few details about myself with Hope Sojourns for its private MMT Portal.','shareProfile',()=>{profile.hidden=!share.checked;profile.disabled=!share.checked;});
  field(profile,'Name (optional)','name');field(profile,'City or area (optional)','city');field(profile,'Church or organization (optional)','church');
  const interestLabel=el('label','Where are you in exploring mission work? (optional)'),interest=el('select');interest.name='interest';
  for(const [value,text] of [['','Prefer not to say'],['curious','Just curious'],['considering','Considering a Mission Journey'],['group','Exploring for a group'],['local','Interested in serving close to home']]){const option=el('option',text);option.value=value;interest.append(option);}interestLabel.append(interest);profile.append(interestLabel);
  checkField(profile,'A Hope Sojourns team member may contact me about mission opportunities.','contact');
  profile.append(el('p','Sharing includes your email, optional details and permission choices for staff review. Your private reflections, story choices and daily completion history stay in this browser.','soft'));form.append(profile);
  const trap=el('input');trap.name='website';trap.tabIndex=-1;trap.autocomplete='off';trap.hidden=true;form.append(trap);
  const submit=el('button','Email my outline','primary');submit.type='submit';form.append(submit);
  const receipt=el('div');receipt.setAttribute('role','status');receipt.setAttribute('aria-live','polite');
  form.addEventListener('input',()=>receipt.replaceChildren());
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!form.reportValidity())return;
    const values=Object.fromEntries(new FormData(form)),payload={email:values.email,emailConsent:true,shareProfile:share.checked,contactConsent:share.checked&&form.elements.contact.checked,consentVersion:'2026-11-24',website:values.website||'',...(share.checked?{name:values.name||'',city:values.city||'',church:values.church||'',interest:values.interest||''}:{})};
    const signature=JSON.stringify(payload);if(signature!==outlineSignature){outlineSignature=signature;outlineId=crypto.randomUUID();}
    submit.disabled=true;receipt.textContent='Saving your request…';
    try{const response=await fetch('/api/interest/public/mission-preparation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,id:outlineId})});const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to complete your request.');
      const message=result.status==='sent'?'Your outline was accepted for email delivery. Check your inbox and spam folder.':result.status==='captured'?'Test mode: your outline email was captured. No email was sent.':result.status==='accepted'?'Your request was received.':'Your request was saved, but email delivery is not confirmed. You can retry with the same details or download the outline.';
      receipt.replaceChildren(feedback('Your preparation outline',message+(result.shared?' Your optional details were shared privately with Hope Sojourns for review.':'')));
    }catch(error){receipt.textContent=error.message+' Your progress is still saved. You can also download the outline.';}
    finally{submit.disabled=false;}
  });root.append(form,receipt);
}
function render(focus=true){
  root.replaceChildren();passport();
  for(const b of document.querySelectorAll('[data-view]')){const active=b.dataset.view===(state.view==='email'?'prepare':state.view);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
  if(state.view==='game')renderGame();else if(state.view==='prepare')renderPreparation();else renderEmail();
  if(focus){const heading=root.querySelector('h2');heading.tabIndex=-1;heading.focus({preventScroll:true});root.scrollIntoView({behavior:'instant',block:'start'});}
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));
const dialog=document.querySelector('#privacy-dialog');
document.querySelector('#privacy-button').addEventListener('click',()=>{document.querySelector('#forget-confirm').hidden=true;document.querySelector('#storage-details').textContent={full:'Cookie and browser storage are available. Your reflections stay in browser storage only.',local:'Cookies are blocked. Browser storage is saving your progress and reflections.',cookie:'Browser storage is blocked. The cookie saves chapter and day progress, but reflections cannot persist.',none:'Both saving methods are unavailable. Progress will be lost when this tab closes.'}[storageMode];dialog.showModal();});
document.querySelector('#close-privacy').addEventListener('click',()=>dialog.close());
document.querySelector('#forget-button').addEventListener('click',()=>document.querySelector('#forget-confirm').hidden=false);
document.querySelector('#cancel-forget').addEventListener('click',()=>document.querySelector('#forget-confirm').hidden=true);
document.querySelector('#confirm-forget').addEventListener('click',()=>{try{storage.removeItem(KEY);}catch{}document.cookie=`${COOKIE}=; Max-Age=0; Path=${COOKIE_PATH}; SameSite=Lax`;state=fresh();dialog.close();render();document.querySelector('#save-status').textContent='Progress cleared. New choices will start a fresh save.';});
window.addEventListener('storage',event=>{if(event.key===KEY){state=restore(storage,readCookie());render(false);}});
save();render(false);
