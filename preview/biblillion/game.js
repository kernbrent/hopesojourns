import {QUESTIONS,TIERS,tierFor,scriptureURL,BANK_VERSION} from './content.js';
import {STORAGE_KEY,dateKey,newRound,restoreRound,totalFor,submitAnswer,clarify,resolveAnswer,stampsFor,completionBonus,journeyTotal,maxFor} from './engine.js';
import {restoreHistory,mergeHistory,historyRound,seedHistory,showHistoryQuestion,rolloverDaily,adoptHistoryRound} from './engine.js';
import {destinationFor} from './destinations.js';
import {destinationPicker,passportTrail,passportSummary,showCelebration,stampMarkup} from './passport.js';
import {reporter} from './analytics.js';
import {startQuestionTimer} from './timer.js';
import {validReceipt,checkPath} from './open-ended.js';
const $=s=>document.querySelector(s), escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const refLabel=ref=>ref.startsWith('https:')?(ref.includes('oikoumene.org')?'Church-family directory':'Background source'):ref.length>75?'Supporting Bible passages':ref;
const cookiePath=new URL('.',import.meta.url).pathname;
let store={daily:null,practice:null,mode:'daily'},storageOK=true,notice='';
try{const data=JSON.parse(localStorage.getItem(STORAGE_KEY));if(data){store={daily:restoreRound(data.daily),practice:restoreRound(data.practice),mode:data.mode==='practice'?'practice':'daily',history:data.history};}}catch{storageOK=false;}
try{store.pendingEvents=JSON.parse(localStorage.getItem(STORAGE_KEY))?.pendingEvents||[];}catch{store.pendingEvents=[];}
const migratingHistory=store.history?.version!==1;store.history=restoreHistory(store.history);if(migratingHistory)seedHistory(store.history,[store.daily,store.practice]);adoptHistoryRound(store.daily);adoptHistoryRound(store.practice);rolloverDaily(store);
if(store.mode==='practice'&&!store.practice)store.mode='daily';
const current=()=>store[store.mode];
function syncHistory(){try{store.history=mergeHistory(store.history,JSON.parse(localStorage.getItem(STORAGE_KEY))?.history);}catch{}}
function save(){
 syncHistory();
 try{localStorage.setItem(STORAGE_KEY,JSON.stringify(store));storageOK=true;}catch{storageOK=false;}
 try{const d=store.daily;document.cookie=`hs_biblillion_progress=${encodeURIComponent(JSON.stringify({v:1,date:d.key,step:d.index,total:totalFor(d)}))}; Path=${cookiePath}; Max-Age=15552000; SameSite=Lax${location.protocol==='https:'?'; Secure':''}`;}catch{}
}

