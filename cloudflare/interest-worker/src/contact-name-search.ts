// Shared by the existing family/spouse search and meeting entity pickers.
const normalized=(v:string)=>v.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}@+. ]/gu,' ').replace(/\s+/g,' ').trim();
function distance(a:string,b:string){const row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let previous=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const old=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,previous+Number(a[i-1]!==b[j-1]));previous=old;}}return row[b.length];}
export function contactNameScore(query:string,name:string,details=''){
 const q=normalized(query),n=normalized(name);if(!q)return null;if(n===q)return 0;if(n.includes(q))return 1;if(normalized(details).includes(q))return 2;
 const tokens=q.split(' '),names=n.split(' ');if(tokens.length>6)return null;
 let score=3;for(const token of tokens){const best=Math.min(...names.map(part=>part.startsWith(token)?0:distance(token,part)));const limit=token.length>=7?2:token.length>=4?1:0;if(best>limit)return null;score+=best;}return score;
}
