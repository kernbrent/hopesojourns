import {QUESTIONS, BANK_VERSION,LEGACY_BANK_VERSION,PREVIOUS_BANK_VERSION,SUPPORTED_BANKS} from './content.js';
import {QUESTION_MS} from './timer.js';
import {arrivalForPoints} from './rewards.js';
export const STORAGE_KEY='hs-biblillion-v1';
export const normalize=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function matchAnswer(question,input){
 const key=normalize(input);if(!key)return null;
 return question.answers.find(a=>[a.name,...a.aliases].some(alias=>normalize(alias)===key))||null;
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
 const key=normalize(input);if(key.length<4||key.length>100)return {answer:null,corrected:false,candidates:[]};
 const ranked=question.answers.map(answer=>({answer,distance:Math.min(...[answer.name,...answer.aliases].map(alias=>spellingDistance(key,normalize(alias))))})).sort((a,b)=>a.distance-b.distance);
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
 return 'That answer is not in this prompt’s reviewed set. Check the scope or spelling and try again. It may still be a biblical name or idea.';
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
 const groups={general:QUESTIONS.filter(q=>q.kind==='general'),easy:QUESTIONS.filter(q=>q.kind==='focused'&&q.difficulty==='easy'),medium:QUESTIONS.filter(q=>q.kind==='focused'&&q.difficulty==='medium'),hard:QUESTIONS.filter(q=>q.kind==='focused'&&q.difficulty==='hard')};
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
export const roundQuestions=seed=>balancedDeck(seed).slice(0,7);
export const CYCLE_DAYS=20;
export function dailyQuestions(key){
 const date=new Date(key+'T00:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==key)throw Error('Invalid game date');
 const day=Math.floor((date.getTime()-Date.UTC(2026,10,25))/86400000),cycle=Math.floor(day/CYCLE_DAYS),slot=((day%CYCLE_DAYS)+CYCLE_DAYS)%CYCLE_DAYS;
 const previous=balancedDeck(`schedule:${BANK_VERSION}:${cycle-1}`).slice(-7).map(q=>q.id),deck=balancedDeck(`schedule:${BANK_VERSION}:${cycle}`,previous);
 return deck.slice(slot*7,slot*7+7);
}
function previousDaily(key){
 const day=Math.floor((new Date(key+'T00:00:00Z').getTime()-Date.UTC(2026,10,25))/86400000),cycle=Math.floor(day/30),slot=((day%30)+30)%30;
 const deck=shuffled(`schedule:${PREVIOUS_BANK_VERSION}:${cycle}`,QUESTIONS.slice(0,210)),previous=shuffled(`schedule:${PREVIOUS_BANK_VERSION}:${cycle-1}`,QUESTIONS.slice(0,210)).slice(-7);
 // Only swap with the interior, preserving each cycle's final seven for seam checks.
 for(let i=0;i<7;i++)if(previous.some(q=>q.id===deck[i].id)){
  const j=deck.findIndex((q,index)=>index>=7&&index<deck.length-7&&!previous.some(p=>p.id===q.id));[deck[i],deck[j]]=[deck[j],deck[i]];
 }
 return deck.slice(slot*7,slot*7+7);
}
export function expectedDaily(key,version){if(version===LEGACY_BANK_VERSION)return shuffled(`daily:${key}:${LEGACY_BANK_VERSION}`,QUESTIONS.slice(0,14)).slice(0,7);if(version===PREVIOUS_BANK_VERSION)return previousDaily(key);return dailyQuestions(key);}
export function newRound(mode='daily',key=dateKey(),nonce=''){
 const seed=mode==='daily'?`daily:${key}:${BANK_VERSION}`:`practice:${nonce}:${BANK_VERSION}`;
 return {version:BANK_VERSION,mode,key,ids:(mode==='daily'?dailyQuestions(key):roundQuestions(seed)).map(q=>q.id),results:[],index:0,timingMode:'timed'};
}
export function restoreRound(value){
 if(!value||!SUPPORTED_BANKS.includes(value.version)||!['daily','practice'].includes(value.mode)||!/^\d{4}-\d{2}-\d{2}$/.test(value.key)||!Array.isArray(value.ids)||value.ids.length!==7||new Set(value.ids).size!==7||!value.ids.every(id=>QUESTIONS.slice(0,value.version===BANK_VERSION?QUESTIONS.length:value.version===PREVIOUS_BANK_VERSION?210:14).some(q=>q.id===id))||!Array.isArray(value.results)||value.results.length>7)return null;
 try{if(value.mode==='daily'&&JSON.stringify(value.ids)!==JSON.stringify(expectedDaily(value.key,value.version).map(q=>q.id)))return null;}catch{return null;}
 const results=[];for(let i=0;i<value.results.length;i++){
  const r=value.results[i],q=QUESTIONS.find(q=>q.id===value.ids[i]);
  if(!r||typeof r.skipped!=='boolean'||r.timedOut===true&&!r.skipped)return null;
  const answer=r.skipped?null:q.answers.find(a=>a.name===r.answer);if(!r.skipped&&!answer)return null;
  results.push({skipped:r.skipped,answer:answer?.name||null,points:answer?.points||0,...(r.corrected===true?{corrected:true}:{}),...(r.timedOut===true?{timedOut:true}:{})});
 }
 // Ignore supplied totals and scores. The reviewed content is authoritative.
 const index=Number.isInteger(value.index)&&value.index>=0&&value.index<=7?value.index:0;
 if(!(index===results.length||index===results.length-1))return null;
 return {version:value.version,mode:value.mode,key:value.key,ids:[...value.ids],results,index,...(value.timingMode?{timingMode:value.timingMode==='timed'?'timed':'untimed'}:{}),...(value.clock&&value.clock.slot===index&&Number.isFinite(value.clock.remainingMs)&&value.clock.remainingMs>=0&&value.clock.remainingMs<=45000?{clock:{slot:index,remainingMs:Math.min(QUESTION_MS,value.clock.remainingMs)}}:{}),...(typeof value.destinationId==='string'?{destinationId:value.destinationId.slice(0,50)}:{}),...(typeof value.analyticsRoundId==='string'&&/^[a-f0-9-]{36}$/i.test(value.analyticsRoundId)?{analyticsRoundId:value.analyticsRoundId}:{}),...(value.celebrated===true?{celebrated:true}:{})};
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
export const arrivalBonus=round=>round.version===BANK_VERSION&&round.results.length===7?arrivalForPoints(totalFor(round)).bonus:0;
export const maxFor=round=>round.version===BANK_VERSION?1000:850;
export const journeyTotal=round=>totalFor(round)+completionBonus(round)+arrivalBonus(round);
