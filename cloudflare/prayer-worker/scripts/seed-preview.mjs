// Synthetic data for the isolated LOCAL database only. No remote mode exists.
import { mkdirSync,writeFileSync,unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { passwordHash } from '../src/index.mjs';
const quote = value => `'${String(value).replaceAll("'","''")}'`;
const stored = await passwordHash('local-preview-only-2026');
const time = Date.now();
const users = [['preview-admin','Preview Admin','admin'],['preview-anna','Anna Mitchell','member'],['preview-daniel','Daniel Carter','member'],['preview-ruth','Ruth Bennett','member'],['preview-james','James Wilson','member'],['preview-michael','Michael Brooks','member']];
let sql = users.map(([id,name,role]) => `INSERT OR IGNORE INTO users (id,email,name,password,role,created_at) VALUES (${[id,`${id}@example.invalid`,name,stored,role,time].map(quote).join(',')});`).join('\n');
for (const [i,author,title,body,kind,audience] of [
  [1,'preview-anna','Peace for the next step','Our family is stepping into a new season. Would you pray for clarity, patience, and the courage to trust God one day at a time?','request','members'],
  [2,'preview-daniel','A door opened this week','Thank you for praying alongside us. We had a wonderful conversation with our ministry partners and have a clear next step. Grateful for this community.','update','members'],
  [3,'preview-ruth','Grateful for answered prayer','The conversation we were worried about brought understanding and a fresh beginning. Thank you for holding our family in prayer.','answered','members'],
  [4,'preview-anna','A private family prayer','This synthetic request demonstrates the admins-only audience. Members other than the author cannot see this post.','request','admins']
]) sql += `\nINSERT OR IGNORE INTO posts (id,author_id,title,body,kind,audience,created_at) VALUES (${[`preview-post-${i}`,author,title,body,kind,audience,time-i*3600000].map(quote).join(',')});`;
for (const [id,name,description,category,owner] of [
  ['preview-men','Men’s Accountability','A place to walk honestly, encourage one another, and pray through our weekly commitments.','accountability','preview-james'],
  ['preview-partners','Prayer Partners','Praying together for our families, ministry, and the people we serve.','partners','preview-admin']
]) sql += `\nINSERT OR IGNORE INTO groups VALUES (${[id,name,description,category,1,owner,time].map(quote).join(',')});`;
for (const [group,person,status] of [['preview-men','preview-james','approved'],['preview-men','preview-daniel','approved'],['preview-men','preview-admin','approved'],['preview-men','preview-michael','pending'],['preview-partners','preview-admin','approved'],['preview-partners','preview-ruth','approved']]) {
  sql += `\nINSERT OR IGNORE INTO group_members (group_id,user_id,status,requested_at) VALUES (${[group,person,status,time].map(quote).join(',')});`;
}
sql += `\nINSERT OR IGNORE INTO posts (id,author_id,title,body,kind,audience,created_at,group_id) VALUES (${['preview-group-prayer','preview-james','Staying faithful in the small things','Synthetic preview: let’s pray for honesty, consistency, and the courage to ask for support this week.','request','members',time,'preview-men'].map(quote).join(',')});`;
mkdirSync('.wrangler',{recursive:true}); const file = '.wrangler/preview-seed.sql'; writeFileSync(file,sql);
try {
  const result = spawnSync(process.execPath,['../interest-worker/node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--file',file],{stdio:['ignore','pipe','pipe']});
  if(result.status) throw new Error('Could not seed the local preview. Run local migrations first.');
  console.log('Synthetic LOCAL preview accounts created. Sign in: preview-admin@example.invalid / local-preview-only-2026');
} finally { unlinkSync(file); }
