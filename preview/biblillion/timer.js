export const QUESTION_MS=25000;
export const remainingAfter=(remaining,elapsed,paused=false)=>Math.max(0,Math.min(QUESTION_MS,remaining-(paused?0:Math.max(0,elapsed))));
export function answerBonus(clock,value){
 const key=String(value).normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');clock.attempts||=[];
 if(clock.cushionUsed||key.replace(/\s/g,'').length<=4||clock.attempts.includes(key)||clock.remainingMs<=0)return false;
 clock.attempts.push(key);clock.attempts=clock.attempts.slice(-50);const before=clock.remainingMs;
 if(before<15000)clock.remainingMs=Math.min(15000,before+5000);return clock.remainingMs>before;
}
export function startQuestionTimer({round,paused,onTick,onExpire,save,now=()=>performance.now()}){
 if(round.index>=7||round.results[round.index])return {stop(){},typing(){},submitted(){return null;}};
 if(round.clock?.slot!==round.index)round.clock={slot:round.index,remainingMs:QUESTION_MS};
 const clock=round.clock;let last=now(),saved=last,wasPaused=paused(),ended=false,interval;
 const tick=(expire=true)=>{const at=now(),isPaused=paused(),elapsed=wasPaused?0:Math.max(0,at-last),before=clock.remainingMs;clock.remainingMs=remainingAfter(before,elapsed);last=at;wasPaused=isPaused;
  if(expire&&!isPaused&&!ended&&clock.remainingMs===0&&clock.typing&&!clock.cushionUsed){clock.cushionUsed=true;clock.remainingMs=Math.max(0,3000-Math.max(0,elapsed-before));save();}
  onTick(Math.ceil(clock.remainingMs/1000),isPaused,clock.cushionUsed===true);if(at-saved>=1000){saved=at;save();}
  if(expire&&!isPaused&&clock.remainingMs===0&&!ended){ended=true;clearInterval(interval);save();onExpire();}
 };
 interval=setInterval(tick,100);onTick(Math.ceil(clock.remainingMs/1000),wasPaused,clock.cushionUsed===true);
 const dialogs=new MutationObserver(()=>tick());dialogs.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
 const visibility=()=>tick();document.addEventListener('visibilitychange',visibility);
 return {typing(value){tick();if(!ended){clock.typing=!!String(value).trim();save();}},submitted(value){tick();if(ended)return null;const added=answerBonus(clock,value);save();onTick(Math.ceil(clock.remainingMs/1000),wasPaused,clock.cushionUsed===true);return added;},stop(){clearInterval(interval);dialogs.disconnect();document.removeEventListener('visibilitychange',visibility);if(!ended)tick(false);save();}};
}
