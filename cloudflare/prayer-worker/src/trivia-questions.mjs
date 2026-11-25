// Keep IDs stable: display positions never identify questions or answers.
export const edition = 'prayer-challenge-1';
const bible = reference => ({label:reference,url:'https://www.biblegateway.com/passage/?search='+encodeURIComponent(reference)+'&version=KJV'});
function question(id,round,title,difficulty,prompt,choices,correct,explanation,source) {
  return {id,round,title,difficulty,parts:[{id:'main',prompt,choices:choices.map((text,i)=>({id:String(i),text})),correct:String(correct)}],explanation,source:typeof source==='string'?bible(source):source};
}
export const questions = [
 question('daily-bread',1,'Finish the prayer','Easy','In the Lord’s Prayer, what does Jesus teach us to ask for “this day”?',['Our daily strength','Our daily bread','Our daily wisdom','Our daily rest'],1,'Jesus includes everyday needs in the prayer he teaches.','Matthew 6:9–13'),
 question('daniel',1,'A dangerous prayer habit','Easy','Even after a royal decree made it dangerous, how many times a day did Daniel continue praying?',['Once','Twice','Three times','Seven times'],2,'Daniel continued kneeling, praying, and thanking God as he had before.','Daniel 6:10'),
 question('jonah',1,'An unusual prayer room','Easy','Who prayed to God from inside a fish?',['Jonah','Noah','Peter','Moses'],0,'Jonah’s prayer begins in a place few people would choose for quiet time!','Jonah 2:1'),
 question('hannah',1,'No sound required','Medium','Whose silent prayer was misunderstood by Eli because her lips moved but her voice could not be heard?',['Esther','Ruth','Sarah','Hannah'],3,'Hannah was pouring out her sorrow to God and asking for a son. Eli initially mistook her behavior for drunkenness.','1 Samuel 1:9–20'),
 question('thanksgiving',1,'What belongs with our requests?','Medium','According to Philippians 4, what should accompany our prayers and requests to God?',['A promise never to ask again','Thanksgiving','A public announcement','A particular time of day'],1,'Paul encourages believers to bring their requests to God with gratitude, then describes God’s peace guarding their hearts and minds.','Philippians 4:6–7'),
 question('withdraw',1,'Time away','Easy · True/False','Jesus withdrew to lonely places to pray.',['True','False'],0,'Luke describes Jesus withdrawing into the wilderness to pray.','Luke 5:16'),
 {...question('rhoda',1,'An answer at the gate','Challenging · Two parts','While believers were praying for imprisoned Peter, who recognized his voice after his escape?',['Lydia','Martha','Rhoda','Priscilla'],2,'Rhoda recognized Peter’s voice but ran to announce his arrival without opening the gate. While the others questioned her story, Peter kept knocking!','Acts 12:12–16'),
   parts:[{id:'person',prompt:'While believers were praying for imprisoned Peter, who recognized his voice after his escape?',choices:['Lydia','Martha','Rhoda','Priscilla'].map((text,i)=>({id:String(i),text})),correct:'2'},
     {id:'place',prompt:'In her excitement to tell everyone, where did she leave Peter waiting?',choices:['Outside the gate','Inside the kitchen','On the roof','In the prison courtyard'].map((text,i)=>({id:String(i),text})),correct:'0'}]},
 question('spirit',1,'When words won’t come','Medium','According to Romans 8, who helps us in our weakness when we do not know what to pray?',["God's Holy Spirit",'The high priest','The apostle Paul','The angels'],0,'Paul describes the Spirit helping us in our weakness and interceding according to God’s will.','Romans 8:26–27'),
 question('brain',1,'Your brain during prayer','Challenging · Research','In a 2009 brain-imaging study of Danish Christians, personal, improvised prayer engaged brain regions associated with which activity?',['Coordinating physical balance','Recognizing written words','Processing flavors','Thinking about other people’s minds and intentions'],3,'Researchers observed activity in regions associated with social cognition. They interpreted this as consistent with participants experiencing prayer as interaction with a personal God. This study examined people doing the praying, not unaware recipients of distant prayer.',{label:'Schjoedt and colleagues, 2009 · Social Cognitive and Affective Neuroscience',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC2686228/'}),
 question('breathing',1,'Prayer and breathing','Challenging · Research · True/False','In a small scientific study, rhythmic rosary prayer slowed participants’ breathing to about six breaths per minute.',['True','False'],0,'A 2001 study of 23 healthy adults found that rosary recitation—and a mantra comparison—slowed and regularized breathing to approximately six breaths per minute. Researchers also observed changes in cardiovascular rhythms. This studied people reciting the prayers, rather than people receiving prayer from others.',{label:'Bernardi and colleagues, 2001 · BMJ',url:'https://www.bmj.com/content/323/7327/1446'}),
 question('solomon',2,'A royal request','Easy','When God invited Solomon to ask for something, what did Solomon request?',['A larger kingdom',"Wisdom - Understanding to govern God's people",'A longer life','Victory over every enemy'],1,'Solomon asked for an understanding heart to judge the people and distinguish good from evil.','1 Kings 3:5–12'),
 question('nehemiah',2,'A prayer between sentences','Medium','Who prayed to God immediately after a king asked what he wanted, then requested permission to help rebuild Jerusalem?',['Ezra','Daniel','Nehemiah','Joseph'],2,'Before answering King Artaxerxes, Nehemiah prayed to the God of heaven.','Nehemiah 2:1–5'),
 question('elijah',2,'Weather and prayer','Medium','James names which prophet as someone who prayed earnestly that it would not rain, and later prayed again before rain returned?',['Elijah','Isaiah','Jeremiah','Ezekiel'],0,'James emphasizes that Elijah was a person like us, then describes his prayers concerning the drought and returning rain.','James 5:17–18'),
 question('hezekiah',2,'Fifteen more years','Challenging','Which king prayed with tears during a serious illness and received God’s promise of fifteen additional years of life?',['David','Josiah','Solomon','Hezekiah'],3,'God sent Isaiah to tell Hezekiah that he had heard his prayer and seen his tears.','Isaiah 38:1–5'),
 question('garden',2,'A garden prayer','Easy','In his prayer before his arrest, Jesus expressed which desire?',['That the disciples would make him king','That the Father’s will would be done','That Jerusalem would crown him immediately','That he would never face opposition'],1,'Jesus brought his anguish to the Father while submitting to the Father’s will.','Luke 22:39–42'),
 question('boldness',2,'Courage under pressure','Medium','After Peter and John were threatened, what did the gathered believers ask God to help them do?',['Keep their faith entirely secret','Become powerful government officials','Speak his word with boldness','Avoid speaking about Jesus again'],2,'Their prayer acknowledged the threats and asked for courage to continue speaking.','Acts 4:23–31'),
 question('cornelius',2,'A praying army officer','Challenging','Which Roman centurion is described as praying to God continually and giving generously to people in need?',['Cornelius','Julius','Claudius Lysias','Pontius Pilate'],0,'Acts introduces Cornelius as a devout centurion whose prayers and generosity were acknowledged by an angel.','Acts 10:1–4'),
 question('widow',2,'Keep coming back','Easy · True/False','Jesus told the parable of the persistent widow to teach his disciples to keep praying and not lose heart.',['True','False'],0,'Luke states that purpose at the beginning of the parable.','Luke 18:1–8'),
 question('heart',2,'An inside-out request','Medium','In Psalm 51, what does the prayer ask God to create within the person praying?',['A perfect memory','A fearless personality','A powerful voice','A clean heart'],3,'The verse also asks God to renew a right spirit within the person praying.','Psalm 51:10'),
 question('authorities',2,'Who belongs on the prayer list?','Medium · True/False','In 1 Timothy 2, Paul limits prayer to fellow believers and excludes kings and other authorities.',['True','False'],1,'Paul urges prayer for all people and specifically includes kings and those in authority.','1 Timothy 2:1–2')
];
export function shuffledIds(round) {
 const ids=questions.filter(q=>q.round===round).map(q=>q.id);
 for(let i=ids.length-1;i>0;i--) {
  const span=i+1,limit=Math.floor(0x100000000/span)*span;let value;
  do {value=crypto.getRandomValues(new Uint32Array(1))[0];} while(value>=limit);
  const j=value%span;[ids[i],ids[j]]=[ids[j],ids[i]];
 }
 return ids;
}
export const findQuestion=id=>questions.find(q=>q.id===id);
export function publicQuestion(id) {
 const q=findQuestion(id);
 return {id:q.id,title:q.title,difficulty:q.difficulty,parts:q.parts.map(({id,prompt,choices})=>({id,prompt,choices}))};
}
export function feedbackFor(id,answers) {
 const q=findQuestion(id);
 return {question_id:id,title:q.title,parts:q.parts.map(p=>({id:p.id,prompt:p.prompt,correct:answers[p.id]===p.correct,answer:p.choices.find(c=>c.id===p.correct).text,selected:p.choices.find(c=>c.id===answers[p.id]).text})),explanation:q.explanation,source:q.source};
}
export function scoreAnswers(answers) {
 return answers.reduce((total,a)=>{const q=findQuestion(a.question_id);return total+q.parts.reduce((sum,p)=>sum+(a.choices[p.id]===p.correct?10/q.parts.length:0),0);},0);
}
