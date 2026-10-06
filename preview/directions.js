(() => {
  const responses = {
    travel: ['Start with a possibility','There’s a place<br>to bring your questions.','Explore the journeys, then talk with us about your interests and the opportunities taking shape.','#journeys','Explore the journeys →'],
    people: ['Meet the ministry','People are at the heart<br>of the invitation.','Get to know Hope Sojourns, our Christian faith, and our commitment to serving alongside local ministries.','#approach','Get to know us →'],
    story: ['An evening in Athens','It began with<br>a red juice box.','Walk with Brent into an encounter that stayed with him long after the evening was over.','#red-story','Read the story →']
  };
  document.querySelectorAll('[data-path]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-path]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    const [label,title,copy,href,action]=responses[button.dataset.path];
    const panel=document.querySelector('.path-answer>div');
    panel.innerHTML=`<p class="eyebrow">${label}</p><h2>${title}</h2><p>${copy}</p><a class="primary" href="${href}">${action}</a>`;
  }));
  function openLinkedStory(){
    const story = document.getElementById(location.hash.slice(1));
    if(story?.matches('details.encounter')){story.open=true;story.scrollIntoView({behavior:'instant',block:'start'});}
  }
  window.addEventListener('hashchange',openLinkedStory);openLinkedStory();
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href^="#"]');
    if(link?.hash && document.getElementById(link.hash.slice(1))?.matches('details.encounter')){
      document.getElementById(link.hash.slice(1)).open=true;
      if(location.hash===link.hash) openLinkedStory();
    }
  });
  document.querySelectorAll('.close-story').forEach(b=>b.addEventListener('click',()=>{const d=b.closest('details');d.open=false;d.querySelector('summary').focus();d.scrollIntoView({behavior:'instant',block:'start'});}));
})();
