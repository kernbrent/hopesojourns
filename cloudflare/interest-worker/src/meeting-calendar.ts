import ICAL from 'ical.js';
import {AdminError} from './admin';
export const meetingTimezone='America/Chicago';
// Interpret a wall-clock value in an IANA zone. Reject nonexistent DST times.
export function wallInstant(value:string,zone=meetingTimezone):string{
 const m=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);if(!m)throw new Error('Invalid calendar time.');
 const target=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0));let guess=target;
 const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 for(let i=0;i<4;i++){const p=Object.fromEntries(fmt.formatToParts(new Date(guess)).map(x=>[x.type,x.value]));const shown=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);if(shown===target)return new Date(guess).toISOString();guess+=target-shown;}
 throw new Error('This local time does not exist because of daylight saving time.');
}
export function previewCalendar(ics:string,calendarId:string,from:string,to:string){
 try{
 if(!calendarId||!from||!to||to<from||Date.parse(to)-Date.parse(from)>367*86400000)throw Error('Name the calendar and choose a review range of at most one year.');
 const root=new ICAL.Component(ICAL.parse(ics));if(root.name!=='vcalendar')throw Error('Choose an iCalendar (.ics) file.');
 const components=root.getAllSubcomponents('vevent');if(components.length>1000)throw Error('Use a smaller calendar export.');
 const zoneComponents=root.getAllSubcomponents('vtimezone');for(const c of zoneComponents)ICAL.TimezoneService.register(new ICAL.Timezone({component:c}));
 const instant=(time:ICAL.Time)=>time.isDate?time.toString():time.zone.tzid==='UTC'?time.toJSDate().toISOString():time.zone.tzid==='floating'?wallInstant(time.toString()):zoneComponents.some(z=>z.getFirstPropertyValue('tzid')===time.zone.tzid)?time.toJSDate().toISOString():wallInstant(time.toString(),time.zone.tzid);
 const events:any[]=[];let steps=0;
 const add=(event:ICAL.Event,start:ICAL.Time,end:ICAL.Time,occurrence:string,uid:string)=>{
  const starts=instant(start),ends=instant(end);if(starts.slice(0,10)>to||ends.slice(0,10)<from)return;
  const component=event.component;
  events.push({calendar_id:calendarId,event_id:uid,occurrence_id:occurrence,title:event.summary||'Untitled meeting',starts_at:starts,ends_at:ends,all_day:start.isDate,location_name:event.location||'',street_address:'',source_url:String(component.getFirstPropertyValue('url')||''),status:String(component.getFirstPropertyValue('status')||'CONFIRMED'),description:event.description||'',attendees:component.getAllProperties('attendee').map(p=>({name:String(p.getParameter('cn')||''),email:String(p.getFirstValue()||'').replace(/^mailto:/i,'')})),locationReview:!!event.location});
  if(events.length>400)throw Error('More than 400 occurrences. Choose a shorter review range.');
 };
 for(const c of components){const event=new ICAL.Event(c);if(event.isRecurrenceException())continue;if(!event.uid||!event.startDate)throw Error('An event is missing its identifier or start.');
  // Unknown TZIDs must not silently turn into floating times.
  for(const prop of ['dtstart','dtend']){const tzid=c.getFirstProperty(prop)?.getParameter('tzid');if(tzid&&!zoneComponents.some(z=>z.getFirstPropertyValue('tzid')===tzid)){try{new Intl.DateTimeFormat('en-US',{timeZone:String(tzid)});}catch{throw Error('Unsupported calendar timezone: '+tzid);}if(event.startDate.zone.tzid==='floating')throw Error('Export this calendar with timezone definitions or UTC dates.');}}
  for(const other of components){const exception=new ICAL.Event(other);if(exception.isRecurrenceException()&&exception.uid===event.uid)event.relateException(exception);}
  if(!event.isRecurring()){add(event,event.startDate,event.endDate,'single',event.uid);continue;}
  const frequencies=Object.keys(event.getRecurrenceTypes());if(frequencies.some(f=>['SECONDLY','MINUTELY','HOURLY'].includes(f)))throw Error('Subdaily recurrence is not supported for meeting import.');
  const iterator=event.iterator();let occurrence:ICAL.Time|null;
  while((occurrence=iterator.next())){if(++steps>20000)throw Error('Calendar recurrence limit reached. Export a smaller range.');if(occurrence.toString().slice(0,10)>to)break;const detail=event.getOccurrenceDetails(occurrence);add(detail.item,detail.startDate,detail.endDate,occurrence.toString(),event.uid);}
 }
 // Standalone exceptions in range remain individually selectable, including cancellations.
 for(const c of components){const e=new ICAL.Event(c);if(e.isRecurrenceException()&&!components.some(x=>{const m=new ICAL.Event(x);return m.uid===e.uid&&!m.isRecurrenceException();}))add(e,e.startDate,e.endDate,e.recurrenceId.toString(),e.uid);}
 return events.sort((a,b)=>a.starts_at.localeCompare(b.starts_at));
 }catch(e){throw new AdminError(422,'CALENDAR_REVIEW',e instanceof Error?e.message:'Unable to read calendar.');}
}
