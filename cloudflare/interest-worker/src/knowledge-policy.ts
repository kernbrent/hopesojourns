import {currentPortal,type MmtIdentity} from './mmt-permissions';
export const knowledgeRights=['view_queue','edit_answers','approve_reuse','publish_faq','manage_sources','view_analytics'] as const;
export type KnowledgeRight=typeof knowledgeRights[number];
export function knowledgeCan(user:MmtIdentity,right:KnowledgeRight){
 if(currentPortal()!=='hs')return false;
 if(user.is_admin)return true;
 try{const p=JSON.parse(user.permissions_json);return p['knowledge.'+right]==='edit'||right==='view_queue'&&p['knowledge.'+right]==='read'||right==='view_analytics'&&p['knowledge.'+right]==='read';}catch{return false;}
}
export const topicSeeds=[
 ['matching','Finding an internship','internship intern placement apply application fit skills major'],
 ['weekly-life','A typical week','week weekly day daily routine schedule duties work'],
 ['language','Language','greek english language speak speaking translation'],
 ['bedding','Beds and bedding','bed beds bedding mattress mattresses comfortable comfort sleep'],
 ['housing','Housing','housing accommodation room rooms flat apartment staying'],
 ['costs','Costs and giving','cost costs price prices fee fees donation giving budget funding money'],
 ['credit','College credit','college university credit academic accreditation'],
 ['availability','Dates and availability','dates available availability timing duration when'],
 ['safety','Safety and emergencies','safe safety emergency emergencies insurance security'],
 ['supervision','Support and supervision','support supervision supervisor mentor preparation prepare orientation'],
 ['ministry','Ministry and service','ministry ministries outreach homeless refugees service serve'],
 ['other','Other questions','']
] as const;
export function words(value:string){return value.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)?.filter(w=>!['is','do','did','does','me','it','to','of','an','my','be','on','at','so','or','if','as','am','us','we','a','the','and','for','with','this','that','are','would','could','what','how','does','you','your','can','about','have','there','from','will','they','them','was','were','tell','please','know'].includes(w)).slice(0,30)||[];}
export function topicFor(question:string,topics:{id:string;label:string;aliases:string}[]){
 const tokens=words(question);let best='other',score=0;
 for(const t of topics){const n=tokens.filter(w=>words(t.label+' '+t.aliases).includes(w)).length;if(n>score){score=n;best=t.id;}}return best;
}
export function safeKnowledgeUrl(value:string){
 if(!value.startsWith('/')||value.startsWith('//')||/[\\\r\n]/.test(value))return false;
 const u=new URL(value,'https://hopesojourns.com');
 let path;try{path=decodeURIComponent(u.pathname);}catch{return false;}
 return !/^\/(admin|journey|trip-account|api\/interest\/(admin|portal|private-account))\b/i.test(path)&&!['token','password','email','contact','message'].some(k=>u.searchParams.has(k));
}
export function privacyProblem(value:string){return /[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[\d ().-]{7,}\d)/i.test(value);}
export function knowledgePassage(source:{body:string;segments_json:string},question:string){
 const terms=words(question),segments=JSON.parse(source.segments_json) as {start:number;end:number;text:string}[];
 if(segments.length){const ranked=segments.map(s=>({...s,score:terms.filter(w=>s.text.toLowerCase().includes(w)).length})).sort((a,b)=>b.score-a.score||a.start-b.start);
  const selected=ranked[0];return {text:selected.text.slice(0,1200),start:selected.start,end:selected.end,segments:ranked.slice(0,8).sort((a,b)=>a.start-b.start).map(({score,...s})=>s)};
 }
 const lower=source.body.toLowerCase(),positions=terms.map(w=>lower.indexOf(w)).filter(i=>i>=0),position=positions.length?Math.min(...positions):0,start=Math.max(0,position-180),end=Math.min(source.body.length,start+1200);
 return {text:(start?'…':'')+source.body.slice(start,end)+(end<source.body.length?'…':''),segments:[]};
}
export type Evidence={id:string;revision:number;start?:number;end?:number};
export function parseEvidence(value:unknown):Evidence[]{
 if(!Array.isArray(value)||value.length>12)return [];
 return value.filter((v:any)=>v&&typeof v.id==='string'&&Number.isInteger(v.revision)&&v.revision>0&&
 (v.start===undefined||Number.isFinite(v.start)&&v.start>=0)&&(v.end===undefined||Number.isFinite(v.end)&&v.end>=Number(v.start||0))) as Evidence[];
}
