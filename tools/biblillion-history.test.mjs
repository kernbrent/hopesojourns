import test from 'node:test';import assert from 'node:assert/strict';
import {PLAYABLE_QUESTIONS as questions,QUESTIONS} from '../preview/biblillion/content.js';
import {historyRound,restoreHistory,mergeHistory,seedHistory,showHistoryQuestion,rolloverDaily,restoreRound,submitAnswer,adoptHistoryRound,newRound} from '../preview/biblillion/engine.js';
import {checkPath,safeAnswer,answerKey} from '../preview/biblillion/open-ended.js';
test('daily and Practice show all active questions before repeating, across cycle seams and resumed rounds',()=>{
 let h=restoreHistory(),sequence=[];const rounds=[];
 for(let n=0;n<90;n++){
  let r=historyRound(n%2?'daily':'practice','2026-11-27','round'+n);r.destinationId='athens';r.analyticsRoundId='round'+n;
  for(let i=0;i<7;i++){
   assert.equal(showHistoryQuestion(h,r),true);sequence.push(r.ids[i]);const count=h.seen.length;assert.equal(showHistoryQuestion(h,r),false);assert.equal(h.seen.length,count);
   submitAnswer(r,'',{skip:true});r.index++;r=restoreRound(JSON.parse(JSON.stringify(r)));h=restoreHistory(JSON.parse(JSON.stringify(h)));assert.ok(r);
  }
  assert.equal(new Set(r.ids).size,7);rounds.push(r);
 }
 for(let i=0;i+questions.length<=sequence.length;i+=questions.length){const cycle=sequence.slice(i,i+questions.length);assert.equal(new Set(cycle).size,questions.length);assert.deepEqual([...cycle].sort(),questions.map(q=>q.id).sort());}
 assert.ok(h.cycle>=6);
});
test('only displayed questions count; abandoned rounds and both modes share the same pool',()=>{
 const h=restoreHistory(),seen=[];
 for(let n=0;n<questions.length;n++){const r=historyRound(n%2?'practice':'daily','2026-11-27','abandon'+n);r.destinationId='kenya';showHistoryQuestion(h,r);seen.push(r.ids[0]);assert.equal(h.seen.length,n+1);}
 assert.equal(new Set(seen).size,questions.length);
});
test('all current topics drain before resetting, including the final unseen geography prompt',()=>{
 const target=questions.filter(q=>q.topic==='geography').at(-1),h=restoreHistory({seen:questions.filter(q=>q!==target).map(q=>q.id)}),r=historyRound();r.destinationId='athens';showHistoryQuestion(h,r);assert.equal(r.ids[0],target.id);assert.equal(h.seen.length,questions.length);submitAnswer(r,'',{skip:true});r.index++;showHistoryQuestion(h,r);assert.equal(h.cycle,1);assert.notEqual(r.ids[0],r.ids[1]);
});
test('new days refresh completed games, preserve unfinished journeys and never reset same-day progress',()=>{
 const daily=historyRound('daily','2026-11-26');daily.destinationId='athens';daily.results=Array.from({length:7},()=>({skipped:true}));daily.index=6;
 const store={daily,history:restoreHistory({seen:[questions[0].id]})};assert.equal(rolloverDaily(store,'2026-11-27'),true);assert.equal(store.daily.key,'2026-11-27');assert.equal(store.daily.results.length,0);assert.equal(store.history.seen.length,1);const same=store.daily;assert.equal(rolloverDaily(store,'2026-11-27'),false);assert.equal(store.daily,same);
 const unfinished=historyRound('daily','2026-11-26');unfinished.destinationId='kenya';store.daily=unfinished;assert.equal(rolloverDaily(store,'2026-11-27'),false);assert.equal(store.daily,unfinished);
});
test('migration records displayed saved questions, not unseen dealt slots; reload and merged tabs keep history',()=>{
 const r=newRound('practice','2026-11-26','migration');r.destinationId='athens';submitAnswer(r,QUESTIONS.find(q=>q.id===r.ids[0]).answers[0].name);r.index=1;const h=seedHistory(restoreHistory(),[r]);assert.deepEqual(h.seen,r.ids.slice(0,2));adoptHistoryRound(r);const restored=restoreRound(r);assert.deepEqual(restored.shownSlots,[0,1]);assert.equal(showHistoryQuestion(h,restored),false);
 assert.equal(mergeHistory({cycle:2,seen:[questions[0].id]},{cycle:1,seen:[questions[1].id]}).seen.length,1);assert.equal(mergeHistory({cycle:2,seen:[questions[0].id]},{cycle:2,seen:[questions[1].id]}).seen.length,2);
});
test('all care questions use AI for unfamiliar wording, punctuation and ambiguous spelling; factual scopes stay curated',()=>{
 for(const q of questions.filter(q=>q.topic==='care'))assert.equal(checkPath(q,'A soft pillow, perhaps?'),'judge',q.id);
 assert.equal(checkPath(questions.find(q=>q.id==='mission-care-kit'),'Food & water (bottled).'),'judge');assert.equal(answerKey('Pillow!'),'pillow');
 for(const text of ['I would take a pillow.','A comb / brush','A photo of home (family).', 'a'.repeat(100)])assert.equal(safeAnswer(text),true,text);
 assert.equal(checkPath(questions.find(q=>q.topic==='bible'),'Jerusalem'),'curated');assert.equal(checkPath(questions.find(q=>q.id==='mission-africa'),'Malawi'),'curated');assert.equal(checkPath(questions.find(q=>q.topic==='care'),'me@example.test'),'input');
});
