import sanitizeHtml from 'sanitize-html';
import {AdminError} from './admin';

// Email CSS is retained for responsive layouts. It is never inserted into the
// portal DOM: previews use an opaque-origin, scriptless sandbox with its own CSP.
export function newsletterHtml(value:unknown):string {
 if(typeof value!=='string'||!value.trim()||value.length>80000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
  throw new AdminError(422,'INVALID_NEWSLETTER','Choose or paste newsletter HTML of up to 80,000 characters.');
 const clean=sanitizeHtml(value,{
  allowedTags:[...sanitizeHtml.defaults.allowedTags,'html','head','body','title','meta','style','img','center','font'],
  allowedAttributes:{
   '*':['class','style','title','lang','dir','role','align','valign','width','height','bgcolor'],
   a:['href','title'],img:['src','alt','width','height','style','class'],
   table:['role','width','height','cellpadding','cellspacing','border','align','bgcolor','style','class'],
   td:['colspan','rowspan','width','height','align','valign','bgcolor','style','class'],
   th:['colspan','rowspan','scope','width','height','align','valign','bgcolor','style','class'],
   font:['color','size','face'],style:['type','media'],meta:['charset','name','content']
  },
  allowedSchemes:['https','mailto','tel'],allowedSchemesByTag:{img:['https']},
  allowProtocolRelative:false,allowVulnerableTags:true,
  nonTextTags:['script','textarea','option','noscript','iframe','object','svg','math'],
  exclusiveFilter:frame=>frame.tag==='meta'&&!['viewport','format-detection','x-apple-disable-message-reformatting'].includes((frame.attribs.name||'').toLowerCase())&&(frame.attribs.charset||'').toLowerCase()!=='utf-8',
  // Strip relative URLs too: an email has no meaningful application base URL.
  transformTags:{a:(_tag,attrs)=>({tagName:'a',attribs:{...attrs,href:/^(https:|mailto:|tel:)/i.test(attrs.href||'')?attrs.href:''}}),
   img:(_tag,attrs)=>({tagName:'img',attribs:{...attrs,src:/^https:\/\//i.test(attrs.src||'')?attrs.src:''}})}
 });
 if(!sanitizeHtml(clean,{allowedTags:[],allowedAttributes:{},nonTextTags:['style','title','head']}).trim())
  throw new AdminError(422,'INVALID_NEWSLETTER','Include readable newsletter content.');
 return clean;
}

export function withNewsletterFooter(html:string,footer:string):string {
 if(/<body(?:\s|>)/i.test(html)&&/<\/body\s*>/i.test(html))return '<!doctype html>'+html.replace(/<\/body\s*>/i,footer+'</body>');
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body>'+html+footer+'</body></html>';
}

export function newsletterPreviewResponse(html:string):Response {
 return new Response(html,{headers:{
  'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store, private',
  'Content-Security-Policy':"default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox",
  'X-Frame-Options':'SAMEORIGIN','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'
 }});
}
