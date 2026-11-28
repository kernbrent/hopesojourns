import {resolveAnswer} from './engine.js';
import {validReceipt} from './open-ended.js';
// Draft scores never enter final results or analytics until the player banks them.
export function restoreDiscovery(q,value,slot){
 if(!value||value.slot!==slot||!['deciding','digging'].includes(value.phase))return null;
 let latest=null;
 if(value.latest){const r=value.latest,receipt=validReceipt(q,r.receipt)&&r.receipt.name===r.answer?r.receipt:null,a=receipt||q.answers.find(a=>a.name===r.answer);if(a)latest={skipped:false,answer:a.name,points:a.points,...(receipt?{receipt}:{}),...(r.corrected===true?{corrected:true}:{})};}
 return {slot,phase:value.phase==='deciding'&&latest?'deciding':'digging',latest};
}
export function setDiscovery(round,q,input,{receipt,confirmed=false}={}){
 const resolved=receipt?{answer:receipt,corrected:false}:resolveAnswer(q,input),a=resolved.answer;
 round.discovery={slot:round.index,phase:a?'deciding':'digging',latest:a?{skipped:false,answer:a.name,points:a.points,...(receipt?{receipt}:{}),...(resolved.corrected||confirmed?{corrected:true}:{})}:null};
 return round.discovery;
}
export function digDeeper(round){if(round.clock)round.clock.typing=false;round.discovery={slot:round.index,phase:'digging',latest:null};}
export function bankDiscovery(round,{timedOut=false}={}){
 if(round.results[round.index]||round.index>=7)return null;
 const latest=round.discovery?.slot===round.index?round.discovery.latest:null;
 const result=latest||{skipped:true,answer:null,points:0,...(timedOut?{timedOut:true}:{})};round.results.push(result);delete round.discovery;return result;
}
