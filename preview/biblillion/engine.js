import {validReceipt} from './open-ended.js';
import {QUESTIONS, BANK_VERSION,LEGACY_BANK_VERSION,PREVIOUS_BANK_VERSION,SUPPORTED_BANKS,BALANCED_BANK_VERSION,PLAYABLE_QUESTIONS,REWARD_BANKS,COMMON_BANKS} from './content.js';
import {QUESTION_MS} from './timer.js';
import {arrivalForPoints} from './rewards.js';
export const STORAGE_KEY='hs-biblillion-v1';
export const normalize=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const hasNegation=value=>/\b(?:no|not|never|without|don’t|don't|doesn’t|doesn't|isn’t|isn't)\b/i.test(String(value));
const phraseInput=(question,input)=>question.acceptPhrases?String(input).trim().replace(/^(?:(?:a|an|the|some|my|our|your|their|having|I have|we have|being with|spending time with|access to|being able to|to have)\s+)+/i,''):input;
export function matchAnswer(question,input){
 const key=normalize(phraseInput(question,input));if(!key)return null;
 return question.answers.find(a=>[a.name,...a.aliases].some(alias=>normalize(phraseInput(question,alias))===key))||null;
}
// Restricted Damerau-Levenshtein: a transposed pair is one spelling edit.
export function spellingDistance(a,b){
 const d=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));
 for(let i=0;i<=a.length;i++)d[i][0]=i;for(let j=0;j<=b.length;j++)d[0][j]=j;
 for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){
  d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);
 }return d[a.length][b.length];
}
export function resolveAnswer(question,input){
 const exact=matchAnswer(question,input);if(exact)return {answer:exact,corrected:false,candidates:[]};
 const key=normalize(phraseInput(question,input));if(key.length<4||key.length>100)return {answer:null,corrected:false,candidates:[]};
 const ranked=question.answers.map(answer=>({answer,distance:Math.min(...[answer.name,...answer.aliases].map(alias=>question.acceptPhrases&&hasNegation(input)!==hasNegation(alias)?Infinity:spellingDistance(key,normalize(phraseInput(question,alias)))))})).sort((a,b)=>a.distance-b.distance);
 const best=ranked[0],limit=key.length>=8?2:1;
 if(!best||best.distance>limit)return {answer:null,corrected:false,candidates:[]};
 const close=ranked.filter(x=>x.distance<=limit&&x.distance<=best.distance+1);
 if(close.length>1)return {answer:null,corrected:false,candidates:close.map(x=>x.answer)};
 return {answer:best.answer,corrected:true,candidates:[]};
}
export function clarify(question,input){
 const n=normalize(input);
 if(question.id==='apostles'&&n==='james')return 'Which James? Add “son of Zebedee” or “son of Alphaeus.”';
 if(question.id==='apostles'&&n==='simon')return 'Which Simon? Try Simon Peter or Simon the Zealot.';
 if(question.id==='women-genealogy'&&['bathsheba','uriahwife','wifeofuriah'].includes(n))return 'Matthew refers to her as Uriah’s wife. This prompt asks for a woman explicitly named in the chapter.';
 return 'That wording is not in this prompt’s reviewed bank yet. Try a shorter phrase or another answer. A thoughtful answer may still be valid; you can suggest it after the reveal.';
}
export function dateKey(date=new Date()){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const get=type=>parts.find(p=>p.type===type).value;return `${get('year')}-${get('month')}-${get('day')}`;
}
function shuffled(seed,source=QUESTIONS){
 let state=2166136261;for(const c of seed)state=Math.imul(state^c.charCodeAt(0),16777619)>>>0;
 const copy=[...source];for(let i=copy.length-1;i>0;i--){state=(Math.imul(state,1664525)+1013904223)>>>0;const j=state%(i+1);[copy[i],copy[j]]=[copy[j],copy[i]];}return copy;
}
function balancedDeck(seed,avoid=[]){
 const groups={general:QUESTIONS.slice(0,286).filter(q=>q.kind==='general'),easy:QUESTIONS.slice(0,286).filter(q=>q.kind==='focused'&&q.difficulty==='easy'),medium:QUESTIONS.slice(0,286).filter(q=>q.kind==='focused'&&q.difficulty==='medium'),hard:QUESTIONS.slice(0,286).filter(q=>q.kind==='focused'&&q.difficulty==='hard')};
 const first={general:4,easy:1,medium:1,hard:1},used={general:70,easy:30,medium:20,hard:20},last={general:3,easy:2,medium:1,hard:1};
 for(const type of Object.keys(groups)){
  groups[type]=shuffled(seed+':'+type,groups[type]);
  for(let i=0;i<first[type];i++)if(avoid.includes(groups[type][i].id)){
   const j=groups[type].findIndex((q,n)=>n>=first[type]&&n<used[type]-last[type]&&!avoid.includes(q.id));
   [groups[type][i],groups[type][j]]=[groups[type][j],groups[type][i]];
  }
 }
 const take=type=>groups[type].shift(),deck=[];
 for(let day=0;day<20;day++)deck.push(...(day%2===0?[take('general'),take('easy'),take('general'),take('medium'),take('general'),take('hard'),take('general')]:[take('general'),take('easy'),take('general'),take('easy'),take('general'),take('medium'),take('hard')]));
 return deck;
}
function commonDeck(seed,avoid=[]){
 const pools={bible:shuffled(seed+':bible',PLAYABLE_QUESTIONS.filter(q=>q.id!=='friendly-number'&&q.topic==='bible')),geography:shuffled(seed+':geography',PLAYABLE_QUESTIONS.filter(q=>q.id!=='friendly-number'&&q.topic==='geography')),care:shuffled(seed+':care',PLAYABLE_QUESTIONS.filter(q=>q.id!=='friendly-number'&&q.topic==='care'))};
 for(const [topic,n] of [['bible',3],['geography',2],['care',2]])for(let i=0;i<n;i++)if(avoid.includes(pools[topic][i].id)){const j=pools[topic].findIndex((q,k)=>k>=n&&k<({bible:42,geography:28,care:28}[topic])-n&&!avoid.includes(q.id));[pools[topic][i],pools[topic][j]]=[pools[topic][j],pools[topic][i]];}
 const take=t=>pools[t].shift(),deck=[];for(let day=0;day<14;day++)deck.push(take('bible'),take('geography'),take('care'),take('bible'),take('geography'),take('care'),take('bible'));return deck;
}
export const roundQuestions=seed=>commonDeck(seed).slice(0,7);
export const CYCLE_DAYS=14;
function dayIndex(key){const d=new Date(key+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==key)throw Error('Invalid game date');return Math.floor((d.getTime()-Date.UTC(2026,10,25))/86400000);}
export function dailyQuestions(key,version=BANK_VERSION){const day=dayIndex(key),cycle=Math.floor(day/CYCLE_DAYS),slot=((day%CYCLE_DAYS)+CYCLE_DAYS)%CYCLE_DAYS,seed=`common:${version}:`;const previous=commonDeck(seed+(cycle-1)).slice(-7).map(q=>q.id);return commonDeck(seed+cycle,previous).slice(slot*7,slot*7+7);}
function balancedDaily(key){const day=dayIndex(key),cycle=Math.floor(day/20),slot=((day%20)+20)%20;return balancedDeck(`schedule:${BALANCED_BANK_VERSION}:${cycle}`,balancedDeck(`schedule:${BALANCED_BANK_VERSION}:${cycle-1}`).slice(-7).map(q=>q.id)).slice(slot*7,slot*7+7);}
function previousDaily(key){
 const day=Math.floor((new Date(key+'T00:00:00Z').getTime()-Date.UTC(2026,10,25))/86400000),cycle=Math.floor(day/30),slot=((day%30)+30)%30;
 const deck=shuffled(`schedule:${PREVIOUS_BANK_VERSION}:${cycle}`,QUESTIONS.slice(0,210)),previous=shuffled(`schedule:${PREVIOUS_BANK_VERSION}:${cycle-1}`,QUESTIONS.slice(0,210)).slice(-7);
 // Only swap with the interior, preserving each cycle's final seven for seam checks.
 for(let i=0;i<7;i++)if(previous.some(q=>q.id===deck[i].id)){
  const j=deck.findIndex((q,index)=>index>=7&&index<deck.length-7&&!previous.some(p=>p.id===q.id));[deck[i],deck[j]]=[deck[j],deck[i]];
 }
 return deck.slice(slot*7,slot*7+7);
}
export function expectedDaily(key,version){if(version===LEGACY_BANK_VERSION)return shuffled(`daily:${key}:${LEGACY_BANK_VERSION}`,QUESTIONS.slice(0,14)).slice(0,7);if(version===PREVIOUS_BANK_VERSION)return previousDaily(key);if(version===BALANCED_BANK_VERSION)return balancedDaily(key);return dailyQuestions(key,version);}
export function newRound(mode='daily',key=dateKey(),nonce=''){
 const seed=mode==='daily'?`daily:${key}:${BANK_VERSION}`:`practice:${nonce}:${BANK_VERSION}`;
 return {version:BANK_VERSION,mode,key,ids:(mode==='daily'?dailyQuestions(key):roundQuestions(seed)).map(q=>q.id),results:[],index:0,timingMode:'timed'};
}
export const HISTORY_SELECTION='browser-history-v1';
const playableIds=new Set(PLAYABLE_QUESTIONS.map(q=>q.id));
export function restoreHistory(value){return {version:1,cycle:Number.isSafeInteger(value?.cycle)&&value.cycle>=0?value.cycle:0,seen:[...new Set(Array.isArray(value?.seen)?value.seen.filter(id=>playableIds.has(id)):[])]};}
export function mergeHistory(a,b){a=restoreHistory(a);b=restoreHistory(b);return a.cycle>b.cycle?a:b.cycle>a.cycle?b:{...a,seen:[...new Set([...a.seen,...b.seen])]};}
export function historyRound(mode='daily',key=dateKey(),nonce=''){
 return {...newRound(mode,key,nonce),selection:HISTORY_SELECTION,shownSlots:[]};
}
// Migrate only questions we can prove were displayed; future dealt slots are still unseen.
export function seedHistory(history,rounds){
 for(const r of rounds.filter(Boolean)){
  const slots=r.selection===HISTORY_SELECTION?r.shownSlots:Array.from({length:Math.min(7,r.results.length+(r.destinationId&&r.index<7&&!r.results[r.index]?1:0))},(_,i)=>i);
  for(const slot of slots||[]){const id=r.ids[slot];if(playableIds.has(id)&&!history.seen.includes(id))history.seen.push(id);}
 }
 return history;
}
export function adoptHistoryRound(round){
 if(!round||round.version!==BANK_VERSION||round.selection===HISTORY_SELECTION)return round;
 round.selection=HISTORY_SELECTION;round.shownSlots=Array.from({length:Math.min(7,round.results.length+(round.destinationId&&round.index<7&&!round.results[round.index]?1:0))},(_,i)=>i);return round;
}
export function showHistoryQuestion(history,round){
 if(!round||!round.destinationId||round.index>=7||round.selection!==HISTORY_SELECTION)return false;
 const slot=round.index;if(round.results[slot]||round.shownSlots.includes(slot))return false;
 const alreadyShown=new Set(round.shownSlots.map(i=>round.ids[i]));
 let unseen=PLAYABLE_QUESTIONS.filter(q=>!history.seen.includes(q.id)&&!alreadyShown.has(q.id));
 if(!unseen.length&&history.seen.length===playableIds.size){history.cycle++;history.seen=[];unseen=PLAYABLE_QUESTIONS.filter(q=>!alreadyShown.has(q.id));}
 if(!unseen.length)throw Error('No unseen discovery available.');
 const proposed=QUESTIONS.find(q=>q.id===round.ids[slot]);
 const preferred=unseen.filter(q=>q.topic===proposed.topic),pool=preferred.length?preferred:unseen;
 const chosen=pool.find(q=>q.id===proposed.id)||shuffled(`history:${round.key}:${round.mode}:${history.cycle}:${slot}:${round.analyticsRoundId||''}`,pool)[0];
 const other=round.ids.indexOf(chosen.id);
 if(other!==-1&&other!==slot)[round.ids[slot],round.ids[other]]=[round.ids[other],round.ids[slot]];else round.ids[slot]=chosen.id;
 round.shownSlots.push(slot);history.seen.push(chosen.id);return true;
}
export function rolloverDaily(store,today=dateKey()){
 if(!store.daily||store.daily.key!==today&&(store.daily.results.length===7||!store.daily.destinationId&&!store.daily.results.length)){store.daily=historyRound('daily',today);return true;}return false;
}
export function restoreRound(value){
 if(!value||!SUPPORTED_BANKS.includes(value.version)||!['daily','practice'].includes(value.mode)||!/^\d{4}-\d{2}-\d{2}$/.test(value.key)||!Array.isArray(value.ids)||value.ids.length!==7||new Set(value.ids).size!==7||!value.ids.every(id=>QUESTIONS.slice(0,value.version===LEGACY_BANK_VERSION?14:value.version===PREVIOUS_BANK_VERSION?210:value.version===BALANCED_BANK_VERSION?286:QUESTIONS.length).some(q=>q.id===id&&(!COMMON_BANKS.includes(value.version)||q.active)))||!Array.isArray(value.results)||value.results.length>7)return null;
 const personal=value.selection===HISTORY_SELECTION&&value.version===BANK_VERSION;
 if(value.selection!==undefined&&!personal)return null;
 if(personal&&(!Array.isArray(value.shownSlots)||value.shownSlots.some(i=>!Number.isInteger(i)||i<0||i>6)||new Set(value.shownSlots).size!==value.shownSlots.length))return null;
 try{if(!personal&&value.mode==='daily'&&JSON.stringify(value.ids)!==JSON.stringify(expectedDaily(value.key,value.version).map(q=>q.id)))return null;}catch{return null;}
 const results=[];for(let i=0;i<value.results.length;i++){
  const r=value.results[i],q=QUESTIONS.find(q=>q.id===value.ids[i]);
  if(!r||typeof r.skipped!=='boolean'||r.timedOut===true&&!r.skipped)return null;
  const receipt=validReceipt(q,r.receipt)&&r.receipt.name===r.answer?r.receipt:null;const answer=r.skipped?null:receipt||q.answers.find(a=>a.name===r.answer);if(!r.skipped&&!answer)return null;
  results.push({skipped:r.skipped,answer:answer?.name||null,points:answer?.points||0,...(receipt?{receipt}:{}),...(r.corrected===true?{corrected:true}:{}),...(r.timedOut===true?{timedOut:true}:{})});
 }
 // Ignore supplied totals and scores. The reviewed content is authoritative.
 const index=Number.isInteger(value.index)&&value.index>=0&&value.index<=7?value.index:0;
 if(!(index===results.length||index===results.length-1))return null;
 return {version:value.version,mode:value.mode,key:value.key,ids:[...value.ids],results,index,timingMode:'timed',...(personal?{selection:HISTORY_SELECTION,shownSlots:[...value.shownSlots]}:{}),...(value.clock&&value.clock.slot===index&&Number.isFinite(value.clock.remainingMs)&&value.clock.remainingMs>=0&&value.clock.remainingMs<=45000?{clock:{slot:index,remainingMs:Math.min(QUESTION_MS,value.clock.remainingMs),cushionUsed:value.clock.cushionUsed===true,typing:value.clock.typing===true,attempts:Array.isArray(value.clock.attempts)?value.clock.attempts.filter(x=>typeof x==='string').slice(-50):[]}}:{}),...(typeof value.destinationId==='string'?{destinationId:value.destinationId.slice(0,50)}:{}),...(typeof value.analyticsRoundId==='string'&&/^[a-f0-9-]{36}$/i.test(value.analyticsRoundId)?{analyticsRoundId:value.analyticsRoundId}:{}),...(value.celebrated===true?{celebrated:true}:{})};
}
export const totalFor=round=>round.results.reduce((sum,r)=>sum+r.points,0);
export function submitAnswer(round,input,{skip=false,timedOut=false}={}){
 if(round.index>=7||round.results[round.index])return null;
 const question=QUESTIONS.find(q=>q.id===round.ids[round.index]),resolved=skip?{answer:null,corrected:false}:resolveAnswer(question,input);const answer=resolved.answer;
 if(!skip&&!answer)return null;
 const result={skipped:skip,answer:answer?.name||null,points:answer?.points||0,...(resolved.corrected?{corrected:true}:{}),...(skip&&timedOut?{timedOut:true}:{})};round.results.push(result);return result;
}
export const stampsFor=round=>round.results.filter(r=>!r.skipped).length;
export const completionBonus=round=>round.results.length===7&&stampsFor(round)===7?150:0;
export const arrivalBonus=round=>REWARD_BANKS.includes(round.version)&&round.results.length===7?arrivalForPoints(totalFor(round)).bonus:0;
export const maxFor=round=>REWARD_BANKS.includes(round.version)?1000:850;
export const journeyTotal=round=>totalFor(round)+completionBonus(round)+arrivalBonus(round);
