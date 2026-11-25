export const KEY = 'hs-one-step-beyond-v1';
export const COOKIE = 'hs_mission_progress';
export const COOKIE_PATH = '/mission-journey/';
export const MAX_AGE = 180 * 24 * 60 * 60;
export const fresh = () => ({v:1,updated:Date.now(),view:'game',chapter:0,mood:'',encounter:'',response:'',concern:'',completed:false,day:0,days:Array(7).fill(false),notes:Array(7).fill('')});
const options = {mood:['busy','comfortable','disconnected','searching','ready'],encounter:['ask','project','observe'],response:['listen','fix','help'],concern:['time','cost','skills','unfamiliar','uncertain']};
export function normalize(raw, now=Date.now()) {
  if (!raw || raw.v!==1 || !Number.isFinite(raw.updated) || raw.updated>now+60000 || now-raw.updated>MAX_AGE*1000) return fresh();
  const state=fresh(); state.updated=raw.updated;
  state.view=['game','prepare','email'].includes(raw.view)?raw.view:'game';
  for(const key of Object.keys(options)) state[key]=options[key].includes(raw[key])?raw[key]:'';
  const available = !state.mood?1:!state.encounter?2:!state.response?3:!state.concern?4:5;
  state.chapter=Number.isInteger(raw.chapter)?Math.min(Math.max(0,raw.chapter),available):0;
  state.completed=raw.completed===true && !!state.mood && !!state.encounter && !!state.response && !!state.concern;
  state.day=Number.isInteger(raw.day)?Math.min(6,Math.max(0,raw.day)):0;
  state.days=Array.from({length:7},(_,i)=>raw.days?.[i]===true);
  state.notes=Array.from({length:7},(_,i)=>typeof raw.notes?.[i]==='string'?raw.notes[i].slice(0,1500):'');
  return state;
}
export function checkpoint(state) {
  const {notes,...small}=state; return small;
}
export function restore(storage, cookie, now=Date.now()) {
  const candidates=[];
  try { candidates.push(JSON.parse(storage.getItem(KEY))); } catch {}
  try { const value=cookie.split('; ').find(x=>x.startsWith(COOKIE+'=')); if(value)candidates.push(JSON.parse(decodeURIComponent(value.slice(COOKIE.length+1)))); } catch {}
  const valid=candidates.filter(x=>x?.v===1 && Number.isFinite(x.updated) && x.updated<=now+60000 && now-x.updated<=MAX_AGE*1000).sort((a,b)=>b.updated-a.updated);
  return valid.length?normalize(valid[0],now):fresh();
}
export function profilePayload(form) {
  if(!form.shareProfile) return null;
  const clean=value=>String(value||'').trim();
  return {source:'mission-journey',email:clean(form.email),name:clean(form.name),city:clean(form.city),church:clean(form.church),interest:clean(form.interest),contact_permission:form.contact===true,profile_consent:true};
}
