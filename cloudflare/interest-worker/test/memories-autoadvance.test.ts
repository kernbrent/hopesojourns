import {expect,it,vi} from 'vitest';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const video=(title:string,event_date='2026-10-13')=>({kind:'video',title,event_date,image_url:'/clip.mp4'});
const photo={kind:'photo',title:'Photo between interview parts',image_url:'/photo.webp'};
function setup(items:any[]){
 let document:any;
 function element(tag:string):any{
  const listeners:Record<string,Function[]>={};
  const node:any={tag,tagName:tag.toUpperCase(),children:[],attributes:{},dataset:{},style:{overflow:''},open:false,
   get isConnected(){return tag==='body'||!!this.parent?.isConnected;},
   append(...children:any[]){for(const child of children){child.parent=this;this.children.push(child);}},
   replaceChildren(...children:any[]){for(const child of this.children)child.parent=null;this.children=[];this.append(...children);},
   setAttribute(name:string,value:string){this.attributes[name]=value;},
   removeAttribute(name:string){delete this.attributes[name];delete this[name];},
   addEventListener(name:string,handler:Function){(listeners[name]??=[]).push(handler);},
   emit(name:string){for(const handler of listeners[name]||[])handler({target:this});},
   showModal(){this.open=true;},close(){this.open=false;this.emit('close');},
   remove(){if(this.parent)this.parent.children=this.parent.children.filter((child:any)=>child!==this);this.parent=null;},
   focus(){document.activeElement=this;},
  };
  if(tag==='video'){node.play=vi.fn(()=>Promise.resolve());node.pause=vi.fn();node.load=vi.fn();}
  return node;
 }
 const body=element('body'),root=element('section');body.append(root);
 document={createElement:element,body};const scope={window:{} as any,document};
 vm.runInNewContext(readFileSync(new URL('../../../journey/memories-view.js',import.meta.url),'utf8'),scope);
 scope.window.HSTripMemoriesView.collection(root,items,{preserveOrder:true});
 const find=(node:any,tag:string):any[]=>[...(node.tag===tag?[node]:[]),...node.children.flatMap((child:any)=>find(child,tag))];
 const dialog=()=>find(body,'dialog')[0];
 const media=()=>find(dialog(),'video')[0]||find(dialog(),'img')[0];
 return {open:(index=0)=>find(root,'button')[index].onclick(),dialog,media,continuation:()=>find(dialog(),'p').find((p:any)=>p.className==='memory-media-continuation'),title:()=>find(dialog(),'h2')[0].textContent,button:(text:string)=>find(dialog(),'button').find((button:any)=>button.textContent===text)};
}

it('plays the next numbered part of the same interview, even across other media',()=>{
 const f=setup([video('Light Group interview — Part 1 of 3'),photo,video('Other video'),video('light group interview – Part 2 of 3'),video('Light Group interview — Part 3 of 3')]);
 f.open();expect(f.continuation().hidden).toBe(false);expect(f.continuation().children[0].tag).toBe('em');expect(f.continuation().children[0].textContent).toBe('(The next segment will play automatically when this one ends.)');const first=f.media();first.emit('ended');
 expect(f.title()).toBe('light group interview – Part 2 of 3');expect(f.media().play).toHaveBeenCalledOnce();
 expect(first.pause).toHaveBeenCalledOnce();expect(first.src).toBeUndefined();
 expect(f.continuation().hidden).toBe(false);
 f.media().emit('ended');expect(f.title()).toBe('Light Group interview — Part 3 of 3');expect(f.continuation().hidden).toBe(true);
 const final=f.media();final.emit('ended');expect(f.media()).toBe(final);
});

it.each([
 ['an unrelated video',[video('A video'),video('Another video')]],
 ['a different interview',[video('Alpha — Part 1 of 3'),video('Beta — Part 2 of 3')]],
 ['a different recording date',[video('Alpha — Part 1 of 3'),video('Alpha — Part 2 of 3','2026-10-14')]],
 ['a different total',[video('Alpha — Part 1 of 3'),video('Alpha — Part 2 of 4')]],
 ['a missing part',[video('Alpha — Part 1 of 3'),video('Alpha — Part 3 of 3')]],
 ['an ambiguous next part',[video('Alpha — Part 1 of 3'),video('Alpha — Part 2 of 3'),video('Alpha — Part 2 of 3')]],
 ['an ambiguous current part',[video('Alpha — Part 1 of 3'),video('Alpha — Part 1 of 3'),video('Alpha — Part 2 of 3')]],
 ['a photo with a matching title',[video('Alpha — Part 1 of 3'),{...photo,title:'Alpha — Part 2 of 3'}]],
 ['the end of an interview',[video('Alpha — Part 3 of 3'),video('Alpha — Part 1 of 3')]],
 ['an invalid part number',[video('Alpha — Part 0 of 3'),video('Alpha — Part 1 of 3')]],
])('does not auto-advance into %s',(_label,items)=>{
 const f=setup(items as any[]);f.open();expect(f.continuation().hidden).toBe(true);const current=f.media();current.emit('ended');expect(f.media()).toBe(current);
});

it('ignores old ended events after manual navigation or closing the popup',()=>{
 const f=setup([video('Alpha — Part 1 of 3'),photo,video('Alpha — Part 2 of 3')]);
 f.open();const first=f.media();f.button('Next →').onclick();first.emit('ended');expect(f.title()).toBe(photo.title);
 f.button('← Previous').onclick();first.emit('ended');expect(f.title()).toBe('Alpha — Part 1 of 3');
});

it('does not reopen a closed popup or auto-advance photos',()=>{
 const f=setup([photo,video('Alpha — Part 1 of 3'),video('Alpha — Part 2 of 3')]);
 f.open();expect(f.continuation().hidden).toBe(true);const image=f.media();image.emit('ended');expect(f.media()).toBe(image);
 f.button('Close').onclick();expect(f.dialog()).toBeUndefined();
 f.open(1);const current=f.media();f.button('Close').onclick();current.emit('ended');expect(f.dialog()).toBeUndefined();
});
