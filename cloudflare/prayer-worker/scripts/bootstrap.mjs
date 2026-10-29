// Local-only provisioning. Read secrets from stdin; never put passwords in arguments.
import { readFileSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { passwordHash } from '../src/index.mjs';
const data = JSON.parse(readFileSync(0, 'utf8'));
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || '') || !data.name?.trim() || data.password?.length < 12 || data.password?.length > 128) throw new Error('Supply email, name and a 12–128 character password as JSON on stdin.');
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
mkdirSync('.wrangler', { recursive: true });
const file = '.wrangler/bootstrap.sql';
writeFileSync(file, `INSERT INTO users VALUES (${[crypto.randomUUID(),data.email.toLowerCase(),data.name.trim(),await passwordHash(data.password),'admin',Date.now()].map(quote).join(',')});`);
try {
  const result = spawnSync(process.execPath, ['../interest-worker/node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--file',file], { stdio: ['ignore','pipe','pipe'] });
  if (result.status) throw new Error('Local admin provisioning failed. Confirm local migrations have run and this email is not already registered.');
  console.log('Local admin created.');
} finally { unlinkSync(file); }
