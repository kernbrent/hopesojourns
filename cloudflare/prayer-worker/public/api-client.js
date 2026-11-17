// Retry reads once after a transient failure. Never replay a submitted change.
window.prayerApi = async function prayerApi(url,options={}) {
 const read=(options.method||'GET').toUpperCase()==='GET';
 const unavailable='The portal is temporarily unavailable. Please try Refresh content in a moment. Your sign-in has not been changed.';
 for(let attempt=0;attempt<(read?2:1);attempt++) {
  let response;
  try {response=await fetch(url,options);}catch {
   if(read&&attempt===0)continue;
   throw Error(read?unavailable:'Connection interrupted. Check whether your change was saved before trying again.');
  }
  let result;
  try {result=await response.json();if(result===null||typeof result!=='object')throw Error();}catch {
   if(read&&attempt===0)continue;
   throw Error(read?unavailable:'The portal could not confirm your change. Refresh content and check whether it was saved before trying again.');
  }
  if(read&&attempt===0&&[502,503,504].includes(response.status))continue;
  return {response,result};
 }
};
