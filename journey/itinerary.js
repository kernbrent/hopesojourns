/* Shared itinerary grouping. Private reservation fields are never rendered here. */
(() => {
 const labels={daily:'Daily overview',transportation:'Transportation',lodging:'Lodging',meal:'Meals / Restaurants',ministry:'Ministry / Service',worship:'Bible Studies & Worship',meeting:'Meetings / Training',activity:'Activities / Visits',rest:'Free Time / Rest',general:'General'};
 const parse=(v,f)=>{try{return typeof v==='string'?JSON.parse(v):v||f;}catch{return f;}};
 const category=i=>i.content_type==='devotional'?'worship':i.content_type==='travel'||i.itinerary_kind==='travel'?'transportation':i.itinerary_category||'daily';
 const isItinerary=i=>['travel','itinerary','devotional'].includes(i.content_type);
 const sections=i=>!isItinerary(i)?[i.content_type]:[...new Set([category(i),...parse(i.itinerary_tags,[]).filter(k=>labels[k])])];
 function dates(i){if(!i.event_date)return ['undated'];const end=category(i)==='lodging'?i.end_date:category(i)==='transportation'?i.arrival_date:null,result=[i.event_date];if(end&&end>i.event_date)for(let d=Date.parse(i.event_date+'T00:00:00Z')+86400000;d<=Date.parse(end+'T00:00:00Z')&&result.length<366;d+=86400000)result.push(new Date(d).toISOString().slice(0,10));return result;}
 function lines(i){const d=parse(i.itinerary_details,{}),titles={venue:'Venue / property',address:'Address',contact:'Contact',carrier:'Carrier',partySize:'Party size',dietaryNotes:'Dietary notes',leader:'Leader / facilitator',preparation:'Preparation',admission:'Admission / booking details'};return [...(i.end_date||i.end_time?[`${category(i)==='lodging'?'Check-out':'Ends'}: ${[i.end_date,i.end_time].filter(Boolean).join(' · ')}`]:[]),...Object.entries(titles).filter(([k])=>d[k]).map(([k,t])=>`${t}: ${d[k]}`)];}
 function render(i){const host=document.createElement('div');host.className='journey-itinerary-details';lines(i).forEach(v=>{const p=document.createElement('p');p.textContent=v;host.append(p);});return host;}
 window.HSItinerary={labels,parse,category,isItinerary,sections,dates,lines,render};
})();
