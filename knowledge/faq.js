(()=>{
 const form=document.querySelector('#faq-search'),list=document.querySelector('#faq-list'),status=document.querySelector('#faq-status');
 let requestNumber=0;
 async function load(){
  const current=++requestNumber;status.textContent='Loading reviewed answers…';list.setAttribute('aria-busy','true');
  try{
   const r=await fetch('/api/interest/public/knowledge/faqs?'+new URLSearchParams({q:form.elements.query.value,window:form.elements.window.value}),{cache:'no-store'});
   if(!r.ok)throw Error('Answers are temporarily unavailable. Please try again or get in touch with Brent.');
   const d=await r.json();if(current!==requestNumber)return;list.replaceChildren();
   for(const f of d.faqs){
    const article=document.createElement('article'),meta=document.createElement('div'),badge=document.createElement('span'),h=document.createElement('h2'),p=document.createElement('p');
    meta.className='faq-answer-meta';badge.className='faq-answer-badge'+(f.pinned?' is-featured':'');badge.textContent=f.pinned?'Essential answer':'Reviewed answer';meta.append(badge);
    if(f.visitors>0){const count=document.createElement('span');count.textContent=f.visitors+' estimated '+(f.visitors===1?'visitor':'visitors')+' · '+f.questions+' '+(f.questions===1?'question':'questions');meta.append(count);}
    h.textContent=f.question;p.textContent=f.answer;p.className='faq-answer-copy';article.append(meta,h,p);
    if(f.citations?.length){const sources=document.createElement('nav');sources.className='faq-answer-sources';sources.setAttribute('aria-label','Sources for '+f.question);const label=document.createElement('span');label.textContent='Explore the source';sources.append(label);
     for(const c of f.citations){const a=document.createElement('a');a.href=c.url;a.textContent=c.title+' →';sources.append(a);}article.append(sources);}
    list.append(article);
   }
   const count=d.faqs.length;status.textContent=count?count+' reviewed '+(count===1?'answer':'answers')+(form.elements.query.value.trim()?' matching your search.':'.'):'No reviewed answers match yet. Try another search, use the ? button, or leave a question for Brent.';
  }catch(e){if(current!==requestNumber)return;list.replaceChildren();status.textContent=e.message;}
  finally{if(current===requestNumber)list.setAttribute('aria-busy','false');}
 }
 form.addEventListener('submit',e=>{e.preventDefault();load();});form.elements.window.addEventListener('change',load);load();
})();
