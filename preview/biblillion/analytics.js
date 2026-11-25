import {QUESTIONS} from './content.js';
export const CONSENT_VERSION='2026-11-25';
// Deliberately excludes names, emails, reflections, arbitrary guesses and browser IDs.
export function resultEvent(round,result){
 return {id:crypto.randomUUID(),roundId:round.analyticsRoundId,bankVersion:round.version,roundDay:round.key,mode:round.mode,destinationId:round.destinationId,slot:round.index,questionId:round.ids[round.index],answer:result.answer,skipped:result.skipped,corrected:result.corrected===true,timedOut:result.timedOut===true,consent:true,consentVersion:CONSENT_VERSION};
}
export function reporter(store,save,onStatus=()=>{}){
 const keys=['id','roundId','bankVersion','roundDay','mode','destinationId','slot','questionId','answer','skipped','corrected','timedOut','consent','consentVersion'];
 let sending=false;store.pendingEvents=Array.isArray(store.pendingEvents)?store.pendingEvents.filter(e=>e&&Object.keys(e).every(k=>keys.includes(k))&&e.consent===true&&e.consentVersion===CONSENT_VERSION&&QUESTIONS.some(q=>q.id===e.questionId&&(e.skipped?e.answer===null:q.answers.some(a=>a.name===e.answer)))).slice(0,100):[];
 async function flush(){
  if(sending||!store.shareResults||!store.pendingEvents.length)return;sending=true;
  try{while(store.shareResults&&store.pendingEvents.length){const response=await fetch('/api/interest/public/biblillion/results',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(store.pendingEvents[0]),credentials:'omit',redirect:'error'});
    if(!response.ok){if([400,403,404,409,413,422].includes(response.status)){store.pendingEvents.shift();save();onStatus('Some results could not be shared. Your local progress is safe.');continue;}throw Error('retry');}
    store.pendingEvents.shift();save();onStatus('Anonymous results shared.');
  }}catch{onStatus('Sharing is waiting for a connection. Your local progress is safe.');}finally{sending=false;}
 }
 return {flush,record(round,result){if(!store.shareResults)return;store.pendingEvents.push(resultEvent(round,result));store.pendingEvents=store.pendingEvents.slice(-100);save();void flush();},setConsent(value){store.shareResults=value===true;if(!store.shareResults)store.pendingEvents=[];save();if(store.shareResults)void flush();}};
}
