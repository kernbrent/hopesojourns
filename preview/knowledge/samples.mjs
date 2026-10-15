/* Explicitly fictional preview fixtures. Never import these into an authoritative corpus. */
const samples=[
 ['weekly-life','What could a typical internship week look like?',22,'For this fictional example, imagine a week with ministry service, preparation with a local supervisor, time to learn about the community, and reflection with Hope Sojourns. A real schedule would be agreed with the host ministry. This is not a transcript or a confirmed placement.'],
 ['language','Would I need to speak Greek?',16,'In this fictional example, an English-speaking intern learns useful Greek greetings and works with a team that can help with language differences. Some roles could need Greek. This sample does not establish any ministry’s actual language requirements; Brent would need to confirm them.'],
 ['bedding','Are the beds comfortable? What are the mattresses like?',50,'For this fictional example, imagine a simple guest room with a regular bed, mattress, and bedding. Comfort is personal, so an intern would ask about the actual arrangement and any accessibility needs before agreeing to it. No bed, mattress, housing provider, or accommodation is confirmed by this sample.'],
 ['housing','Where would I stay during an internship?',9,'For this fictional example, imagine shared housing arranged during the planning process. Before a real placement, you would need written details about the location, room sharing, facilities, accessibility, costs, and local contact. This sample is not a housing offer or commitment.'],
 ['costs','What would an internship cost?',6,'In this fictional example, the planning conversation would cover travel, accommodation, meals, insurance, and local transport. I have no verified price to quote. Brent would need to confirm the actual budget for your dates and placement. This is an example answer, not a quote.'],
 ['ministry','How could an intern serve alongside a ministry?',12,'For this fictional example, imagine helping with practical tasks, welcoming people, preparing activities, and learning from the local team. Responsibilities would depend on skills, supervision, and community needs. This example does not describe what any speaker actually said or promise a role.']
];
export function addSamples(state){
 state.demoMode=true;state.sampleRecords=[];
 const now=Date.now();
 for(const [topic,question,visitors,text] of samples){
  const id='sample-'+topic;
  if(!state.sources.some(s=>s.id===id))state.sources.push({id,title:'Fictional example: '+question,text,topics:[topic],url:'/intern-assistant/#sample-library',destination:'',ministry:'',kind:'fictional sample',demo:true,status:'approved',visibility:'public',withdrawn:false,revision:1,origin:'Mock content authorized for this preview. Not ministry evidence or an interview transcript.',reviewedAt:'2026-10-15',updatedAt:'2026-10-15'});
  if(!state.faqs.some(f=>f.id===id))state.faqs.push({id,recordId:id,topic,question,answer:text,evidence:[{id,revision:1}],destination:'',ministry:'',demo:true,reuse:true,published:true,pinned:false,at:now});
  for(let i=0;i<visitors;i++)state.sampleRecords.push({id:id+'-'+i,topic,visitor:'fictional-visitor-'+i,at:now-(i%40)*86400000});
 }
 state.sampleVersion=1;return state;
}