function bank(question){return `<details class="set-details"><summary>Explore all ${question.answers.length} accepted answers</summary><ul class="answer-bank">${[...question.answers].sort((a,b)=>b.points-a.points).map(a=>`<li><a href="${scriptureURL(a.ref)}" target="_blank" rel="noopener noreferrer" aria-label="${escape(a.name)}, read ${escape(a.ref)}">${escape(a.name)}</a><span>${a.points}</span></li>`).join('')}</ul><p class="small-note">Points are editorial estimates for this question, not the percentage of people who chose an answer.</p></details>`;}
function correction(question){const body=`Biblillion content review\nBank: ${BANK_VERSION}\nPrompt: ${question.prompt}\nScope: ${question.scope}\n\nSuggested answer or correction:\nSupporting source or equivalent wording:\n`;return `<a class="correction" href="mailto:admin@hopesojourns.com?subject=${encodeURIComponent('Biblillion answer suggestion: '+question.id)}&body=${encodeURIComponent(body)}">Suggest an answer or correction</a>`;}
function questionCard(round,fresh=-1){
 const question=QUESTIONS.find(q=>q.id===round.ids[round.index]);const result=round.results[round.index];
 if(result){
  const answer=result.skipped?[...question.answers].sort((a,b)=>b.points-a.points)[0]:(result.receipt?{...result.receipt,ref:question.answers[0].ref}:question.answers.find(a=>a.name===result.answer)),tier=tierFor(result.points);
  return `<section class="reveal" aria-labelledby="reveal-title"><p class="eyebrow">${result.timedOut?'TIME TO DISCOVER':result.skipped?'A DISCOVERY TO TAKE WITH YOU':'FOUND ALONG THE WAY'}</p><div class="reveal-score"><span class="gem-badge" aria-hidden="true">${result.skipped?'◇':tier.mark}</span><div><p class="tier-name">${result.skipped?'One you might remember':tier.name}</p><h2 id="reveal-title" tabindex="-1">${escape(answer.name)}</h2></div><span class="points-earned">${result.skipped?'0':'+'+result.points}</span></div>${result.corrected?`<p class="spelling-confirmed">Correct answer! Spelling: <strong>${escape(answer.name)}</strong>. Full points earned.</p>`:''}${!result.skipped?`<div class="earned-stamp ${fresh===round.index?'fresh-stamp':''}" style="--stamp-angle:-5deg">${stampMarkup(destinationFor(round.destinationId),round.index,round.key,escape,'earned')}<p><strong>Passport stamped.</strong>${escape(destinationFor(round.destinationId)?.name||'Your destination')} · entry ${round.index+1}</p></div>`:''}<p class="reveal-note">${escape(answer.note)}</p><p class="small-note">${result.skipped?(result.timedOut?'Time is up. Here is one answer to take on your next journey. No stamp this time.':'You skipped this prompt. Here is one accepted answer.'):tier.description+' Every correct answer is worth finding.'}</p><a class="reference-link" href="${scriptureURL(answer.ref)}" target="_blank" rel="noopener noreferrer">Read ${escape(refLabel(answer.ref))} <span class="small-note">(opens a new tab)</span></a><button class="primary-button" id="next-button" type="button">${round.index===6?'Open my treasure collection':'Next discovery'}</button>${result.receipt?'<p class="small-note">This new answer earned a stamp. Its provisional score may be reviewed in MMT for future games.</p>':''}${bank(question)}${correction(question)}</section>`;
 }
 return `<div class="question-meta"><span class="category-label">${escape(question.category)} · ${question.active?'Common knowledge':question.difficulty==='hard'?'Archived challenge':'Saved question'}</span><div class="question-timer" role="timer" aria-label="Time remaining"><strong id="timer-seconds">25</strong><span id="timer-label">seconds</span></div><span id="timer-announcement" class="timer-announcement" role="status"></span></div><h2 class="question" id="question-title" tabindex="-1">${escape(question.prompt)}</h2><p class="scope">${escape(question.scope)}</p><form id="answer-form" data-question="${question.id}"><label class="answer-label" for="answer">Your answer</label><div class="answer-row"><input id="answer" name="answer" type="text" maxlength="100" placeholder="Dig a little deeper…" autocomplete="off" autocapitalize="words" spellcheck="false" aria-describedby="answer-error"><button class="primary-button" type="submit">Uncover it</button></div><p id="answer-error" class="answer-error" role="status"></p></form><div class="tools-row"><button class="text-button" id="clue-button" type="button" aria-expanded="false" aria-controls="clue">Need a starting point?</button><button class="text-button" id="skip-button" type="button">Skip & discover</button></div><p class="clue" id="clue" hidden>${escape(question.hint)}${question.starter?`<br><strong>One familiar answer: ${escape(question.starter)}.</strong> Use it or think of something less obvious; familiar answers still earn a stamp.`:''}</p>`;
}
let activeTimer=null,checking=null,expiredWhileChecking=false,renderGeneration=0;
const report=reporter(store,save,message=>{const status=$('#sharing-status');if(status)status.textContent=message;});
async function attempt(value,confirmed=false){
 const round=current(),question=QUESTIONS.find(q=>q.id===round.ids[round.index]),input=$('#answer'),status=$('#answer-error');
 if(checking||round.results[round.index])return;
 if(!value.trim()){status.textContent='Type an answer, or choose Skip & discover.';input.setAttribute('aria-invalid','true');input.focus();return;}
 const resolved=resolveAnswer(question,value);
 if(activeTimer?.submitted(resolved.answer?'':value)===null)return;
 if(!resolved.answer&&checkPath(question,value)==='judge'){
  const generation=renderGeneration,slot=round.index,controller=new AbortController();checking=controller;expiredWhileChecking=false;
  input.disabled=true;$('#answer-form button').disabled=true;$('#skip-button').disabled=true;status.textContent='Checking your idea… The clock keeps running.';
  const timeout=setTimeout(()=>controller.abort(),3800);
  try{
   const response=await fetch('/api/interest/public/biblillion/judge',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',redirect:'error',signal:controller.signal,body:JSON.stringify({questionId:question.id,answer:value.trim()})});const data=await response.json();
   if(generation!==renderGeneration||current()!==round||round.index!==slot)return;
   if(response.ok&&data.verdict==='valid'&&validReceipt(question,data.receipt)){
    const result={skipped:false,answer:data.receipt.name,points:data.receipt.points,receipt:data.receipt};round.results.push(result);report.record(round,result);save();render(true,slot);return;
   }
   status.textContent=data.message||data.error||'The checker could not confirm that idea. Try another answer.';if(resolved.candidates.length)offerChoices(resolved.candidates,status);
  }catch{if(generation===renderGeneration)status.textContent='The new-answer check is unavailable. Try a familiar answer while there is time.';}
  finally{clearTimeout(timeout);if(checking===controller){checking=null;if(generation===renderGeneration){input.disabled=false;$('#answer-form button').disabled=false;$('#skip-button').disabled=false;if(expiredWhileChecking){expireQuestion();}else input.focus();}}}
  return;
 }
 if(!resolved.answer){status.replaceChildren();const message=document.createElement('p');message.textContent=checkPath(question,value)==='input'?'That wording could not be sent for checking. Use one short idea (up to 100 characters) without links or contact details.':resolved.candidates.length?'That could mean more than one answer. Which did you mean?':clarify(question,value)+' This factual question uses the reviewed answer list, not AI.';status.append(message);for(const a of resolved.candidates){const button=document.createElement('button');button.type='button';button.className='spelling-choice';button.textContent='I meant '+a.name;button.onclick=()=>attempt(a.name,true);status.append(button);}input.setAttribute('aria-invalid','true');input.focus();return;}
 const result=submitAnswer(round,value);if(!result)return;if(confirmed)result.corrected=true;report.record(round,result);save();render(true,result.skipped?-1:round.index);
}
function offerChoices(candidates,status){for(const answer of candidates){const button=document.createElement('button');button.type='button';button.className='spelling-choice';button.textContent='I meant '+answer.name;button.onclick=()=>attempt(answer.name,true);status.append(button);}}
function expireQuestion(){if(checking){expiredWhileChecking=true;return;}const round=current(),result=submitAnswer(round,'',{skip:true,timedOut:true});if(result)report.record(round,result);save();render(true);}
function render(focus=false,fresh=-1){
 renderGeneration++;checking?.abort();checking=null;expiredWhileChecking=false;
 activeTimer?.stop();activeTimer=null;
 const round=current();syncHistory();if(showHistoryQuestion(store.history,round))save();const finished=round.index===7;
 $('#game').innerHTML=`<div class="game-shell"><div class="title-row"><div><p class="eyebrow">HOPE SOJOURNS PRESENTS</p><h1 class="wordmark">Bib<em>lillion.</em></h1><p class="tagline">Start with the obvious. Discover the unexpected.</p></div><nav class="mode-tabs" aria-label="Game mode"><button type="button" data-mode="daily" aria-pressed="${store.mode==='daily'}">Daily discovery</button><button type="button" data-mode="practice" aria-pressed="${store.mode==='practice'}">Practice</button></nav></div>${notice?`<p class="clue" role="status">${escape(notice)}</p>`:''}${round.version!==BANK_VERSION?'<p class="clue">Your saved round keeps its original questions and points. <button class="text-button" id="updated-practice-button" type="button">Try the easier discoveries in Practice</button></p>':''}<section id="today-invitation" class="clue" ${round.mode==='daily'&&round.key!==dateKey()?'':'hidden'}><p>Your saved daily journey is from ${escape(round.key)}. Continue it below, or start today’s new discovery. Starting today replaces this saved journey.</p><button class="primary-button" id="today-button" type="button">Start today’s new discovery</button></section><div class="play-layout"><article class="play-card"><div class="card-top"><span><span class="live-dot" aria-hidden="true"></span>${round.mode==='daily'?'DAILY DISCOVERY':'PRACTICE EXPEDITION'}</span><span class="round-date">${finished?'7 of 7 complete':'Find '+(round.index+1)+' of 7'}</span></div><div class="card-body">${finished?passportSummary(round):destinationFor(round.destinationId)?questionCard(round,fresh):destinationPicker(escape)}</div><div class="card-bottom"><span>${round.mode==='daily'?round.key+' · Central time':'25 seconds per discovery'}</span><span class="save-state"><span class="save-mark" aria-hidden="true">◇</span>${storageOK?'Saved in this browser':'Browser storage unavailable · keep this tab open'}</span></div></article>${passportTrail(round,escape,fresh)}</div><div class="rarity-strip"><div class="rarity-legend">${[...TIERS].reverse().map(t=>`<span><b aria-hidden="true">${t.mark}</b>${t.name}</span>`).join('')}</div><span class="rarity-note">Rarity is editorial, not a player statistic.</span></div>${round.mode==='practice'&&!finished?'<button class="text-button" id="new-practice-button" type="button">Start a fresh practice round</button>':''}${finished?`<section class="round-review" aria-labelledby="review-title"><h2 id="review-title">Your collection, with the story behind it.</h2><ul class="results-list">${round.results.map((r,i)=>{const q=QUESTIONS.find(q=>q.id===round.ids[i]);const a=r.receipt?{...r.receipt,ref:q.answers[0].ref}:q.answers.find(a=>a.name===r.answer);return `<li class="result-row"><span aria-hidden="true">${r.skipped?'–':tierFor(r.points).mark}</span><div><strong>${escape(a?.name||'Skipped')}</strong><small>${escape(q.prompt)}</small>${a?`<a href="${scriptureURL(a.ref)}" target="_blank" rel="noopener noreferrer">${escape(refLabel(a.ref))}</a>`:''}${bank(q)}${correction(q)}</div><span>${r.points}</span></li>`;}).join('')}</ul></section>`:''}</div>`;
 $('[data-mode="daily"]').onclick=()=>switchMode('daily');$('[data-mode="practice"]').onclick=()=>switchMode('practice');
 const form=$('#answer-form');if(form)form.onsubmit=event=>{event.preventDefault();attempt($('#answer').value);};
 if($('#answer'))$('#answer').oninput=()=>{activeTimer?.typing($('#answer').value);$('#answer').removeAttribute('aria-invalid');$('#answer-error').textContent='';};
 if($('#clue-button'))$('#clue-button').onclick=()=>{const open=$('#clue-button').getAttribute('aria-expanded')==='true';$('#clue-button').setAttribute('aria-expanded',String(!open));$('#clue').hidden=open;};
 if($('#skip-button'))$('#skip-button').onclick=()=>{const result=submitAnswer(round,'',{skip:true});if(result)report.record(round,result);save();render(true);};
 if($('#next-button'))$('#next-button').onclick=()=>{round.index++;delete round.clock;save();render(true);};
 if($('#updated-practice-button'))$('#updated-practice-button').onclick=startPractice;
 if($('#new-practice-button'))$('#new-practice-button').onclick=startPractice;
 if($('#today-button'))$('#today-button').onclick=()=>{store.daily=historyRound();notice='Today’s new discovery is ready. Your question history is preserved.';save();render(true);};
 if($('#share-button'))$('#share-button').onclick=async()=>{const text=`Biblillion · ${round.mode==='daily'?round.key:'Practice'}\n${journeyTotal(round)} / ${maxFor(round)} journey points · ${stampsFor(round)} stamps\n${round.results.map(r=>r.skipped?'—':r.points===100?'✦':r.points>=85?'◆':r.points>=65?'◇':'•').join(' ')}\nMission Journey Passport · Hope Sojourns`;try{await navigator.clipboard.writeText(text);$('#share-status').textContent='Copied! Your answers are kept out of the result.';}catch{$('#share-status').textContent='Copy this result:';const area=document.createElement('textarea');area.value=text;area.setAttribute('aria-label','Result to copy');area.rows=4;area.style.width='100%';$('#share-status').append(area);area.focus();area.select();}};
 document.querySelectorAll('[data-destination]').forEach(button=>button.onclick=()=>{if(round.results.length&&round.destinationId)return;round.destinationId=button.dataset.destination;round.analyticsRoundId||=crypto.randomUUID();save();render(true);});
 if($('#sharing-details'))$('#sharing-details').onclick=()=>$('#privacy-dialog').showModal();
 if($('#celebrate-button'))$('#celebrate-button').onclick=()=>showCelebration(round);
 if(finished&&!round.celebrated){round.celebrated=true;save();showCelebration(round);}
 if(form)activeTimer=startQuestionTimer({round,paused:()=>document.hidden||!!document.querySelector('dialog[open]'),save,onTick:(seconds,paused,cushion)=>{const n=$('#timer-seconds'),label=$('#timer-label');if(n){n.textContent=seconds;label.textContent=paused?'paused':cushion?'finishing cushion':'seconds';n.closest('.question-timer').dataset.urgent=String(seconds<=10&&!paused);if(seconds===10&&!paused&&$('#timer-announcement')&&!$('#timer-announcement').textContent)$('#timer-announcement').textContent='Ten seconds left.';}},onExpire:expireQuestion});
 if(focus){const heading=$('#reveal-title')||$('#question-title')||$('#summary-title')||$('#destination-title');heading?.focus({preventScroll:true});if(innerWidth<721)heading?.scrollIntoView({block:'nearest'});}
}
function switchMode(mode){notice='';rolloverDaily(store);if(mode==='practice'&&!store.practice)store.practice=historyRound('practice',dateKey(),crypto.randomUUID());store.mode=mode;save();render(true);}
function startPractice(){store.practice=historyRound('practice',dateKey(),crypto.randomUUID());store.mode='practice';notice='A fresh practice expedition. Your daily progress is still saved.';save();render(true);}
$('#help-button').onclick=()=>$('#help-dialog').showModal();$('#privacy-button').onclick=()=>$('#privacy-dialog').showModal();
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>button.closest('dialog').close());
$('#reset-button').onclick=()=>{report.clearPending();try{localStorage.removeItem(STORAGE_KEY);}catch{}document.cookie=`hs_biblillion_progress=; Path=${cookiePath}; Max-Age=0; SameSite=Lax`;Object.assign(store,{daily:historyRound(),practice:null,mode:'daily',pendingEvents:[],history:restoreHistory()});notice='Your saved Biblillion progress was cleared. A fresh daily round is ready.';$('#privacy-dialog').close();render(true);};
save();render();void report.flush();
window.addEventListener('online',()=>void report.flush());

window.addEventListener('pagehide',()=>activeTimer?.stop());

function refreshDay(){if(rolloverDaily(store)){save();if(store.mode==='daily')render();}else if(store.mode==='daily'&&store.daily.key!==dateKey()){const invitation=$('#today-invitation');if(invitation)invitation.hidden=false;}}
window.addEventListener('pageshow',event=>{refreshDay();if(event.persisted)render();});
window.addEventListener('focus',refreshDay);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshDay();});setInterval(refreshDay,30000);
