(() => {
 const form=document.querySelector('#trip-content-form'),I=window.HSItinerary;
 const box=document.createElement('fieldset');
 box.innerHTML='<legend>Itinerary</legend><label>Category<select name="itineraryCategory"></select></label><p>In a hurry? Choose Daily overview and write the whole day in one item. Details below are optional.</p><fieldset data-tags><legend>Also show under (optional)</legend></fieldset><div data-specialty></div><div data-ministry hidden><label>Find a ministry<input type="search" data-search-text placeholder="Name, city, email, phone or website"></label><button type="button" data-search>Search ministries</button><div data-matches></div><input name="ministryId" type="hidden"><p data-selected></p><button type="button" data-clear>Clear ministry</button><button type="button" data-new>Add a ministry</button></div><details><summary>Private booking information (administrators only)</summary><label>Reservation reference<input data-private="reservation" maxlength="2000"></label><label>Private notes<textarea data-private="notes" maxlength="2000"></textarea></label></details>';
 form.querySelector('[data-travel-fields]').before(box);
 for(const [value,label] of Object.entries(I.labels)){box.querySelector('select').add(new Option(label,value));if(!['daily','general'].includes(value)){const host=document.createElement('label');host.className='trip-check';const input=document.createElement('input');input.type='checkbox';input.dataset.tag=value;host.append(input,document.createTextNode(label));box.querySelector('[data-tags]').append(host);}}
 const definitions=[['venue','Venue / property name','lodging meal ministry worship meeting activity'],['address','Address','lodging meal ministry worship meeting activity'],['contact','Contact information for travelers','lodging meal ministry worship meeting activity'],['carrier','Carrier / operator','transportation'],['partySize','Party size','meal'],['dietaryNotes','Dietary notes','meal'],['leader','Leader / facilitator','ministry worship meeting'],['preparation','Preparation / materials','ministry worship meeting activity'],['admission','Admission / booking details for travelers','activity']];
 for(const [key,label,categories] of definitions){const host=document.createElement('label');host.dataset.categories=categories;const input=document.createElement('input');input.dataset.detail=key;input.maxLength=2000;host.append(document.createTextNode(label),input);box.querySelector('[data-specialty]').append(host);}
 const end=document.createElement('div');end.innerHTML='<label>End / check-out date (optional)<input name="endDate" type="date"></label><label>End / check-out time (optional)<input name="endTime" maxlength="40"></label>';box.querySelector('[data-specialty]').append(end);
 let api,tripId,dialog;
 function sync(){
  const itinerary=form.elements.contentType.value==='itinerary',cat=form.elements.itineraryCategory.value,travel=itinerary&&cat==='transportation';
  box.hidden=!itinerary;box.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=!itinerary);
  box.querySelectorAll('[data-categories]').forEach(el=>el.hidden=!el.dataset.categories.split(' ').includes(cat));
  box.querySelector('[data-ministry]').hidden=cat!=='ministry';box.querySelector('[data-tags]').hidden=!['daily','general'].includes(cat);
  form.querySelector('[data-travel-fields]').hidden=!travel;form.querySelectorAll('[data-travel-fields] input').forEach(el=>el.disabled=!travel);
  form.elements.eventDate.required=itinerary;form.elements.location.required=travel;form.elements.content.required=!itinerary;
  form.querySelector('[data-event-date-label]').textContent=travel?'Departure date':itinerary?'Date':'Date (optional)';
  form.querySelector('[data-event-time-label]').textContent=travel?'Departure time (local, optional)':itinerary&&cat==='lodging'?'Check-in time (optional)':'Time (optional)';
  form.querySelector('[data-location-label]').textContent=travel?'Departure location':'Location (optional)';
  form.querySelector('[data-content-label]').textContent=itinerary?'Plan / description (optional)':'Content';
  form.elements.visibility.querySelector('[value="public"]').disabled=travel;
  if(travel&&form.elements.visibility.value==='public')form.elements.visibility.value='travelers';
 }
 function load(item){
  form.elements.contentType.value=item.content_type==='travel'?'itinerary':item.content_type;
  form.elements.itineraryCategory.value=I.category(item);
  const detail=I.parse(item.itinerary_details,{}),priv=I.parse(item.itinerary_private,{}),tags=I.parse(item.itinerary_tags,[]);
  box.querySelectorAll('[data-detail]').forEach(el=>el.value=detail[el.dataset.detail]||'');box.querySelectorAll('[data-private]').forEach(el=>el.value=priv[el.dataset.private]||'');box.querySelectorAll('[data-tag]').forEach(el=>el.checked=tags.includes(el.dataset.tag));
  box.querySelector('[data-selected]').textContent=item.ministry_id?'Existing ministry linked. Search to change it.':'';box.querySelector('[data-matches]').replaceChildren();sync();
 }
 function payload(value){if(value.contentType!=='itinerary')return value;value.itineraryTags=[...box.querySelectorAll('[data-tag]:checked')].map(el=>el.dataset.tag);value.itineraryDetails=Object.fromEntries([...box.querySelectorAll('[data-detail]')].map(el=>[el.dataset.detail,el.value]));value.itineraryPrivate=Object.fromEntries([...box.querySelectorAll('[data-private]')].map(el=>[el.dataset.private,el.value]));return value;}
 function choose(m){form.elements.ministryId.value=m.id;box.querySelector('[data-selected]').textContent='Linked ministry: '+m.name;if(!box.querySelector('[data-detail="venue"]').value)box.querySelector('[data-detail="venue"]').value=m.name;dialog?.close();}
 function results(host,rows){host.replaceChildren();if(!rows.length)host.textContent='No matching ministries found.';rows.forEach(m=>{const b=document.createElement('button');b.type='button';b.textContent=[m.name,m.city,m.region,m.status==='inactive'?'Inactive':null].filter(Boolean).join(' · ');b.onclick=()=>choose(m);host.append(b);});}
 box.querySelector('[data-search]').onclick=async()=>{const host=box.querySelector('[data-matches]');host.textContent='Searching…';try{results(host,(await api(`/admin/trips/${tripId()}/itinerary-ministries?q=${encodeURIComponent(box.querySelector('[data-search-text]').value)}`)).ministries);}catch(e){host.textContent=e.message;}};
 box.querySelector('[data-clear]').onclick=()=>{form.elements.ministryId.value='';box.querySelector('[data-selected]').textContent='';};
 box.querySelector('[data-new]').onclick=()=>{
  dialog=document.createElement('dialog');dialog.className='planning-dialog';dialog.innerHTML='<form><h2>Add a ministry</h2><p>Check existing records before creating a ministry. Your itinerary stays in place.</p>'+['name','city','region','country','email','phone','website'].map(k=>`<label>${k==='name'?'Ministry name':k[0].toUpperCase()+k.slice(1)}<input name="${k}" ${k==='name'?'required':''} maxlength="${k==='name'?160:254}"></label>`).join('')+'<div data-results></div><p role="status"></p><button type="submit">Check and add ministry</button><button type="button" data-confirm hidden>Create separate ministry</button><button type="button" data-close>Cancel</button></form>';
  document.body.append(dialog);const f=dialog.querySelector('form'),status=f.querySelector('[role=status]'),confirm=f.querySelector('[data-confirm]');let token;
  f.addEventListener('input',()=>{token=undefined;confirm.hidden=true;});
  async function save(review=false){const buttons=f.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);try{const body=Object.fromEntries(new FormData(f));if(review)body.reviewToken=token;const r=await api(`/admin/trips/${tripId()}/itinerary-ministries`,{method:'POST',body:JSON.stringify(body)});if(r.id){choose(r);return;}results(f.querySelector('[data-results]'),r.matches);status.textContent=r.message;token=r.reviewToken;confirm.hidden=!token;}catch(e){status.textContent=e.message;}finally{buttons.forEach(b=>b.disabled=false);}}
  f.onsubmit=e=>{e.preventDefault();save();};confirm.onclick=()=>save(true);f.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
 };
 form.elements.contentType.addEventListener('change',sync);form.elements.itineraryCategory.addEventListener('change',sync);
 // Reset only extra controls synchronously: editContent immediately loads a record afterward.
 form.addEventListener('reset',()=>{box.querySelectorAll('[data-detail],[data-private]').forEach(el=>el.value='');box.querySelectorAll('[data-tag]').forEach(el=>el.checked=false);box.querySelector('[data-selected]').textContent='';box.querySelector('[data-matches]').replaceChildren();setTimeout(sync,0);});
 window.HSTravelForm={sync,load,payload,configure:(call,id)=>{api=call;tripId=id;}};sync();
})();
