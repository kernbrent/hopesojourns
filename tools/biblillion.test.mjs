import test from 'node:test';import assert from 'node:assert/strict';
import {QUESTIONS,BANK_VERSION,LEGACY_BANK_VERSION,tierFor,scriptureURL} from '../preview/biblillion/content.js';
import {normalize,matchAnswer,resolveAnswer,clarify,dateKey,newRound,restoreRound,submitAnswer,totalFor,roundQuestions,dailyQuestions,expectedDaily,completionBonus,journeyTotal,CYCLE_DAYS} from '../preview/biblillion/engine.js';
test('every prompt has a complete, non-colliding reviewed answer set and a featured treasure',()=>{
 assert.equal(new Set(QUESTIONS.map(q=>q.id)).size,QUESTIONS.length);assert.equal(QUESTIONS.length,210);assert.equal(CYCLE_DAYS,30);
 for(const q of QUESTIONS){assert.ok(q.scope&&q.hint&&q.category);assert.ok(q.answers.some(a=>a.points===100),q.id);const aliases=new Map();
  for(const a of q.answers){assert.ok([35,50,65,85,100].includes(a.points));assert.ok(a.ref&&a.note);assert.ok(scriptureURL(a.ref).startsWith('https://www.biblegateway.com/'));assert.ok(tierFor(a.points));
   for(const alias of [a.name,...a.aliases]){const key=normalize(alias);assert.ok(!aliases.has(key)||aliases.get(key)===a.name,`${q.id}: ambiguous ${alias}`);aliases.set(key,a.name);assert.equal(matchAnswer(q,' '+alias.toUpperCase()+' '),a);}
  }
 }
});
test('a whole 30-day deck has no repeats and cycle boundaries do not repeat the preceding day',()=>{
 for(let cycle=0;cycle<8;cycle++){const ids=[];for(let day=0;day<30;day++)ids.push(...dailyQuestions(new Date(Date.UTC(2026,10,25+cycle*30+day)).toISOString().slice(0,10)).map(q=>q.id));assert.equal(new Set(ids).size,210);const next=dailyQuestions(new Date(Date.UTC(2026,10,25+(cycle+1)*30)).toISOString().slice(0,10)).map(q=>q.id);assert.ok(!ids.slice(-7).some(id=>next.includes(id)));}
 assert.throws(()=>dailyQuestions('2026-02-30'));
});
test('legacy in-progress daily and practice rounds survive an additive bank expansion',()=>{
 const ids=expectedDaily('2026-11-24',LEGACY_BANK_VERSION).map(q=>q.id),old={version:LEGACY_BANK_VERSION,mode:'daily',key:'2026-11-24',ids,results:[],index:0};submitAnswer(old,QUESTIONS.find(q=>q.id===ids[0]).answers[0].name);assert.deepEqual(restoreRound(old),old);assert.equal(restoreRound({...old,mode:'practice'}).version,LEGACY_BANK_VERSION);
});
test('clear spelling mistakes earn full points, while multiple plausible answers require a choice',()=>{
 for(const [id,typed,wanted]of [['churches','Thyatrira','Thyatira'],['apostles','Jhon','John'],['sons','Benjmin','Benjamin'],['prophets','Habakukk','Habakkuk']]){const resolved=resolveAnswer(QUESTIONS.find(q=>q.id===id),typed);assert.equal(resolved.answer?.name,wanted);assert.equal(resolved.corrected,true);}
 const q={answers:[{name:'Mary',aliases:[]},{name:'Mark',aliases:[]}]};const ambiguous=resolveAnswer(q,'Mari');assert.equal(ambiguous.answer,null);assert.equal(ambiguous.candidates.length,2);assert.equal(resolveAnswer(q,'Mary').corrected,false);assert.equal(resolveAnswer(q,'Ma').answer,null);
});
test('seven correct stamps award one 150-point passport bonus; skips never earn the bonus',()=>{
 const r=newRound();for(let i=0;i<7;i++){submitAnswer(r,QUESTIONS.find(q=>q.id===r.ids[i]).answers.find(a=>a.points===100).name);r.index++;}assert.equal(completionBonus(r),150);assert.equal(journeyTotal(r),850);assert.equal(journeyTotal(restoreRound(r)),850);
 const s=newRound();for(let i=0;i<7;i++){submitAnswer(s,'',{skip:true});s.index++;}assert.equal(completionBonus(s),0);
});
test('daily selection is deterministic and Central-time dates cross midnight and DST correctly',()=>{
 assert.deepEqual(roundQuestions('same'),roundQuestions('same'));assert.equal(new Set(roundQuestions('same')).size,7);
 assert.equal(dateKey(new Date('2026-11-25T05:59:59Z')),'2026-11-24');assert.equal(dateKey(new Date('2026-11-25T06:00:00Z')),'2026-11-25');
 assert.equal(dateKey(new Date('2026-07-25T04:59:59Z')),'2026-07-24');assert.equal(dateKey(new Date('2026-07-25T05:00:00Z')),'2026-07-25');
 for(let d=1;d<=28;d++){const round=newRound('daily',`2026-11-${String(d).padStart(2,'0')}`);assert.ok(restoreRound(round));}
});
test('unknown answers cannot score, and ambiguous names require clarification',()=>{
 const apostles=QUESTIONS.find(q=>q.id==='apostles');assert.equal(matchAnswer(apostles,'James'),null);assert.match(clarify(apostles,'James'),/Which James/);assert.equal(matchAnswer(apostles,'Simon'),null);
 assert.equal(matchAnswer(QUESTIONS.find(q=>q.id==='emperors'),'Nero'),null);
 assert.equal(matchAnswer(QUESTIONS.find(q=>q.id==='women-genealogy'),'Bathsheba'),null);
 const r=newRound();assert.equal(submitAnswer(r,'not a biblical answer'),null);assert.equal(totalFor(r),0);assert.equal(r.results.length,0);
});
test('one score per question, all seven answers, skip and resume',()=>{
 const r=newRound();for(let i=0;i<7;i++){const q=QUESTIONS.find(q=>q.id===r.ids[i]);const answer=q.answers.find(a=>a.points===100);const result=submitAnswer(r,answer.name);assert.equal(result.points,100);assert.equal(submitAnswer(r,answer.name),null);assert.deepEqual(restoreRound(r),r);r.index++;}
 assert.equal(totalFor(r),700);assert.deepEqual(restoreRound(r),r);assert.equal(submitAnswer(r,'Paul'),null);
 const s=newRound('practice','2026-11-24','seed');submitAnswer(s,'',{skip:true});assert.equal(s.results[0].skipped,true);assert.equal(totalFor(s),0);assert.deepEqual(restoreRound(s),s);
});
test('saved states reject malformed data and recompute points instead of trusting stored totals',()=>{
 for(const v of [null,{},[],{version:'old'},'bad'])assert.equal(restoreRound(v),null);
 const r=newRound();submitAnswer(r,QUESTIONS.find(q=>q.id===r.ids[0]).answers[0].name);const expected=totalFor(r);r.results[0].points=99999;assert.equal(totalFor(restoreRound(r)),expected);
 assert.equal(restoreRound({...r,index:7}),null);assert.equal(restoreRound({...r,ids:Array(7).fill(r.ids[0])}),null);assert.equal(restoreRound({...r,version:BANK_VERSION+'wrong'}),null);
 const changed=newRound();[changed.ids[0],changed.ids[1]]=[changed.ids[1],changed.ids[0]];assert.equal(restoreRound(changed),null);
});
