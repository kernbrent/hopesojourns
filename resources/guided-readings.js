(() => {
 const scenes=[...document.querySelectorAll('.guided-scene')];
 function navigate(focus=false){
  const selected=scenes.find(scene=>`#${scene.id}`===location.hash)||scenes[0];
  scenes.forEach(scene=>{scene.hidden=scene!==selected;});
  if(focus){selected.querySelector('h1').focus({preventScroll:true});selected.scrollIntoView({block:'start',behavior:'instant'});}
 }
 addEventListener('hashchange',()=>navigate(true));
 document.querySelectorAll('[data-response]').forEach(button=>button.addEventListener('click',()=>{
  const area=button.closest('.guided-reflection');
  area.querySelectorAll('button').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  area.querySelector('.guided-response').textContent=button.dataset.response;
 }));
 navigate();
})();
