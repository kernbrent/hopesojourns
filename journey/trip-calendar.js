(()=>{
 let serial=0;
 const day=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value?value:null;
 const date=value=>new Date(value+'T12:00:00Z');
 const key=value=>value.toISOString().slice(0,10);
 const label=value=>new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'}).format(date(value));
 function node(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
 function render(host,trip,items){
  host.replaceChildren();host.classList.add('trip-calendar');
  host.append(node('h2','Trip at a glance'));
  const start=day(trip.start_date),end=day(trip.end_date)||start;
  if(!start||!end||end<start){host.append(node('p','The trip dates are being finalized.'));return;}
  const prefix='trip-calendar-'+(++serial),byDay=new Map();
  for(const item of items.filter(i=>['overview','itinerary','travel'].includes(i.content_type))){
   const first=day(item.event_date),last=day(item.end_date)||first;if(!first||!last||last<first)continue;
   const from=first<start?start:first,to=last>end?end:last;
   for(let d=date(from),count=0;key(d)<=to&&count<366;d.setUTCDate(d.getUTCDate()+1),count++){const k=key(d);byDay.set(k,[...(byDay.get(k)||[]),item]);}
   if(day(item.arrival_date)&&item.arrival_date!==first&&item.arrival_date>=start&&item.arrival_date<=end)byDay.set(item.arrival_date,[...(byDay.get(item.arrival_date)||[]),item]);
  }
  const list=node('div',null,'trip-calendar-days');
  for(let d=date(start),count=0;key(d)<=end&&count<366;d.setUTCDate(d.getUTCDate()+1),count++){
   const k=key(d),detail=node('details');detail.id=prefix+'-'+k;detail.append(node('summary',label(k)));
   const events=byDay.get(k)||[];
   if(events.length){const ul=node('ul');for(const event of events)ul.append(node('li',event.title));detail.append(ul);}else detail.append(node('p','No published highlights yet.'));
   list.append(detail);
  }
  const controls=node('div',null,'trip-calendar-controls'),previous=node('button','Previous month'),next=node('button','Next month'),heading=node('strong');
  previous.type=next.type='button';heading.setAttribute('aria-live','polite');controls.append(previous,heading,next);
  const shell=node('div',null,'trip-calendar-scroll');
  const today=key(new Date()),initial=today>=start&&today<=end?today:start;
  let month=new Date(initial.slice(0,7)+'-01T12:00:00Z');
  function draw(){
   shell.replaceChildren();heading.textContent=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'long',year:'numeric'}).format(month);
   previous.disabled=key(month).slice(0,7)<=start.slice(0,7);next.disabled=key(month).slice(0,7)>=end.slice(0,7);
   const table=node('table'),caption=node('caption',heading.textContent);caption.className='trip-calendar-caption';table.append(caption);
   const thead=node('thead'),header=node('tr');for(const name of ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']){const th=node('th',name);th.scope='col';header.append(th);}thead.append(header);table.append(thead);
   const body=node('tbody'),cursor=new Date(month);cursor.setUTCDate(1-month.getUTCDay());
   do{const row=node('tr');for(let i=0;i<7;i++){
    const k=key(cursor),cell=node('td');
    if(cursor.getUTCMonth()===month.getUTCMonth()){
     cell.append(node('span',String(cursor.getUTCDate())));
     if(k>=start&&k<=end){cell.className='trip-calendar-active';const a=node('a',byDay.get(k)?.map(e=>e.title).join(' · ')||'View day');a.href='#'+prefix+'-'+k;a.setAttribute('aria-label',label(k)+': '+a.textContent);a.onclick=()=>{const detail=list.querySelector('#'+prefix+'-'+k);if(detail)detail.open=true;};cell.append(a);}
    }
    row.append(cell);cursor.setUTCDate(cursor.getUTCDate()+1);
   }body.append(row);}while(cursor.getUTCMonth()===month.getUTCMonth());
   table.append(body);shell.append(table);
  }
  previous.onclick=()=>{month.setUTCMonth(month.getUTCMonth()-1);draw();};next.onclick=()=>{month.setUTCMonth(month.getUTCMonth()+1);draw();};
  host.append(controls,shell,node('h3','Daily highlights'),list);draw();
 }
 window.HSTripCalendar={render};
})();
