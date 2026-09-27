import {expect,it} from 'vitest';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
it('includes escaped departure and arrival details in the offline packet',async()=>{
 let saved:Blob|null=null;
 const escape=(value:string)=>value.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]!));
 const element=(tag:string):any=>({textContent:'',children:[] as any[],className:'',append(child:any){this.children.push(child);},click(){},get outerHTML(){return `<${tag}>${escape(this.textContent)}${this.children.map((c:any)=>c.outerHTML).join('')}</${tag}>`;}});
 const context={window:{} as any,Blob,URL:{createObjectURL:(b:Blob)=>{saved=b;return 'blob:test';},revokeObjectURL:()=>{}},document:{createElement:element},setTimeout:()=>{}};
 for(const name of ['travel-details','traveler-packet'])vm.runInNewContext(readFileSync(new URL(`../../../journey/${name}.js`,import.meta.url),'utf8'),context);
 context.window.HSTravelerPacket.download({title:'Trip',code:'test'},[{title:'Flight',content:'',content_type:'travel',publication_status:'published',visibility:'travelers',event_date:'2026-10-10',event_time:'21:00',location:'DFW',arrival_date:'2026-10-11',arrival_time:'12:00',arrival_location:'LHR <terminal>',travel_mode:'Air',service_number:'AA50'}]);
 const html=await saved!.text();
 expect(html).toContain('Departure: 2026-10-10');expect(html).toContain('Arrival: 2026-10-11');
 expect(html).toContain('LHR &lt;terminal&gt;');expect(html).toContain('AA50');expect(html).not.toContain('<terminal>');
});
it('exports only published traveler content with escaped text and no executable supplied links',async()=>{let saved:Blob|null=null;const context={window:{} as any,Blob,URL:{createObjectURL:(b:Blob)=>{saved=b;return 'blob:test';},revokeObjectURL:()=>{}},document:{createElement:()=>({click(){}})},setTimeout:()=>{}};vm.runInNewContext(readFileSync(new URL('../../../journey/traveler-packet.js',import.meta.url),'utf8'),context);context.window.HSTravelerPacket.download({title:'Trip <script>',code:'test'},[{title:'Allowed',content:'<script>alert(1)</script>',content_type:'devotional',publication_status:'published',visibility:'travelers',link_url:'javascript:alert(1)'},{title:'Secret',content:'private notes',publication_status:'published',visibility:'admin'},{title:'Unfinished',content:'draft text',publication_status:'draft',visibility:'travelers'}]);const html=await saved!.text();expect(html).toContain('Allowed');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');expect(html).not.toContain('private notes');expect(html).not.toContain('draft text');expect(html).not.toContain('javascript:');});
