// End-of-round travel rewards. These are game points, never actual travel benefits.
export const ARRIVAL_TIERS=[
 {min:575,id:'first-class',title:'First-class upgrade!',bonus:150,icon:'✦',motion:'confetti',message:'Your curiosity earned the best seat in the game. Stretch out, enjoy the view, and keep exploring.'},
 {min:450,id:'priority',title:'Priority boarding!',bonus:100,icon:'✧',motion:'confetti',message:'You are first in line for a new discovery. Your destination is calling.'},
 {min:300,id:'on-time',title:'Right on schedule.',bonus:50,icon:'↗',motion:'flight',message:'A smooth connection and a fresh horizon. Bring what you learned along for the journey.'},
 {min:175,id:'connection',title:'Connection made!',bonus:25,icon:'➜',motion:'footsteps',message:'A quick dash through the terminal and you made it. There is always another discovery ahead.'},
 {min:0,id:'layover',title:'Unexpected layover.',bonus:0,icon:'◷',motion:'layover',message:'A little extra time to explore. Grab a window seat, revisit a discovery, and try another practice flight.'}
];
export const arrivalForPoints=points=>ARRIVAL_TIERS.find(t=>points>=t.min);
