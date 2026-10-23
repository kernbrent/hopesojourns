import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../../../admin/trips/memories.js',import.meta.url),'utf8');
function render(){
 const statuses=[{textContent:''},{textContent:''}],moves={querySelectorAll:()=>[]},form={};
 const panel={innerHTML:'',querySelector:(selector:string)=>selector==='form'?form:selector==='.memory-story-selection'?moves:null,querySelectorAll:(selector:string)=>selector==='.memory-status'?statuses:[]};
 const content=[['highlight','published','public','activity'],['travel','published','public','travel'],['draft','draft','public','activity'],['admin','published','admin','activity']].map(([id,publication_status,visibility,itinerary_kind])=>({id,title:id,publication_status,visibility,itinerary_kind}));
 const state={workspace:{trip:{id:'trip',title:'Trip'},content}},window:any={MmtUser:{is_admin:true}};
 runInNewContext(source.replace('window.HSMemories={open};','window.HSMemories={open,renderStory,message};'),{window,state});
 window.HSMemories.renderStory(panel,{memories:[],destinations:[],publication:null},'trip');
 return {panel,statuses,window};
}
it('offers only backend-eligible content for story selection',()=>{
 const {panel}=render();
 expect(panel.innerHTML).toContain('value="highlight"');
 for(const id of ['travel','draft','admin'])expect(panel.innerHTML).not.toContain(`value="${id}"`);
 expect(panel.innerHTML).toContain('Travel booking entries are excluded');
});
it('shows save feedback at both ends of the story form',()=>{
 const {panel,statuses,window}=render();
 expect((panel.innerHTML.match(/class="memory-status"/g)||[]).length).toBe(2);
 expect(panel.innerHTML).toMatch(/Save and preview[\s\S]*class="memory-status"/);
 window.HSMemories.message(panel,'Preview could not be saved.');
 expect(statuses.map(s=>s.textContent)).toEqual(['Preview could not be saved.','Preview could not be saved.']);
});

