export const QUESTION_MS=25000;
export const remainingAfter=(remaining,elapsed,paused=false)=>Math.max(0,Math.min(QUESTION_MS,remaining-(paused?0:Math.max(0,elapsed))));
export function startQuestionTimer({round,paused,onTick,onExpire,save,now=()=>performance.now()}){
 if(round.index>=7||round.results[round.index])return {stop(){}};
 if(round.clock?.slot!==round.index)round.clock={slot:round.index,remainingMs:QUESTION_MS};
 let last=now(),saved=last,wasPaused=paused(),ended=false,interval;
 const tick=(expire=true)=>{const at=now(),isPaused=paused();round.clock.remainingMs=remainingAfter(round.clock.remainingMs,at-last,wasPaused);last=at;wasPaused=isPaused;onTick(Math.ceil(round.clock.remainingMs/1000),isPaused);if(at-saved>=1000){saved=at;save();}if(expire&&!isPaused&&round.clock.remainingMs===0&&!ended){ended=true;clearInterval(interval);save();onExpire();}};
 interval=setInterval(tick,100);onTick(Math.ceil(round.clock.remainingMs/1000),wasPaused);
 const dialogs=new MutationObserver(()=>tick());dialogs.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
 const visibility=()=>tick();document.addEventListener('visibilitychange',visibility);
 return {stop(){clearInterval(interval);dialogs.disconnect();document.removeEventListener('visibilitychange',visibility);if(!ended)tick(false);save();}};
}
