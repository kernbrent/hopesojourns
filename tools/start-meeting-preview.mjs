import {build} from '../cloudflare/interest-worker/node_modules/esbuild/lib/main.js';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=fileURLToPath(new URL('../cloudflare/interest-worker/test/.meetings-preview.mjs',import.meta.url));
await build({entryPoints:[fileURLToPath(new URL('./meeting-dev-server.ts',import.meta.url))],outfile:output,bundle:true,platform:'node',format:'esm',external:['cloudflare:workers'],alias:{'cloudflare:workers':fileURLToPath(new URL('../cloudflare/interest-worker/test/worker-entrypoint-shim.ts',import.meta.url))}});
const child=spawn(process.execPath,[output],{cwd:root,stdio:'inherit'});child.on('exit',code=>process.exit(code||0));
