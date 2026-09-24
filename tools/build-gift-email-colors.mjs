import {readFileSync,writeFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const css=readFileSync(new URL('styles.css',root),'utf8').split(':root {')[1].split('\n}')[0];
const colors=Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6});/g)].map(m=>[m[1],m[2]]));
writeFileSync(new URL('cloudflare/interest-worker/src/gift-email-colors.ts',root),'// Generated from styles.css by tools/build-gift-email-colors.mjs. Do not edit.\nexport const emailColors = '+JSON.stringify(colors,null,2)+' as const;\n');
