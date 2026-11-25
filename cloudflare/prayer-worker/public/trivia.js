window.createPrayerTrivia = function({api,element,button,action}) {
 const root=document.querySelector('#trivia-game'),boards=document.querySelector('#trivia-leaderboards');
 let attempt=null,generation=0,name='Prayer player';
 const busyRead=async(path)=>{const stamp=generation,result=await api(path);return stamp===generation?result:null;};
 function focusHeading() {const heading=root.querySelector('h3');if(heading){heading.tabIndex=-1;heading.focus();}}
 function reset(){generation++;attempt=null;name='Prayer player';root.replaceChildren();boards.replaceChildren();}
 function hasUnfinished(){return !!attempt&&!attempt.completed;}
 async function leave(){
  if(!hasUnfinished())return true;
  if(!window.confirm('Leave this unfinished round? You will receive no score or leaderboard entry for it.'))return false;
  await api(`trivia/attempts/${attempt.id}/abandon`,{});generation++;attempt=null;return true;
 }
 window.addEventListener('beforeunload',event=>{if(hasUnfinished()){event.preventDefault();event.returnValue='';}});
 async function leaderboard(){
  const stamp=generation,rows=await Promise.all([api('trivia/leaderboard?round=1'),api('trivia/leaderboard?round=2')]);
  if(stamp!==generation)return;boards.replaceChildren();
  for(const board of rows){
   const panel=element('section',undefined,'panel');panel.append(element('h3',`Round ${board.round} leaderboard`),element('p','First completed attempt · tied scores share a rank · top 100','hint'));
   if(!board.items.length)panel.append(element('p','The first completed round will start this leaderboard.'));
   else {const table=element('table'),caption=element('caption',`Round ${board.round} scores`),head=element('thead'),tr=element('tr');
    for(const title of ['Rank','Player','Score']){const th=element('th',title);th.scope='col';tr.append(th);}head.append(tr);table.append(caption,head);
    const body=element('tbody');for(const item of board.items){const row=element('tr');if(item.you)row.className='trivia-you';row.append(element('td',String(item.rank)),element('td',item.name+(item.you?' (you)':'')),element('td',`${item.score}/100`));body.append(row);}table.append(body);const scroll=element('div',undefined,'trivia-table');scroll.append(table);panel.append(scroll);
   }boards.append(panel);
  }
 }
 async function start(round,form){
  name=form.elements.display_name.value.trim();const stamp=generation;
  const result=await api('trivia/start',{round,display_name:name});if(stamp!==generation)return;
  attempt=result;renderQuestion();focusHeading();
 }
 function startForm(round,practice=false,continuing=false){
  const form=element('form',undefined,'panel trivia-start');form.append(element('h3',`${practice?'Practice':'Play'} round ${round}`));
  const label=element('label','Leaderboard display name'),input=element('input');input.name='display_name';input.required=true;input.maxLength=40;input.value=name;label.append(input);
  form.append(label,element('p',practice?'Your first completed score is already recorded. You can practice without changing it.':'Your chosen name and score will be visible to approved portal members only after you finish all 10 questions.','hint'));
  const submit=element('button',continuing?'Continue to Round 2':practice?'Start practice':`Start round ${round}`,'primary');submit.type='submit';form.append(submit);
  form.addEventListener('submit',event=>{event.preventDefault();action(()=>start(round,form))(event);});return form;
 }
 async function load(){
  if(attempt){render();await leaderboard();return;}
  const result=await busyRead('trivia');if(!result)return;
  root.replaceChildren(element('p','Two rounds. Ten questions each. A new order every time.'));
  root.append(element('p','Complete a round to receive a score out of 100. Leaving early earns no score or leaderboard entry. Each question is worth 10 points; the two-part question awards 5 points per part. Your first completed attempt in each round is ranked. Later attempts are practice.','privacy-note'));
  for(const row of result.attempts.slice(0,1))root.append(button(`Resume unfinished round ${row.round}`,async()=>{const saved=await busyRead(`trivia/attempts/${row.id}`);if(saved){attempt=saved;render();focusHeading();}}));
  root.append(startForm(1,result.results.some(r=>r.round===1)));
  if(result.results.some(r=>r.round===1))root.append(startForm(2,result.results.some(r=>r.round===2)));
  await leaderboard();
 }
 function renderQuestion(){
  const q=attempt.question;root.replaceChildren();
  root.append(element('p',`Round ${attempt.round} · Question ${attempt.answered+1} of 10`,'eyebrow'));
  const progress=element('progress');progress.max=10;progress.value=attempt.answered;progress.setAttribute('aria-label',`${attempt.answered} of 10 questions answered`);root.append(progress);
  const card=element('form',undefined,'panel trivia-question');card.append(element('span',q.difficulty,'badge'),element('h3',q.title));
  for(const [index,part] of q.parts.entries()){
   const fieldset=element('fieldset'),legend=element('legend',(q.parts.length>1?`Part ${index+1}: `:'')+part.prompt);fieldset.append(legend);
   for(const choice of part.choices){const label=element('label',undefined,'trivia-choice'),radio=element('input');radio.type='radio';radio.name=part.id;radio.value=choice.id;radio.required=true;label.append(radio,element('span',choice.text));fieldset.append(label);}card.append(fieldset);
  }
  const submit=element('button','Check answer','primary');submit.type='submit';card.append(submit);
  card.addEventListener('submit',event=>{event.preventDefault();action(async()=>{
   const stamp=generation,choices=Object.fromEntries(new FormData(card)),result=await api(`trivia/attempts/${attempt.id}/answer`,{question_id:q.id,choices});
   if(stamp!==generation)return;attempt=result;renderFeedback();focusHeading();
  })(event);});root.append(card);
  root.append(button('Refresh round',async()=>{const saved=await busyRead(`trivia/attempts/${attempt.id}`);if(saved){attempt=saved;render();focusHeading();}}),button('Leave round',async()=>{if(await leave())await load();}));
  root.append(element('p','Connection interrupted? Choose Refresh round to check whether your answer was saved. Unfinished rounds can be resumed for 24 hours.','hint'));
 }
 function renderFeedback(){
  const feedback=attempt.feedback;root.replaceChildren();const panel=element('article',undefined,'panel trivia-feedback');panel.append(element('h3',feedback.title));
  for(const [i,part] of feedback.parts.entries()){
   panel.append(element('p',`${feedback.parts.length>1?`Part ${i+1} · `:''}${part.correct?'Correct!':'Keep learning.'}`,part.correct?'trivia-correct':'trivia-incorrect'));
   if(!part.correct)panel.append(element('p',`Your answer: ${part.selected}`));panel.append(element('p',`Correct answer: ${part.answer}`));
  }
  panel.append(element('p',feedback.explanation));const link=element('a','Read the source: '+feedback.source.label);link.href=feedback.source.url;link.target='_blank';link.rel='noopener noreferrer';panel.append(link);root.append(panel);
  root.append(button(attempt.completed?'See round results':'Next question',async()=>{if(attempt.completed)await renderResults();else renderQuestion();focusHeading();},'primary'));
 }
 async function renderResults(){
  root.replaceChildren(element('h3',`Round ${attempt.round} complete!`),element('p',`${attempt.score} / 100`,'trivia-score'),element('p',attempt.ranked?'Your score has been added to this round’s leaderboard.':'Practice complete. Your first completed score remains on the leaderboard.'));
  if(attempt.round===1){root.append(element('p','Ready for ten more?'),startForm(2,false,true),button('Skip for now',async()=>{attempt=null;await load();}));}
  else root.append(element('p','Thank you for playing The Prayer Challenge!'),button('Back to the challenge',async()=>{attempt=null;await load();}));
  await leaderboard();
 }
 function render(){if(attempt.feedback)renderFeedback();else renderQuestion();}
 return {load,reset,leave,hasUnfinished};
};
