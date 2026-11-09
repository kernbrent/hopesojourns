import {expect,it} from 'vitest';
import {newsletterHtml,withNewsletterFooter} from '../src/contact-email-html';

it('removes active markup, redirects, protocol-relative and encoded dangerous URLs while retaining email layout',()=>{
 const html=newsletterHtml('<html><head><meta http-equiv="refresh" content="0;url=https://evil.test"><base href="https://evil.test"><style>.a{padding:1px}</style></head><body onload="alert(1)"><svg><a href="javascript:alert(1)">bad</a></svg><object>bad</object><a href="jav&#x61;script:alert(1)">One</a><a href="//evil.test">Two</a><img src="/private/path"><img src="data:image/svg+xml,evil"><a href="mailto:hello@example.test">Email</a><table role="presentation" cellpadding="0"><tr><td colspan="2">Hello</td></tr></table></body></html>');
 for(const unsafe of ['http-equiv','<base','onload','<svg','<object','javascript:','//evil.test','/private/path','data:image'])expect(html).not.toContain(unsafe);
 expect(html).toContain('mailto:hello@example.test');expect(html).toContain('role="presentation"');expect(html).toContain('colspan="2"');expect(html).toContain('<style>.a{padding:1px}</style>');
});
it('inserts the standard footer inside a full document or wraps a fragment',()=>{
 expect(withNewsletterFooter('<html><body><p>Hello</p></body></html>','<p>Footer</p>')).toContain('<p>Hello</p><p>Footer</p></body>');
 expect(withNewsletterFooter('<p>Hello</p>','<p>Footer</p>')).toContain('<body><p>Hello</p><p>Footer</p></body>');
});
it('retains safe mobile email metadata without permitting redirects or custom policies',()=>{
 const html=newsletterHtml('<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=https://evil.test"><meta http-equiv="Content-Security-Policy" content="script-src *"></head><body><p>Welcome</p></body></html>');
 expect(html).toContain('name="viewport"');expect(html).toContain('charset="utf-8"');expect(html).not.toContain('http-equiv');expect(html).not.toContain('evil.test');expect(html).not.toContain('script-src');
});
