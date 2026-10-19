"""Build a deterministic public-only text catalog, without fetching external URLs.

Uses the site's explicit build allowlist. Never scan admin, traveler, preview,
FAQ/AI output, private guides, arbitrary uploads, or unlinked local documents.
"""
import hashlib, json, re, sys, zipfile
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
from xml.etree import ElementTree

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'cloudflare/interest-worker/src/knowledge-site-content.ts'
EXCLUDED={'admin','journey','trip-account','faq','knowledge','logo-explorations','outputs'}

def input_digest(path):
    data=path.read_bytes()
    # Git checkouts can use CRLF while release archives use LF. Text is the same
    # public evidence in either form; binary documents still require exact bytes.
    if path.suffix.lower() in {'.html','.json','.txt'}:data=data.replace(b'\r\n',b'\n')
    return hashlib.sha256(data).hexdigest()

class PublicPage(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.stack=[];self.text=[];self.title=[];self.links=[];self.noindex=False
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='meta' and a.get('name','').lower()=='robots' and 'noindex' in a.get('content','').lower():self.noindex=True
        if tag=='a' and a.get('href'):self.links.append(a['href'])
        if tag not in {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}:self.stack.append(tag)
        if tag=='img' and 'main' in self.stack and a.get('alt'):self.text.append(' '+a['alt']+' ')
        if tag in {'p','div','section','article','h1','h2','h3','li','br'}:self.text.append('\n')
    def handle_endtag(self,tag):
        if tag in self.stack:self.stack=self.stack[:len(self.stack)-1-self.stack[::-1].index(tag)]
        if tag in {'p','h1','h2','h3','li'}:self.text.append('\n')
    def handle_data(self,data):
        if 'title' in self.stack:self.title.append(data)
        if 'main' in self.stack and not set(self.stack)&{'script','style','nav','form','button','noscript','template'}:self.text.append(data)

def chunks(text,limit=5000):
    paragraphs=[' '.join(p.split()) for p in text.splitlines() if p.strip()]
    block=''
    for p in paragraphs:
        if len(block)+len(p)>limit and block:yield block;block=''
        while len(p)>limit:
            cut=p.rfind(' ',0,limit) or limit;yield p[:cut];p=p[cut:].strip()
        block+=(('\n' if block else '')+p)
    if block:yield block

def build():
    config=(ROOT/'cloudflare/build-test-site.mjs').read_text(encoding='utf-8')
    entries=re.findall(r'"([^"\n]+)"',config.split('const publicEntries = [',1)[1].split('];',1)[0])
    entry_roots={e.split('/')[0] for e in entries}-EXCLUDED
    paths=set()
    for entry in entries:
        if entry.split('/')[0] in EXCLUDED:continue
        p=ROOT/entry
        if p.is_dir():paths.update(p.rglob('*.html'))
        elif p.suffix=='.html':paths.add(p)
    sources=[];documents=set();warnings=[];inputs={}
    def add(key,title,url,body,kind='website'):
        for i,part in enumerate(chunks(body)):
            if len(part)<20:continue
            sources.append(dict(id=f'site:{key}:{i}',title=title,url=url,kind=kind,body=part,context=title+' '+url))
    for path in sorted(paths):
        inputs[path.relative_to(ROOT).as_posix()]=input_digest(path)
        page=PublicPage();page.feed(path.read_text(encoding='utf-8-sig'))
        if page.noindex:continue
        relative=path.relative_to(ROOT).as_posix();url='/'+relative.removesuffix('index.html');title=''.join(page.title).split('|')[0].strip() or url
        add(relative,title,url,''.join(page.text))
        for href in page.links:
            u=urlsplit(href)
            if u.scheme or u.netloc:continue
            target=(ROOT/unquote(u.path).lstrip('/')) if u.path.startswith('/') else path.parent/unquote(u.path)
            target=target.resolve()
            if not target.is_relative_to(ROOT) or not target.relative_to(ROOT).parts or target.relative_to(ROOT).parts[0] not in entry_roots:continue
            if target.suffix.lower() in {'.pdf','.docx','.txt'} and target.is_file():documents.add(target)
    catalog=json.loads((ROOT/'resources/resources.json').read_text(encoding='utf-8'))
    for item in catalog.get('items',[]):
        for value in item.values():
            if not isinstance(value,str):continue
            u=urlsplit(value)
            if u.scheme or u.netloc or not u.path.startswith('/'):continue
            target=(ROOT/unquote(u.path).lstrip('/')).resolve()
            if target.is_relative_to(ROOT) and target.relative_to(ROOT).parts and target.relative_to(ROOT).parts[0] in entry_roots and target.suffix.lower() in {'.pdf','.docx','.txt'} and target.is_file():documents.add(target)
    # Only linked, public, local documents. Scans without a text layer are reported,
    # never replaced with guessed text. Existing PDFs/Word files are not changed.
    for path in sorted(documents):
        key=path.relative_to(ROOT).as_posix();url='/'+key;title=path.stem.replace('-',' ');inputs[key]=input_digest(path)
        try:
            if path.suffix.lower()=='.pdf':
                from pypdf import PdfReader
                for number,page in enumerate(PdfReader(path).pages,1):
                    body=page.extract_text() or ''
                    if body.strip():add(key+':page'+str(number),title+f' — page {number}',url+f'#page={number}',body,'document')
                    else:warnings.append(key+f' page {number}: no extractable text; needs OCR or an approved description')
            elif path.suffix.lower()=='.docx':
                with zipfile.ZipFile(path) as archive:
                    xml=ElementTree.fromstring(archive.read('word/document.xml'))
                    body='\n'.join(''.join(p.itertext()) for p in xml.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'))
                    add(key,title,url,body,'document')
            else:add(key,title,url,path.read_text(encoding='utf-8'),'document')
        except Exception as e:raise RuntimeError(f'Cannot index public document {key}: {type(e).__name__}') from e
    # Dynamic resources are a shipped public catalog, not arbitrary JSON or AI FAQs.
    inputs['resources/resources.json']=input_digest(ROOT/'resources/resources.json')
    catalog=json.loads((ROOT/'resources/resources.json').read_text(encoding='utf-8'))
    for item in catalog.get('items',[]):
        body='\n'.join(str(item[k]) for k in ['title','subtitle','description','author','content'] if isinstance(item.get(k),str))
        add('resource:'+item['id'],item.get('title','Resource'),'/resources/',body)
    gallery=ROOT/'past-trips/gallery/gallery-data.json'
    inputs['past-trips/gallery/gallery-data.json']=input_digest(gallery)
    groups={}
    for image in json.loads(gallery.read_text(encoding='utf-8')).get('images',[]):
        groups.setdefault(image.get('trip','Journey photos'),[]).append(str(image.get('caption','')))
    for trip,captions in groups.items():add('gallery:'+trip,trip+' photo captions','/past-trips/gallery/',trip+'\n'+'\n'.join(captions),'caption')
    payload=json.dumps(sources,ensure_ascii=False,separators=(',',':'))
    digest=hashlib.sha256(payload.encode()).hexdigest()
    output='// Generated by tools/build_knowledge_site.py. Public originals only; never AI FAQ output.\n'
    output+='export const siteContentInputs='+json.dumps(inputs,separators=(',',':'))+';\n'
    output+='export const siteContentDigest='+json.dumps(digest)+';\nexport const siteContent='+payload+';\n'
    return output,dict(pages=len(paths),documents=len(documents),passages=len(sources),warnings=warnings)

if __name__=='__main__':
    output,report=build()
    if '--check' in sys.argv:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding='utf-8')!=output:raise SystemExit('Public knowledge catalog is stale. Run tools/build_knowledge_site.py before release.')
    else:OUTPUT.write_text(output,encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))
