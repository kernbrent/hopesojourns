import * as K from './engine.mjs';
import {addSamples} from './samples.mjs';
const $=s=>document.querySelector(s),key='hs-knowledge-preview-v2';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,fn)=>{const b=el('button',text);b.type='button';b.addEventListener('click',()=>run(fn));return b;};
const link=(text,url)=>{const a=el('a',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
let state,role='reviewer',catalog;
const permitted=action=>K.roles[role]?.includes(action);
function save(){try{sessionStorage.setItem(key,JSON.stringify(state));}catch{$('#ask-status').textContent='Storage is unavailable. This demo works in memory until the page reloads.';}}
function run(fn){try{fn();save();render();}catch(e){$('#review-status').textContent=e.message;$('#ask-status').textContent=e.message;}}
function currentEvidence(refs){return refs.map(r=>state.sources.find(x=>x.id===r.id&&x.revision===r.revision&&K.active(x))).filter(Boolean);}
function evidence(container,refs){
 const box=el('div',undefined,'evidence');
 if(!K.validEvidence(state,refs)){box.append(el('p','No current approved evidence. Ask Hope Sojourns for follow-up.'));}
 else currentEvidence(refs).forEach(s=>{box.append(link(s.title+' ↗',s.url),el('p',s.origin+' · '+s.kind+' · reviewed '+s.reviewedAt+' · revision '+s.revision));});
 container.append(box);
}
function contextLabel(){const c=state.context;$('#context-label').textContent=['Internships',c.destination,c.ministry,(c.videoId||c.sourceId)?state.sources.find(x=>x.id===(c.videoId||c.sourceId))?.title:''].filter(Boolean).join(' / ');}
function chooseContext(source){state.context={page:'Internships',destination:source?.destination||'',ministry:source?.ministry||'',videoId:source?.kind==='video'?source.id:'',sourceId:source?.kind!=='video'?source?.id||'':''};state.lastContext=null;state.lastTopic='';save();contextLabel();$('#ask-panel').scrollIntoView({behavior:'smooth',block:'start'});$('#question').focus({preventScroll:true});}
function renderConversation(){
 const root=$('#conversation');root.replaceChildren();
 state.records.filter(r=>r.visitor===state.visitor).forEach(r=>{
 const row=el('article',undefined,'exchange');row.append(el('p',r.question,'question'));
 if(r.demo)row.append(el('p','SAMPLE ANSWER · Fictional preview content, not verified ministry information.','status-note'));
 const valid=K.validEvidence(state,r.evidence);
 row.append(el('p',valid?r.answer:r.demo&&!state.demoMode?'This fictional answer is hidden while sample mode is off. Ask again to check the reviewed website content.':r.evidence.length?'This answer’s source changed or was withdrawn. Ask again for current information.':K.missing,'response'));
 row.append(el('p','Context: '+[r.context.destination||'General internships',r.context.ministry].filter(Boolean).join(' · '),'fine'));evidence(row,r.evidence);
 if(!valid){row.append(link('Leave contact details for Brent ↗','https://hopesojourns.com/interest/?type=trip'),el('p','Opens the existing journey-interest form on the main site. Include your question in its message field. Nothing has been sent yet, and a reply time is not guaranteed.','fine'));}
 const controls=el('div',undefined,'feedback-actions');
 for(const [value,title] of [['yes','Yes, this was helpful'],['no','Not helpful']]){const b=button(title,()=>K.feedback(state,r.id,value,r.comment));b.setAttribute('aria-pressed',String(r.feedback===value));controls.append(b);}
 row.append(controls);const details=el('details'),summary=el('summary','Add an optional feedback comment');details.append(summary);const text=el('textarea');text.maxLength=600;text.value=r.comment;text.setAttribute('aria-label','Feedback comment for '+r.question);details.append(text,button('Save feedback comment',()=>{if(!r.feedback)throw Error('Choose helpful or not helpful first.');K.feedback(state,r.id,r.feedback,text.value);}));row.append(details);
 root.append(row);
 });
}
function renderFaq(){const root=$('#faq-list');root.replaceChildren();const faqs=K.publicFaqs(state,$('#faq-search').value,$('#faq-window').value);if(!faqs.length)root.append(el('p','No matching published FAQ yet. Try asking a question, then use the review demo below to prepare, approve, and publish it.','status-note'));
 faqs.forEach(f=>{const row=el('article',undefined,'faq-card');row.append(el('p',(f.demo?'Fictional sample · ':'')+(f.pinned?'Essential information · pinned':'Preview FAQ'),'badge'),el('h3',f.question),el('p',f.answer));evidence(row,f.evidence);row.append(el('p',f.visitors+' distinct demo visitors · '+f.total+' questions · topic: '+f.topic,'fine'));root.append(row);});}
function renderAnalytics(){const root=$('#analytics');root.replaceChildren();if(!permitted('view_analytics')){root.append(el('p','Analytics hidden for this demonstration role.'));return;}
 const rated=state.records.filter(r=>r.feedback),positive=rated.filter(r=>r.feedback==='yes').length;
 const metrics=el('div',undefined,'metrics');for(const [n,title] of [[state.records.length,'Questions in this tab'],[new Set(state.records.map(r=>r.visitor)).size,'Demo visitors'],[rated.length?Math.round(100*positive/rated.length)+'%':'—','Helpful ratings'],[state.records.filter(r=>['pending','follow_up','needs_evidence'].includes(r.status)).length,'Awaiting attention']]){const m=el('div',undefined,'metric');m.append(el('strong',String(n)),el('span',title));metrics.append(m);}root.append(metrics,el('h3','Popular topics and content gaps'));
 K.stats(state).forEach(g=>{const row=el('div',undefined,'trend-row');row.append(el('span',g.topic),el('span',g.visitors+' visitors · '+g.total+' questions · '+g.recent+' in 7 days'));root.append(row);});
 const gaps=[...new Set(state.records.filter(r=>!K.validEvidence(state,r.evidence)).map(r=>r.topic))];root.append(el('p','Content gaps: '+(gaps.join(', ')||'Ask questions to discover missing information.'),'fine'));
}
function field(container,title,value,rows){const label=el('label',title),input=el(rows?'textarea':'input');input.value=value||'';if(rows)input.rows=rows;label.append(input);container.append(label);return input;}
function renderQueue(){
 const root=$('#review-queue');root.replaceChildren();if(!permitted('view_queue')){root.append(el('p','Queue hidden for this demonstration role.'));return;}
 state.records.slice().reverse().forEach(r=>{
 const row=el('article',undefined,'review-card');row.append(el('h3',r.question),el('p',new Date(r.at).toLocaleString()+' · '+r.status+' · '+r.topic,'fine'),el('p','Original answer: '+r.answer),el('p','Feedback: '+(r.feedback||'Not rated')+(r.comment?' · '+r.comment:'')),el('p','Context: '+[r.context.page,r.context.destination,r.context.ministry].filter(Boolean).join(' / '),'fine'));evidence(row,r.evidence);
 const similar=state.records.filter(x=>x.id!==r.id&&x.topic===r.topic);row.append(el('p','Similar questions: '+(similar.map(x=>x.question).join(' / ')||'None yet.'),'fine'));
 if(permitted('edit_answers')){
 const q=field(row,'Generalized FAQ question',r.proposedQuestion,2),a=field(row,'Proposed answer',r.proposedAnswer,3),topic=field(row,'Topic (change this to split one question)',r.topic);q.maxLength=300;a.maxLength=1800;
 row.append(el('p','Select underlying evidence. Read it, verify the answer, and remove personal details before approval.','fine'));
 const checked=[];state.sources.filter(s=>K.active(s)&&(!s.demo||state.demoMode)).forEach(s=>{const label=el('label',undefined,'source-choice'),input=el('input');input.type='checkbox';input.checked=r.reviewEvidence.some(e=>e.id===s.id&&e.revision===s.revision);checked.push([input,s.id]);label.append(input,document.createTextNode(s.title));row.append(label);});
 const controls=el('div',undefined,'actions');controls.append(button('Save proposal',()=>K.saveProposal(state,r.id,{question:q.value,answer:a.value,sourceIds:checked.filter(([c])=>c.checked).map(([,id])=>id)},role)),button('Correct topic',()=>K.retopic(state,r.id,topic.value.trim(),role)),button('Needs follow-up',()=>K.decide(state,r.id,'follow_up',role)),button('Reject',()=>K.decide(state,r.id,'rejected',role)));row.append(controls);
 }
 if(permitted('approve_reuse')){const label=el('label',undefined,'check-label'),verify=el('input');verify.type='checkbox';label.append(verify,document.createTextNode('I checked the underlying evidence and removed personal details.'));row.append(label,button('Approve for answer reuse',()=>K.approve(state,r.id,role,verify.checked)));}
 root.append(row);
 });if(!state.records.length)root.append(el('p','Your demo questions will appear here. Nothing is published automatically.'));
}
function renderCurated(){const root=$('#curated-list');root.replaceChildren();if(!permitted('view_queue'))return;
 state.faqs.filter(f=>!f.demo||state.demoMode).forEach(f=>{const row=el('article',undefined,'faq-card');row.append(el('h3',f.question),el('p',f.answer),el('p',(f.demo?'Fictional sample · ':'')+'Reuse: '+(f.reuse?'Approved':'Withdrawn')+' · FAQ: '+(f.published?'Published in this tab':'Not published'),'fine'));evidence(row,f.evidence);
 if(permitted('publish_faq')){const label=el('label',undefined,'check-label'),check=el('input');check.type='checkbox';label.append(check,document.createTextNode('I checked public wording, privacy, and current evidence.'));row.append(label);const controls=el('div',undefined,'actions');controls.append(button('Publish to demo FAQ',()=>K.publish(state,f.id,role,check.checked)),button(f.pinned?'Unpin':'Pin essential information',()=>K.setFaq(state,f.id,'pin',role)),button('Unpublish FAQ',()=>K.setFaq(state,f.id,'unpublish',role)));row.append(controls);}
 if(permitted('approve_reuse'))row.append(button('Withdraw reuse and FAQ',()=>K.setFaq(state,f.id,'withdraw',role)));root.append(row);
 });if(!state.faqs.length)root.append(el('p','Save and approve a proposal to create a curated answer.'));
}
function renderSources(){const root=$('#source-list');root.replaceChildren();if(!permitted('manage_sources')){root.append(el('p','Source management hidden for this demonstration role.'));return;}
 state.sources.forEach(s=>{const row=el('article',undefined,'source-card');row.append(el('h3',s.title),el('p',[s.kind,s.destination||'All destinations',s.ministry||'Hope Sojourns',s.withdrawn?'Withdrawn':s.status,'revision '+s.revision].join(' · '),'fine'),link('View original source ↗',s.url));
 if(s.kind==='video'){row.append(el('p','Transcript missing. No interview claims or timestamps can be used in answers.','status-note'));}
 else{const text=field(row,s.demo?'Fictional sample text':'Reviewed website excerpt',s.text,3);const controls=el('div',undefined,'actions');controls.append(button('Save correction',()=>K.updateSource(state,s.id,{text:text.value},role)),button(s.withdrawn?'Restore as approved demo excerpt':'Withdraw source',()=>K.updateSource(state,s.id,{withdrawn:!s.withdrawn},role)));row.append(controls);}root.append(row);});
}
function renderVideos(){const root=$('#video-list');root.replaceChildren();
 const interviews=catalog.videos.filter(v=>v.id===$('#video-choice').value);
 interviews.forEach(v=>{const row=el('article',undefined,'video-card');row.append(el('h3',v.title),el('p',v.ministry+' · '+v.destination+' · Full transcript pending','fine'));
 const actions=el('div',undefined,'actions');actions.append(button('Ask about this video',()=>chooseContext(v)),button('Load video',()=>{if(row.querySelector('video'))return;const video=el('video');video.controls=true;video.preload='none';video.src=v.url;video.setAttribute('aria-label',v.title);row.append(video);}),link('Open original ↗',v.url));row.append(actions);root.append(row);
 });if(!interviews.length)root.append(el('p','The interview inventory is awaiting review. General internship questions remain available.'));
}
function render(){contextLabel();$('#sample-mode').checked=!!state.demoMode;renderConversation();renderFaq();renderAnalytics();renderQueue();renderCurated();renderSources();const audit=$('#audit-list');audit.replaceChildren();if(permitted('view_queue'))state.audit.slice().reverse().slice(0,50).forEach(a=>audit.append(el('li',new Date(a.at).toLocaleString()+' · '+a.action+' · '+a.details)));$('#merge-form').hidden=!permitted('edit_answers');$('#new-visitor').disabled=!permitted('view_analytics');}
async function start(){
 const response=await fetch('/knowledge/catalog.json',{cache:'no-store'});if(!response.ok)throw Error('The preview source catalog could not load.');catalog=await response.json();
 try{const stored=JSON.parse(sessionStorage.getItem(key)||'null');state=stored?.version===1&&stored.sampleVersion===1&&Array.isArray(stored.sources)&&Array.isArray(stored.records)?stored:addSamples(K.initialState(catalog.sources));}catch{state=addSamples(K.initialState(catalog.sources));}
 $('#sample-mode').addEventListener('change',()=>run(()=>{state.demoMode=$('#sample-mode').checked;$('#ask-status').textContent=state.demoMode?'Fictional sample answers and example topic counts are enabled.':'Sample answers are off. Only the small reviewed website corpus is available.';}));
 $('#ask-form').addEventListener('submit',e=>{e.preventDefault();run(()=>{K.ask(state,$('#question').value);$('#question').value='';$('#ask-status').textContent='Source lookup complete. No AI request was sent.';});});
 document.querySelectorAll('[data-question]').forEach(b=>b.addEventListener('click',()=>{$('#question').value=b.dataset.question;$('#ask-form').requestSubmit();}));
 document.querySelectorAll('[data-ask-page]').forEach(b=>b.addEventListener('click',()=>chooseContext()));$('#reset-context').addEventListener('click',()=>chooseContext());
 document.querySelectorAll('[data-ask-source]').forEach(b=>b.addEventListener('click',()=>chooseContext(state.sources.find(s=>s.id===b.dataset.askSource))));
 $('#faq-search').addEventListener('input',renderFaq);$('#faq-window').addEventListener('change',renderFaq);$('#demo-role').addEventListener('change',()=>{role=$('#demo-role').value;render();});
 $('#new-visitor').addEventListener('click',()=>run(()=>{state.visitor=K.uid();state.lastTopic='';state.lastContext=null;$('#review-status').textContent='A new demo visitor is active. Existing counts remain for comparison.';}));
 $('#clear-demo').addEventListener('click',()=>{try{sessionStorage.removeItem(key);sessionStorage.removeItem('hs-knowledge-preview-v1');}catch{}state=addSamples(K.initialState(catalog.sources));save();render();$('#ask-status').textContent='Your interactions have been cleared. The fictional starter examples are restored.';});
 $('#merge-form').addEventListener('submit',e=>{e.preventDefault();run(()=>K.mergeTopics(state,$('#merge-from').value.trim(),$('#merge-to').value.trim(),role));});
 catalog.videos.filter(v=>/interview|conversation/i.test(v.title)&&v.destination==='Athens').sort((a,b)=>a.title.localeCompare(b.title,undefined,{numeric:true})).forEach(v=>{const option=el('option',v.title);option.value=v.id;$('#video-choice').append(option);});
 $('#video-choice').addEventListener('change',()=>{renderVideos();chooseContext(catalog.videos.find(v=>v.id===$('#video-choice').value));});renderVideos();render();save();
}
start().catch(e=>{$('#ask-status').textContent=e.message+' Please reload or use the main internship page.';});
