/* Preview-only domain model. Client permissions demonstrate workflow, not authentication.
   No API calls, secret keys, private MMT records, or automatic publication. */
export const actions=['view_queue','edit_answers','approve_reuse','publish_faq','manage_sources','view_analytics'];
export const roles={visitor:[],reader:['view_queue','view_analytics'],editor:['view_queue','edit_answers'],reviewer:actions};
export const missing='I don’t have reliable information on that yet. If you leave your contact details, Brent can follow up with you.';
const topics=[
 ['image',/\b(photo|photograph|picture|image)\b/],
 ['bedding',/\b(bed|beds|bedding|mattress|mattresses)\b/],
 ['language',/\b(greek|language|languages|speak|translator|translation)\b/],
 ['costs',/\b(cost|costs|price|prices|fee|fees|budget|expensive)\b/],
 ['housing',/\b(housing|accommodation|accommodations|stay|room|rooms)\b/],
 ['credit',/\b(credit|credits|university|college|academic)\b/],
 ['availability',/\b(available|availability|openings|dates|when|booking)\b/],
 ['eligibility',/\b(eligible|eligibility|qualify|age|requirements|visa)\b/],
 ['safety',/\b(safety|safe|emergency|emergencies|risk)\b/],
 ['weekly-life',/\b(week|weekly|typical|schedule|daily|day)\b/],
 ['supervision',/\b(supervision|supervisor|support|check-in|checkins|check in|mentor|mentoring)\b/],
 ['matching',/\b(match|matching|fit|skills|major|interests|prepare|preparation|internship|internships)\b/],
 ['ministry',/\b(ministry|ministries|serve|serving|work|outreach|do)\b/]
];
export const uid=()=>globalThis.crypto.randomUUID();
export function initialState(sources){return {version:1,sources:structuredClone(sources),records:[],faqs:[],audit:[],visitor:uid(),context:{page:'Internships',destination:'',ministry:'',videoId:''},lastTopic:'',startedAt:Date.now()};}
function requirePermission(role,action){if(!roles[role]?.includes(action))throw Error('This demonstration role cannot perform that action.');}
function audit(s,action,id,details=''){s.audit.push({at:Date.now(),action,id,details});}
export function active(source){return source?.visibility==='public'&&source.status==='approved'&&!source.withdrawn;}
export function validEvidence(s,evidence){return evidence.length>0&&evidence.every(e=>s.sources.some(x=>x.id===e.id&&x.revision===e.revision&&active(x)&&(!x.demo||s.demoMode)&&x.kind!=='faq'));}
export function classify(question,context={},last=''){
 const text=question.toLowerCase();
 const hit=topics.find(([,pattern])=>pattern.test(text));
 if(hit)return hit[0];
 if(/\b(it|that|this|they|them|more)\b/.test(text)&&last)return last;
 return 'other';
}
export function resolveContext(question,context){
 const q=question.toLowerCase();
 // Explicit destinations/ministry names override the page/video hint.
 const destination=/\b(england|halifax|leeds|nelson)\b/.test(q)?'England':/\b(athens|greece|greek)\b/.test(q)?'Athens':context.destination;
 const named=[['new start','New Start Ministries'],['new life','New Life'],['porta','Porta'],['refugee refuge','Refugee Refuge'],['light group','The Light Group']].find(([text])=>q.includes(text));
 return {...context,destination,ministry:named?named[1]:destination!==context.destination?'':context.ministry,videoId:named&&named[1]!==context.ministry?'':context.videoId};
}
export function ask(s,question,now=Date.now()){
 question=String(question).trim();if(!question||question.length>600)throw Error('Please enter a question of 1–600 characters.');
 if(s.records.length>=50||s.records.filter(x=>x.at>now-60000).length>=20)throw Error('Preview question limit reached. Wait a minute, or reset the demo after 50 questions.');
 const followUp=/\b(it|that|there|they|them|more)\b/i.test(question);
 const context=resolveContext(question,followUp?(s.lastContext||s.context):s.context),topic=classify(question,context,s.lastTopic);
 let sources=s.sources.filter(x=>active(x)&&(!x.demo||s.demoMode)&&x.topics.includes(topic)&&(!x.destination||x.destination===context.destination)&&(!x.ministry||x.ministry===context.ministry)&&(!context.sourceId||topic!=='image'||x.id===context.sourceId));
 sources.sort((a,b)=>(Number(b.id===context.videoId)*4+Number(!!b.ministry)*2)-(Number(a.id===context.videoId)*4+Number(!!a.ministry)*2));
 const aboutVideo=context.videoId&&/\b(video|interview|speaker|she|he|say|said|explain|explained)\b/i.test(question);
 if(aboutVideo)sources=sources.filter(x=>x.id===context.videoId||x.demo);
 const reused=!aboutVideo&&s.faqs.find(f=>f.topic===topic&&f.reuse&&validEvidence(s,f.evidence)&&(!f.destination||f.destination===context.destination)&&(!f.ministry||f.ministry===context.ministry));
 const source=sources[0];
 const evidence=reused?structuredClone(reused.evidence):source?[{id:source.id,revision:source.revision}]:[];
 const answer=reused?reused.answer:source?source.text:missing;
 const record={id:uid(),at:now,visitor:s.visitor,question,answer,evidence,topic,context,demo:!!(reused?.demo||source?.demo),feedback:null,comment:'',status:evidence.length?'not_reviewed':'follow_up',proposedQuestion:'',proposedAnswer:'',reviewEvidence:structuredClone(evidence)};
 s.records.push(record);s.lastTopic=topic;s.lastContext=context;return record;
}
export function feedback(s,id,value,comment=''){
 const r=s.records.find(x=>x.id===id);if(!r||!['yes','no'].includes(value))throw Error('Choose a valid answer and rating.');
 r.feedback=value;r.comment=String(comment).slice(0,600);
 if(value==='yes'&&r.status==='not_reviewed')r.status='pending';
 if(value==='no'&&r.status==='not_reviewed')r.status='follow_up';
 audit(s,'feedback',id,value);
}
export function privacyIssue(text){return /\b[^\s@]+@[^\s@]+\.[^\s@]+\b|\b(?:\+?\d[\d ()-]{6,}\d)\b/.test(text);}
export function saveProposal(s,id,input,role){
 requirePermission(role,'edit_answers');const r=s.records.find(x=>x.id===id);if(!r)throw Error('Question not found.');
 const question=String(input.question).trim(),answer=String(input.answer).trim();
 if(!question||!answer||question.length>300||answer.length>1800)throw Error('Complete a generalized question (300 characters) and answer (1,800 characters).');
 if(privacyIssue(question+' '+answer))throw Error('Remove contact details before preparing an FAQ. Review other personal information manually too.');
 const selected=s.sources.filter(x=>input.sourceIds.includes(x.id)&&active(x)&&(!x.demo||s.demoMode)&&x.kind!=='faq').map(x=>({id:x.id,revision:x.revision}));
 if(!validEvidence(s,selected))throw Error('Select current, approved public evidence. AI answers cannot be their own evidence.');
 r.proposedQuestion=question;r.proposedAnswer=answer;r.reviewEvidence=selected;r.status='pending';
 s.faqs=s.faqs.filter(x=>x.recordId!==id);audit(s,'proposal_edited',id);
}
export function approve(s,id,role,verified){
 requirePermission(role,'approve_reuse');const r=s.records.find(x=>x.id===id);
 if(!verified||!r?.proposedQuestion||!r.proposedAnswer||!validEvidence(s,r.reviewEvidence))throw Error('Save a proposal and verify its evidence and privacy before approving.');
 let faq=s.faqs.find(f=>f.recordId===id);
 if(!faq){faq={id:uid(),recordId:id,topic:r.topic,question:r.proposedQuestion,answer:r.proposedAnswer,evidence:structuredClone(r.reviewEvidence),destination:r.context.destination,ministry:r.context.ministry,demo:r.reviewEvidence.some(e=>s.sources.find(x=>x.id===e.id)?.demo),reuse:false,published:false,pinned:false,at:Date.now()};s.faqs.push(faq);}
 faq.reuse=true;r.status='approved';audit(s,'reuse_approved',id);return faq;
}
export function publish(s,id,role,verified){
 requirePermission(role,'publish_faq');const f=s.faqs.find(x=>x.id===id);
 if(!verified||!f?.reuse||!validEvidence(s,f.evidence))throw Error('Approve reuse, check privacy, and confirm current evidence before publishing.');
 f.published=true;audit(s,'faq_published',id);
}
export function setFaq(s,id,action,role){
 requirePermission(role,action==='withdraw'?'approve_reuse':'publish_faq');const f=s.faqs.find(x=>x.id===id);if(!f)throw Error('FAQ not found.');
 if(action==='pin')f.pinned=!f.pinned;
 if(action==='unpublish')f.published=false;
 if(action==='withdraw'){f.published=false;f.reuse=false;}
 audit(s,'faq_'+action,id);
}
export function decide(s,id,status,role){requirePermission(role,'edit_answers');if(!['rejected','follow_up'].includes(status))throw Error('Invalid review decision.');const r=s.records.find(x=>x.id===id);if(!r)throw Error('Question not found.');r.status=status;s.faqs=s.faqs.filter(x=>x.recordId!==id);audit(s,status,id);}
export function updateSource(s,id,patch,role){
 requirePermission(role,'manage_sources');const x=s.sources.find(x=>x.id===id);if(!x)throw Error('Source not found.');
 if(patch.text!==undefined){const text=String(patch.text).trim();if(!text||text.length>4000)throw Error('Source text must contain 1–4,000 characters.');x.text=text;}
 if(patch.withdrawn!==undefined)x.withdrawn=!!patch.withdrawn;
 x.revision++;x.updatedAt=new Date().toISOString();
 s.faqs.forEach(f=>{if(f.evidence.some(e=>e.id===id)){f.reuse=false;f.published=false;}});
 s.records.forEach(r=>{if(r.reviewEvidence.some(e=>e.id===id))r.status='needs_evidence';});
 audit(s,'source_updated',id,'Dependent FAQ approvals revoked');
}
export function retopic(s,id,topic,role){
 requirePermission(role,'edit_answers');if(!/^[a-z0-9-]{2,50}$/.test(topic))throw Error('Use a topic name with 2–50 lowercase letters, numbers, or hyphens.');
 const r=s.records.find(x=>x.id===id);if(!r)throw Error('Question not found.');const before=r.topic;r.topic=topic;
 s.faqs.filter(f=>f.recordId===id).forEach(f=>{f.topic=topic;});audit(s,'topic_corrected',id,before+' → '+topic);
}
export function mergeTopics(s,from,to,role){requirePermission(role,'edit_answers');if(from===to||!s.records.some(x=>x.topic===to))throw Error('Choose two different existing topics.');s.records.filter(x=>x.topic===from).forEach(x=>{x.topic=to;});s.faqs.filter(x=>x.topic===from).forEach(x=>{x.topic=to;});audit(s,'topics_merged',from,to);}
export function stats(s,window='all',now=Date.now()){
 const rows=[...s.records,...(s.demoMode?s.sampleRecords||[]:[])].filter(x=>window==='all'||x.at>=now-30*86400000),groups=new Map();
 rows.forEach(x=>{if(!groups.has(x.topic))groups.set(x.topic,{topic:x.topic,total:0,visitors:new Set(),recent:0});const g=groups.get(x.topic);g.total++;g.visitors.add(x.visitor);if(x.at>=now-7*86400000)g.recent++;});
 return [...groups.values()].map(g=>({...g,visitors:g.visitors.size})).sort((a,b)=>b.visitors-a.visitors||b.total-a.total||a.topic.localeCompare(b.topic));
}
export function publicFaqs(s,query='',window='all'){
 const metrics=stats(s,window);const words=query.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
 const queryTopic=classify(query);
 return s.faqs.filter(f=>f.published&&f.reuse&&validEvidence(s,f.evidence)).map(f=>{
 const text=(f.question+' '+f.answer+' '+f.topic).toLowerCase(),score=words.reduce((n,w)=>n+Number(text.includes(w)),0)+(queryTopic===f.topic&&queryTopic!=='other'?5:0),g=metrics.find(g=>g.topic===f.topic);
 return {...f,visitors:g?.visitors||0,total:g?.total||0,score};
 }).filter(f=>!words.length||f.score>0).sort((a,b)=>(words.length?b.score-a.score:0)||Number(b.pinned)-Number(a.pinned)||b.visitors-a.visitors||b.total-a.total||a.question.localeCompare(b.question));
}
