import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../../../journey/journey.js',import.meta.url),'utf8');
const matching=source.slice(source.indexOf('function requestedTripMatches'),source.indexOf('async function restore'));
const initialization=source.slice(source.indexOf('async function initialize()'));
async function open(options:{lookupFails?:boolean;enabled?:boolean}={}){
 const location={href:'https://example.com/journey/?publicTrip=england',search:'?publicTrip=england'};
 const link:any={};let restored=false;let prefilled='';
 const context:any={URL,URLSearchParams,location,document:{querySelector:()=>link},history:{replaceState:(_a:unknown,_b:unknown,url:URL)=>{location.href=url.href;location.search=url.search;}},
 api:async()=>{if(options.lookupFails)throw Error('offline');return {trip:{id:'england-id',slug:'england',title:'England',portal_available:options.enabled!==false,portal_login_id:'CUSTOM-ID'}};},
 restore:async()=>{restored=true;prefilled=new URLSearchParams(location.search).get('trip')||'';}};
 await runInNewContext(matching+initialization,context);
 return {context,link,restored,prefilled};
}
it('resolves a custom shared ID before session restoration and targets the selected trip',async()=>{
 const result=await open();expect(result.prefilled).toBe('CUSTOM-ID');expect(result.link.href).toBe('/trip/?trip=england');
 expect(result.context.requestedTripMatches({id:'other-id',slug:'other'})).toBe(false);
 expect(result.context.requestedTripMatches({id:'england-id',slug:'england'})).toBe(true);
});
it('keeps manual sign-in available after a failed lookup and rejects another trip session',async()=>{
 const result=await open({lookupFails:true});expect(result.restored).toBe(true);expect(result.prefilled).toBe('');
 expect(result.context.requestedTripMatches({id:'other-id',slug:'other'})).toBe(false);
});
it('does not prefill a disabled portal',async()=>{expect((await open({enabled:false})).prefilled).toBe('');});
