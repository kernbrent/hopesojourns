import {HISTORY_SELECTION} from './engine.js';
import {canJudge,safeAnswer} from './open-ended.js';
import {QUESTIONS} from './content.js';
export const REPORTING_VERSION='2026-11-25.auto1';
const LEGACY_CONSENT_VERSION='2026-11-25';
// Canonical/scoring-receipt answers and random round/event IDs; no player identity.
export function resultEvent(round,result){
 round.analyticsRoundId||=crypto.randomUUID();
 return {id:crypto.randomUUID(),roundId:round.analyticsRoundId,bankVersion:round.version,roundDay:round.key,mode:round.mode,destinationId:round.destinationId,slot:round.index,questionId:round.ids[round.index],answer:result.answer,skipped:result.skipped,corrected:result.corrected===true,timedOut:result.timedOut===true,reportingVersion:REPORTING_VERSION,...(round.selection===HISTORY_SELECTION?{selection:HISTORY_SELECTION}:{}),...(result.receipt?{judgmentId:result.receipt.id}:{})};
}
export function reporter(store,save,onStatus=()=>{}){
 store.cloudTokens=Object.fromEntries(Object.entries(store.cloudTokens&&typeof store.cloudTokens==='object'&&!Array.isArray(store.cloudTokens)?store.cloudTokens:{}).filter(([q,key])=>QUESTIONS.some(x=>x.id===q)&&typeof key==='string'&&/^[a-f\d-]{36}$/i.test(key)));
 const keys=['id','roundId','bankVersion','roundDay','mode','destinationId','slot','questionId','answer','skipped','corrected','timedOut','reportingVersion','consent','consentVersion','judgmentId','selection','cloudToken'];
 const valid=e=>e&&(e.cloudToken===undefined||typeof e.cloudToken==='string'&&/^[a-f\d-]{36}$/i.test(e.cloudToken))&&Object.keys(e).every(k=>keys.includes(k))&&(e.selection===undefined||e.selection===HISTORY_SELECTION)&&(e.reportingVersion===REPORTING_VERSION&&!('consent'in e)&&!('consentVersion'in e)||!('reportingVersion'in e)&&e.consent===true&&e.consentVersion===LEGACY_CONSENT_VERSION)&&QUESTIONS.some(q=>q.id===e.questionId&&(e.skipped?e.answer===null:(q.answers.some(a=>a.name===e.answer)||canJudge(q)&&safeAnswer(e.answer)&&typeof e.judgmentId==='string'&&/^[a-f\d-]{36}$/i.test(e.judgmentId))));
 store.pendingEvents=Array.isArray(store.pendingEvents)?store.pendingEvents.filter(valid).slice(-100):[];
 let running=null;
 async function flush(){
  if(running||!store.pendingEvents.length)return;const controller=new AbortController();running=controller;
  try{while(running===controller&&store.pendingEvents.length){const event=store.pendingEvents[0],response=await fetch('/api/interest/public/biblillion/results',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(event),credentials:'omit',redirect:'error',keepalive:true,signal:controller.signal});
    if(running!==controller)return;
    if(!response.ok){if([400,403,404,409,413,422].includes(response.status)){store.pendingEvents.shift();save();onStatus('Some anonymous stats could not be recorded. Your saved game is safe.');continue;}throw Error('retry');}
    store.pendingEvents.shift();save();onStatus('Anonymous game stats recorded.');
  }}catch{if(running===controller)onStatus('Stats will retry when a connection is available. Your saved game is safe.');}finally{if(running===controller)running=null;}
 }
 return {flush,record(round,result){const event=resultEvent(round,result);if(!result.skipped&&!result.receipt){store.cloudTokens||={};const key=event.questionId;store.cloudTokens[key]||=crypto.randomUUID();event.cloudToken=store.cloudTokens[key];}if(!valid(event))return;store.pendingEvents.push(event);store.pendingEvents=store.pendingEvents.slice(-100);save();void flush();},clearPending(){running?.abort();running=null;store.pendingEvents=[];save();}};
}
