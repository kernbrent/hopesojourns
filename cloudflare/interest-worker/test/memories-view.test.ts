import {expect,it} from 'vitest';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function setup(){
 const element=(tag:string):any=>({tag,textContent:'',children:[] as any[],className:'',append(...children:any[]){this.children.push(...children);},replaceChildren(...children:any[]){this.children=children;},setAttribute(){}});
 const scope={window:{} as any,document:{createElement:element}};
 vm.runInNewContext(readFileSync(new URL('../../../journey/memories-view.js',import.meta.url),'utf8'),scope);
 const titles=(root:any):string[]=>root.children.flatMap((child:any)=>child.tag==='h3'?[child.textContent]:titles(child));
 return {view:scope.window.HSTripMemoriesView,root:element('article'),titles};
}
const photos=[{id:'z',kind:'photo',title:'Family first',event_date:'2025-01-14'}, {id:'a',kind:'photo',title:'Sunset last',event_date:'2025-01-09'}];
it('renders a reviewed story in its saved gallery order instead of date or identifier order',()=>{
 const {view,root,titles}=setup();view.story(root,{title:'Trip',content:[],memories:photos});
 expect(titles(root)).toEqual(['Family first','Sunset last']);
});
it('retains chronological ordering for live trip collections',()=>{
 const {view,root,titles}=setup();view.collection(root,photos);
 expect(titles(root)).toEqual(['Sunset last','Family first']);
});
