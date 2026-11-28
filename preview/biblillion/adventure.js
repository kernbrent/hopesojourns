// Authored reflections and question connections, not simulated host testimony.
export const ADVENTURE='journey-v1';
export const THEMES=[
 {id:'welcome',title:'Make room for someone',ref:'Romans 12:13',match:/welcome|community|belong|family|woman|person|groups|church|city|home/,story:'Imagine arriving where you know nobody. Someone learns your name, makes room at the table and waits for your story. A small welcome can change the whole day.',action:'Learn someone’s name today and invite them into a conversation.'},
 {id:'listen',title:'Leave room to listen',ref:'James 1:19',match:/prayer|pray|lonel|listen|language|david|moses|parable|privacy|need/,story:'Imagine putting your plans aside long enough to ask a second question. The conversation changes when you stop preparing your reply and begin hearing the person.',action:'Ask someone a question, then give their answer your full attention.'},
 {id:'courage',title:'Take one faithful step',ref:'Joshua 1:9',match:/journey|travel|transport|king|miracle|easter|desert|mountain|safety|refuge/,story:'Imagine a first step into an unfamiliar place. You do not know everything yet. You can still ask for guidance, learn from your hosts and take the next small step with care.',action:'Take one small step toward a conversation or act of service you have been putting off.'},
 {id:'care',title:'Notice what someone needs',ref:'Philippians 2:4',match:/care|food|drink|water|fruit|plant|pack|kit|health|coat|kind|body|job|material/,story:'Imagine offering what you brought, then asking what would actually help. The answer may be practical, relational or something you had not considered. Care begins with attention.',action:'Ask what would be helpful before offering someone practical help.'},
 {id:'wonder',title:'See familiar things afresh',ref:'Psalm 19:1',match:/color|number|animal|bird|creation|weather|book|metal|sea|continent|country|world/,story:'Imagine slowing down on a familiar walk. A color, a creature or an ordinary conversation catches your attention. Curiosity can make room for gratitude and a new question.',action:'Notice one ordinary thing today and thank God for it.'}
];
export const themeFor=id=>THEMES.find(t=>t.id===id)||THEMES[0];
export function questionThemes(q){const tags=THEMES.filter(t=>t.match.test(q.id+' '+q.category.toLowerCase())).map(t=>t.id);return tags.length?tags:[q.topic==='care'?'care':q.topic==='geography'?'courage':'wonder'];}
export function themeForSeed(seed){let n=0;for(const c of seed)n=(n*31+c.charCodeAt(0))>>>0;return THEMES[n%THEMES.length].id;}
const sources={spanish:'https://www.spanishdict.com/translate/gracias',greek:'https://www.uoc.gr/intrel/images/infopack_5.4.2017.pdf',swahili:'https://www.swahili.academy/word.php?code=asante',british:'https://dictionary.cambridge.org/grammar/british-grammar/thank-you',southern:'https://dictionary.cambridge.org/us/dictionary/english/y-all',belize:'https://losangelesconsulate.mfa.gov.bz/about-belize/'};
const phrase=(language,words,meaning,say,source,note)=>({language,words,meaning,say,source,note});
const spanish=phrase('Spanish','Gracias','Thank you','GRAH-syahs',sources.spanish,'A simple way to show appreciation. Local pronunciation varies.');
const swahili=phrase('Swahili','Asante','Thank you','ah-SAHN-teh',sources.swahili,'A useful expression in Kenya and Tanzania; many other languages are spoken there too.');
export const PHRASES={
 'mexico-city':spanish,'camino-de-santiago':spanish,
 athens:phrase('Greek','Ευχαριστώ · Efcharistó','Thank you','ef-khah-ree-STOH',sources.greek,'The kh sound is approximate. Invite a local speaker to help you practice.'),
 kenya:swahili,kilimanjaro:swahili,
 halifax:phrase('British English','Cheers!','Thanks!','cheerz',sources.british,'An informal thank-you in everyday conversation. Context matters.'),
 belize:phrase('Belize Kriol','Gud maanin!','Good morning!','good MAHN-in',sources.belize,'One local greeting. English is Belize’s official language; Kriol spelling and pronunciation vary.'),
 soto:phrase('Southern US English','Y’all','You all','yawl',sources.southern,'An informal way of addressing a group: “Glad y’all are here.”'),
 other:phrase('English','Much appreciated','Thank you','much uh-PREE-shee-ay-tid',sources.british,'Begin with gratitude, then ask your hosts how they would say it locally.')
};
export const CLOUD_MIN=25;
export function editorialRanking(q){return [...q.answers].sort((a,b)=>a.points-b.points).map(a=>a.name);}
export function cloudModel(q,data){const live=data?.source==='live'&&data.contributors>=CLOUD_MIN;const rows=(live||data?.source==='editorial')&&Array.isArray(data?.answers)?data.answers:editorialRanking(q).map((answer,i)=>({answer,count:Math.max(1,q.answers.length-i)}));return {live,contributors:live?data.contributors:0,answers:rows.filter(r=>q.answers.some(a=>a.name===r.answer)&&Number.isFinite(r.count)&&r.count>0).slice(0,30)};}
