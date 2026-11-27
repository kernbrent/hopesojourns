// Local prototype only. Exact allowlist excludes private documents and APIs.
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const testBuild=process.argv.includes('--test-build');
const root=path.resolve(__dirname,'..',...(testBuild?['site-dist-biblillion-test']:[])),prefix=testBuild?'/biblillion/':'/preview/biblillion/';
const files=new Set(['/styles.css','/assets/hope-sojourns-logo.png','/assets/hope-sojourns-icon.png',...['index.html','game.css','game.js','content.js','engine.js','expanded-bank.js','destinations.js','analytics.js','passport.js','general-bank.js','question-settings.js','rewards.js','timer.js','passport.css','friendly-bank.js','mission-bank.js','country-areas.js','open-ended.js'].map(f=>prefix+f)]);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json','.ico':'image/x-icon','.woff2':'font/woff2'};
http.createServer(async(req,res)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 let route;try{route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
 if(!testBuild&&(route==='/'||route==='/preview/biblillion')){res.writeHead(302,{Location:prefix});res.end();return;}
 if(route.endsWith('/'))route+='index.html';
 if(!testBuild&&!files.has(route)&&!/^\/assets\/[a-z0-9/._-]+\.(png|jpg|jpeg|webp)$/i.test(route)){res.writeHead(404);res.end('Biblillion local preview only.');return;}
 const file=path.resolve(root,route.slice(1)),relative=path.relative(root,file);
 if(relative.startsWith('..')||path.isAbsolute(relative)||!mime[path.extname(file)]){res.writeHead(404);res.end();return;}
 try{const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]});res.end(req.method==='HEAD'?undefined:body);}catch{res.writeHead(404);res.end();}
}).listen(testBuild?4195:4194,'127.0.0.1',()=>console.log(`Biblillion: http://localhost:${testBuild?4195:4194}${prefix}`));
