// Publish only the two guided readings from the unused story redesign.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const root=path.resolve(import.meta.dirname,'..');
const source=fs.readFileSync(path.join(root,'preview/preview.js'),'utf8');
const literal=(name,next)=>source.slice(source.indexOf(`const ${name} = `)+`const ${name} = `.length,source.indexOf(`\n  const ${next}`)).trim().replace(/;$/,'');
const stories=vm.runInNewContext(`(${literal('stories','carton')})`);
const choices=vm.runInNewContext(`(${literal('reflectionChoices','container')})`);
const routes={red:'red-juice-box',john:'john-on-a-bench'};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
for(const [key,story] of Object.entries(stories)){
 const route=routes[key];
 const scenes=story.scenes.map(([title,eyebrow,note,prose,nextLabel,last],i)=>{
  const reflection=last?`<section class="guided-reflection" aria-label="Optional reflection"><h3>${key==='red'?'What would you like to carry with you?':'Where does this invitation lead you?'}</h3><div class="guided-choices">${choices[key].map(([label,response])=>`<button type="button" aria-pressed="false" data-response="${esc(response)}">${esc(label)}</button>`).join('')}</div><p class="guided-response" aria-live="polite"></p><p class="guided-small">A moment for you. Your choice is not saved or sent.</p></section>`:'';
  return `<section class="guided-scene" id="moment-${i+1}" aria-labelledby="title-${i+1}"><div class="guided-progress"><span>${esc(story.title)} | ${i+1} / 6</span><nav aria-label="Story moments">${story.scenes.map((_,n)=>`<a href="#moment-${n+1}"${n===i?' aria-current="step"':''} aria-label="Moment ${n+1}">${n+1}</a>`).join('')}</nav></div><div class="guided-layout"><figure><img src="/assets/story-${key==='red'?'red-juice':'park-bench'}-realistic.png" alt="${key==='red'?'A red juice box on a stone ledge at dusk':'An empty bench beside an olive-lined path at dusk'}"><figcaption>Story illustration - AI-created, not a photograph of the encounter.</figcaption><p>${esc(note)}</p></figure><div class="guided-copy"><p class="eyebrow">${esc(eyebrow)}</p><h1 id="title-${i+1}" tabindex="-1">${title}</h1><div class="guided-prose">${prose}</div>${reflection}<nav class="guided-controls" aria-label="Continue reading">${i?`<a href="#moment-${i}">Previous moment</a>`:'<a href="/resources/">Back to Resources</a>'}<a class="button" href="${last?`/resources/${routes[story.other]}/`:`#moment-${i+2}`}">${esc(nextLabel)} &rarr;</a></nav>${last?'<p class="guided-small"><a href="/resources/do-you-see-me/">Explore the companion article, music, and sermon</a></p>':''}</div></div></section>`;
 }).join('\n');
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(story.title)} | Guided reading | Hope Sojourns</title><meta name="description" content="A six-moment guided reading with Brent Kern, from Athens to a different way of seeing. Read at your own pace and reflect."><link rel="canonical" href="https://hopesojourns.com/resources/${route}/"><link rel="icon" href="/assets/hope-sojourns-icon.png"><link rel="stylesheet" href="/styles.css?v=26"><link rel="stylesheet" href="/resources/guided-readings.css?v=20261104"><script src="/script.js?v=2026-10-18.3" defer></script><script src="/resources/guided-readings.js?v=20261104" defer></script></head><body class="guided-reading"><main id="main"><div class="guided-intro"><p class="eyebrow">Guided reading | Athens, Greece</p><p>Adapted from Brent Kern's book manuscript. Six moments. Read at your own pace.</p><a href="/resources/">All resources</a> &middot; <a href="/resources/${routes[story.other]}/">${esc(stories[story.other].title)}</a></div>${scenes}<noscript><p>All six moments appear below one another when JavaScript is disabled.</p></noscript></main></body></html>`;
 const dest=path.join(root,'resources',route);fs.mkdirSync(dest,{recursive:true});fs.writeFileSync(path.join(dest,'index.html'),html);
}
console.log('Built both guided readings from the original six-moment story content.');
