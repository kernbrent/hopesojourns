"""Read public catalogs only. Never fetch a recording, private endpoint, or paid API.
Run explicitly to refresh a local inventory; this does not approve sources.
"""
import json,re
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.parse import urljoin,urlparse
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1]
BASE='https://hopesojourns.com'
rows={}; failures=[]
def get(path):
    with urlopen(Request(BASE+path,headers={'Accept':'application/json','User-Agent':'HopeSojournsPublicInventory/1.0'}),timeout=25) as r:return json.load(r)
def add(url,title,origin):
    url=urljoin(BASE,url)
    if urlparse(url).scheme!='https':return
    rows.setdefault(url,{'url':url,'title':title,'origins':[],'transcript_status':'missing','approval_status':'unreviewed','visibility':'public-catalog-only'})['origins'].append(origin)
for prefix,collection in [('/api/interest/public/trips','trips'),('/api/interest/public/trip-stories','stories')]:
    try:
        for item in get(prefix).get(collection,[]):
            path=prefix+'/'+item['slug']
            try:
                data=get(path);content=data.get('story',data)
                for m in content.get('memories',[]):
                    if m.get('kind')=='video':add(m['image_url'],m['title'],path)
            except Exception as e:failures.append({'path':path,'error':type(e).__name__})
    except Exception as e:failures.append({'path':prefix,'error':type(e).__name__})
def walk(value,origin):
    if isinstance(value,dict):
        for key,item in value.items():
            if isinstance(item,str) and re.search(r'youtu(?:be\.com|\.be)|vimeo\.com|\.mp4(?:\?|$)',item):add(item,value.get('title',value.get('label','Video')),origin)
            elif isinstance(item,(dict,list)):walk(item,origin)
    elif isinstance(value,list):
        for item in value:walk(item,origin)
walk(json.loads((ROOT/'resources/resources.json').read_text(encoding='utf-8')),'resources/resources.json')
report={'snapshot_at':datetime.now(timezone.utc).isoformat(),'scope':'Public dated-journey catalogs, published-story catalogs, resources JSON. Private portal recordings and embeds outside these catalogs still require a separate authorized inventory. URLs are not downloaded.','videos':list(rows.values()),'failures':failures}
out=ROOT/'.tmp/knowledge-public-video-inventory.json';out.parent.mkdir(exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(f'{len(rows)} unique public video URLs; {len(failures)} catalog failures; {out}')
