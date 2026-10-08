(()=>{
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,run)=>{const b=node('button',text,'admin-button admin-button-outline');b.type='button';b.addEventListener('click',run);return b;};
 const labels={general:'General interest',future:'Future journey interest',journey:'Existing journey'};
 function field(form,label,name,value,options){const wrap=node('label'),title=node('span',label);let input;
 if(options){input=node('select');for(const [v,t] of options){const o=node('option',t);o.value=v;input.append(o);}}
 else input=node(name==='notes'?'textarea':'input');
 input.name=name;input.value=value||'';wrap.append(title,input);form.append(wrap);return input;}
 async function panel(host,id,api,reply){
 host.textContent='Loading inquiry…';
 try{
 const {result:d}=await api('/inquiries/'+id),w=d.inquiries[0];host.replaceChildren(node('h3','Inquiry and next steps'));
 const form=node('form',null,'admin-reply-form inquiry-form'),status=node('p');status.setAttribute('role','status');
 const route=field(form,'Where should this interest go?','path',w.path,Object.entries(labels));
 const future=field(form,'Future-interest list (destination or ministry)','futureList',w.future_list);future.maxLength=180;
 const dl=node('datalist');dl.id='future-lists-'+id;d.lists.forEach(l=>{const o=node('option');o.value=l;dl.append(o);});future.setAttribute('list',dl.id);form.append(dl);
 field(form,'Preferred timing','preferredTiming',w.preferred_timing).maxLength=300;
 const trip=field(form,'Planned journey','tripId',w.trip_id,[['','Choose a journey'],...d.trips.map(t=>[t.id,t.title]),...(w.trip_id&&!d.trips.some(t=>t.id===w.trip_id)?[[w.trip_id,w.trip_title+' (existing link)']]:[])]);
 const stage=field(form,'Inquiry stage','stage',w.stage,['new','contacted','exploring','invited','closed'].map(v=>[v,v[0].toUpperCase()+v.slice(1)]));
 const owner=field(form,'Responsible person','ownerId',w.owner_id,[['','Choose a person'],...d.owners.map(o=>[o.id,o.name])]);
 const due=field(form,'Next follow-up date','dueDate',w.due_date);due.type='date';
 const next=field(form,'Next action','nextAction',w.next_action);next.maxLength=500;
 field(form,'Conversation notes','notes',w.notes).maxLength=4000;
 const reason=field(form,'Reason for closing','closeReason',w.close_reason);reason.maxLength=500;
 function visibility(){future.closest('label').hidden=route.value!=='future';future.required=route.value==='future';trip.closest('label').hidden=route.value!=='journey';trip.required=route.value==='journey';reason.required=stage.value==='closed';reason.closest('label').hidden=stage.value!=='closed';owner.required=due.required=next.required=stage.value!=='closed';}
 route.onchange=stage.onchange=visibility;visibility();
 const save=button('Save next steps',()=>{});save.type='submit';form.append(save,status);
 form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{const body=Object.fromEntries(new FormData(form));body.revision=w.revision;await api('/inquiries/'+id,{method:'POST',body});await panel(host,id,api,reply);}catch(e){status.textContent=e.message;save.disabled=false;}};
 host.append(node('p','Interest and waitlisting do not create charges or grant portal access. Confirm participation in the journey Team section when the traveler accepts.'),form);
 if(!d.canEdit)for(const c of form.elements)c.disabled=true;
 if(reply)host.append(button('Reply from portal',()=>reply()),button('Prepare journey invitation',()=>{if(w.path!=='journey'||!w.trip_id){status.textContent='Save a planned journey first.';return;}reply(w);}));
 const history=node('section');history.append(node('h4','Email delivery'));
 d.emails.forEach(mail=>{const row=node('p',`${mail.kind==='acknowledgment'?'Acknowledgment':'Reply'}: ${mail.subject} — ${mail.status==='sent'?'Accepted for delivery':mail.status} (${mail.recipient})${mail.error?' — '+mail.error:''}`);
 if(d.canEdit&&['failed','uncertain','queued','sending'].includes(mail.status))row.append(button('Retry saved email',async e=>{e.target.disabled=true;try{await api('/inquiries/'+id+'/emails/'+mail.id,{method:'POST',body:{}});await panel(host,id,api,reply);}catch(err){status.textContent=err.message;e.target.disabled=false;}}));history.append(row);});
 if(d.history?.length){const log=node('details');log.append(node('summary','Inquiry history'));d.history.forEach(h=>{const v=JSON.parse(h.metadata_json);log.append(node('p',`${h.created_at.slice(0,10)} · ${labels[v.path]} · ${v.stage} · ${v.nextAction}${v.notes?' · '+v.notes:''}${v.closeReason?' · Closed: '+v.closeReason:''}`));});host.append(log);}
 if(!d.emails.length)history.append(node('p','No portal email recorded for this older inquiry.'));host.append(history);
 }catch(e){host.textContent=e.message;}
 }
 async function list(api,open){
 const dialog=node('dialog',null,'admin-detail-dialog inquiry-dialog'),wrap=node('div',null,'admin-detail-card'),status=node('p');dialog.append(wrap);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());wrap.append(node('h2','Inquiries and future-interest lists'),button('Close',()=>dialog.close()),status);dialog.showModal();
 try{const {result:d}=await api('/inquiries');const controls=node('form',null,'admin-reply-form');const path=field(controls,'Show','path','open',[['open','All open inquiries'],['overdue','Overdue follow-ups'],['unassigned','Unassigned'],...Object.entries(labels),['closed','Closed inquiries']]);const group=field(controls,'Future-interest list','list','',[['','All lists'],...d.lists.map(l=>[l,l])]);const search=field(controls,'Search name, destination, or notes','search','');const results=node('div');wrap.append(controls,results);controls.onsubmit=e=>e.preventDefault();
 const render=()=>{results.replaceChildren();const today=new Date().toLocaleDateString('en-CA'),q=search.value.toLowerCase();const matches=d.inquiries.filter(w=>(path.value==='closed'?w.stage==='closed':w.stage!=='closed')&&(path.value==='overdue'?w.due_date&&w.due_date<today:path.value==='unassigned'?!w.owner_id:labels[path.value]?w.path===path.value:true)&&(!group.value||w.future_list===group.value)&&[w.first_name,w.last_name,w.future_list,w.trip_title,w.notes,w.selected_opportunities_json].join(' ').toLowerCase().includes(q));status.textContent=matches.length+' inquiries';
 matches.forEach(w=>{const card=node('article',null,'admin-detail-card');card.append(node('h3',w.first_name+' '+w.last_name),node('p',`${labels[w.path]}${w.future_list?' · '+w.future_list:''}${w.trip_title?' · '+w.trip_title:''} · ${w.stage}`),node('p',`${w.owner_name||'Unassigned'} · ${w.due_date||'No follow-up date'}${w.due_date<today&&w.stage!=='closed'?' · Overdue':''}`),node('p',w.next_action),button('Open inquiry',()=>{dialog.close();open(w.submission_id);}));results.append(card);});};controls.oninput=render;render();
 }catch(e){status.textContent=e.message;}
 }
 window.HSInquiries={panel,list};
})();
