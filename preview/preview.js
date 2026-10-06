(() => {
  'use strict';
  const stories = {
    red: {
      title: 'The red juice box', chapter: 'Chapter 1', other: 'john', otherLabel: 'Meet John',
      scenes: [
        ['The streets kept introducing us to people.', 'An evening in Athens', 'the walk is already underway', '<p>The heat still rose from the pavement. A scooter slipped between two cars. Between the buildings, the Acropolis appeared, then slipped out of view again.</p><p>There were twelve of us walking that night. In my hand, a canvas bag: sandwiches, snacks, and juice boxes.</p><p>Every few blocks, someone stopped to talk. Relationships set the rhythm.</p>', 'Keep walking'],
        ['Then a woman stood in front of me.', 'A moment on the street', 'a sandwich, a snack, a drink', '<p>She was speaking quickly, her hands moving as much as her voice. We didn’t understand each other.</p><p>I handed her a sandwich, a snack, and a juice box. She accepted the food. Then she looked at the drink, shook her head, and pushed it back.</p><p>I tried again. She pointed inside the bag.</p>', 'Stay with the moment'],
        ['“She wants a red juice box.”', 'Artur helped me understand', 'blue, blue, nothing else', '<p>I looked again. Blue, blue, nothing else.</p><p>Artur explained. She was still frustrated. Finally, she took only the sandwich and walked away.</p><p>I stood there with the juice box in my hand. A quiet old thought slipped in.</p><blockquote>Sometimes you just get what you get…</blockquote>', 'Walk on with me'],
        ['“You all are not gonna believe…”', 'Later, back at the apartment', 'the story I thought I was telling', '<p>Back at the apartment, stories moved around the room. Who did you meet? What was it like?</p><p>I told them about the woman. The language barrier. The drink I couldn’t give her. I thought I was about to tell the strangest story in the room.</p><p>Amanda had been listening.</p>', 'Listen to Amanda'],
        ['“Brent… she wanted a red juice box.”', 'A different way of seeing', 'she had a preference, too', '<p>I gave a little laugh. Of course I knew that.</p><p>Amanda didn’t move on. Same gentle voice. She said my name and stopped.</p><p>In that pause, I began to see the person I had missed. A woman with her own preferences. I had been so focused on what I could give her.</p><blockquote>“She just wanted a red juice box.”</blockquote>', 'Take a moment'],
        ['What stays with you?', 'A pause before the next step', 'still learning to see', '<p>I had always thought compassion was mainly about doing, serving, helping, fixing.</p><p>And suddenly I saw that before any of that, there’s just noticing. Actually seeing a person.</p>', 'Meet John', true]
      ]
    },
    john: {
      title: 'An evening with John', chapter: 'Chapter 2', other: 'red', otherLabel: 'The red juice box',
      scenes: [
        ['There was room on the bench.', 'An evening in the park', 'twenty minutes to sit', '<p>We followed Artur into the park as the evening light began to thin. At one bench, he introduced me to a man named John.</p><p>John was from England. He had lived in Greece for about thirty years.</p><p>Artur offered to finish the walk with the team and come back for me in twenty minutes.</p>', 'Sit beside John'],
        ['I enjoyed talking with John.', 'The first evening', 'ordinary conversation', '<p>We talked about ordinary things. A little about himself. A little about England.</p><p>There was no great unfolding of his life that evening. Just the sort of conversation two people have when they have met and find they enjoy talking.</p><p>The team came back. It was time to go.</p>', 'The next evening'],
        ['The next night wasn’t my turn.', 'A reason to return', 'I asked to go anyway', '<p>I kept thinking about the park. We had barely begun talking. I wanted a little more time.</p><p>With Artur’s agreement, I went ahead to the bench.</p><p>John was there. He was surprised I had come back. Pleased, too.</p><blockquote>I sat down again.</blockquote>', 'Stay a little longer'],
        ['The bench was his office.', 'About an hour together', 'a life, beyond the first impression', '<p>That was what he called it. He usually had a novel to read. He had a routine, places to go, ways of getting through each day.</p><p>Little by little, he told me more. England. Marriage. His daughter and granddaughter, whose lives he was no longer part of. That hurt him.</p><p>There was still so much I didn’t know. I stayed and listened.</p>', 'When it was time to go'],
        ['“Take care of yourself.”', 'The words that stayed with me', 'more than someone passing by', '<p>When the team returned, I shook John’s hand. I told him I would try to come back. I couldn’t promise when.</p><p>Until then, I said, take care of yourself.</p><p>He looked at me.</p><blockquote>“Brent, the problem isn’t taking care of myself.”<br><br>“The problem is loneliness.”</blockquote>', 'Let that stay a moment'],
        ['Who might you sit beside?', 'An invitation to carry with you', 'there is room for someone else', '<p>John’s words are where this chapter ends.</p><p>Perhaps there’s someone in your own life you’d like to give a little more time. Someone whose story you have only begun to hear.</p>', 'The red juice box', true]
      ]
    }
  };
  const carton = '<span class="carton" aria-hidden="true"><i></i><b>juice</b><span>●</span></span>';
  const bench = '<span class="bench" aria-hidden="true"><i></i><i></i><i></i><b></b><b></b></span>';
  const reflectionChoices = {
    red: [['Noticing my assumptions', 'The next time an encounter surprises you, you could pause and ask what you haven’t understood yet.'], ['Asking before helping', '“What would you like?” can make space for the person in front of you to answer for themselves.'], ['Making room to listen', 'You don’t have to resolve the whole encounter. A little more attention may be a place to begin.']],
    john: [['Someone I already know', 'A message, a call, or a little unhurried time could be your next invitation.'], ['Someone I pass every day', 'You might begin with a greeting, and leave room for a conversation if they want one.'], ['I’m still thinking', 'You can leave the question open. There is no deadline for what you take from this story.']]
  };
  const container = document.getElementById('story-pages');
  for (const [key, story] of Object.entries(stories)) {
    story.scenes.forEach((scene, i) => {
      const [title, eyebrow, note, prose, nextLabel, last] = scene;
      const id = `${key}-${i+1}`;
      const progress = story.scenes.map((_, n) => `<a href="#${key}-${n+1}" aria-label="${story.title}, moment ${n+1}" ${n===i?'aria-current="step"':''}></a>`).join('');
      const reflection = last ? `<section class="reflection" aria-label="Optional reflection"><h3>${key==='red'?'What would you like to carry with you?':'Where does this invitation lead you?'}</h3><div class="reflection-options">${reflectionChoices[key].map(([label],n)=>`<button type="button" data-reflection="${key}:${n}" aria-pressed="false">${label}</button>`).join('')}</div><p class="reflection-response" aria-live="polite"></p><p class="reflection-note">A moment for you. Your choice isn’t saved or sent.</p></section>` : '';
      container.insertAdjacentHTML('beforeend', `<section class="story-view" id="${id}" data-view hidden aria-labelledby="title-${id}"><div class="story-topbar"><a href="#encounters">← Both stories</a><div class="progress" aria-label="Story moments">${progress}<span class="progress-label">${i+1} / 6</span></div></div><div class="story-layout"><aside class="scene-art ${key}" aria-label="${key==='red'?'Illustration of a red juice box':'Illustration of an empty park bench'}">${key==='red'?carton:bench}<p class="scene-note">${note}</p><span class="scene-place">Athens, Greece · ${story.chapter}</span></aside><div class="story-copy"><p class="overline">${eyebrow}</p><h2 id="title-${id}" tabindex="-1">${title}</h2><div class="story-prose">${prose}</div>${reflection}<div class="story-controls"><a class="back-link" href="#${i===0?'encounters':`${key}-${i}`}">${i===0?'Choose a story':'Previous moment'}</a><a class="solid-link" href="#${last?`${story.other}-1`:`${key}-${i+2}`}">${nextLabel} <span aria-hidden="true">→</span></a></div>${last?'<p class="byline"><a class="back-link" href="https://hopesojourns.com/">Explore the journeys with Hope Sojourns ↗</a></p>':''}</div></div><div class="chapter-source"><span>${story.title} · Adapted from Brent Kern’s book manuscript</span><span>${last?'Reflection prompts are invitations for the reader.':'Take your time. There is no timer.'}</span></div></section>`);
    });
  }
  document.querySelectorAll('[data-reflection]').forEach(button => button.addEventListener('click', () => {
    const [key, n] = button.dataset.reflection.split(':');
    const section = button.closest('.reflection');
    section.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item===button)));
    section.querySelector('.reflection-response').textContent = reflectionChoices[key][Number(n)][1];
  }));
  const originalTitle = document.title;
  function navigate(focus) {
    const hash = location.hash.slice(1);
    const target = document.getElementById(hash);
    const view = target?.matches('[data-view]') ? target : document.getElementById('home');
    document.querySelectorAll('[data-view]').forEach(item => { item.hidden = item!==view; });
    document.title = view.id==='home' ? originalTitle : `${stories[view.id.split('-')[0]].title} • Hope Sojourns`;
    if (hash==='encounters') {
      document.getElementById('encounters').scrollIntoView({behavior:'instant'});
      if(focus) {const heading=document.getElementById('encounter-title');heading.tabIndex=-1;heading.focus({preventScroll:true});}
    } else {
      window.scrollTo({top:0,behavior:'instant'});
      if(focus) view.querySelector('h1,h2')?.focus({preventScroll:true});
    }
  }
  window.addEventListener('hashchange',()=>navigate(true));
  navigate(false);
})();
