"""Prepare idempotent starter FAQ data from verified canonical public-page excerpts.

This only writes SQL. Apply independently to the authorized environment with
Wrangler; never copy a database or private content between environments.
"""
from html import unescape
from pathlib import Path
from datetime import datetime, timezone
import argparse, json, re

ROOT = Path(__file__).resolve().parents[1]

def normalized(value):
    value = unescape(re.sub(r'<[^>]+>', ' ', value))
    return ' '.join(value.replace('’', "'").split()).lower()

def quote(value):
    return "'" + str(value).replace("'", "''") + "'"

def build():
    source = json.loads((ROOT/'docs/content/knowledge-starter-faqs.json').read_text(encoding='utf-8'))
    stamp = datetime.now(timezone.utc).isoformat()
    sql = ['-- Authoritative static website excerpts, reviewed independently; no private database copy.']
    for item in source['entries']:
        url = item['url'].split('#')[0]
        assert url in ['/internships/', '/about/'], 'Only canonical public pages are eligible.'
        page = normalized((ROOT/url.strip('/')/'index.html').read_text(encoding='utf-8'))
        for excerpt in item['originalExcerpts']:
            assert normalized(excerpt) in page, f"Source changed for {item['id']}: {excerpt}"
        body = '\n'.join(item['originalExcerpts'])
        evidence = json.dumps([{'id':item['sourceId'],'revision':1}])
        sql.append('INSERT OR IGNORE INTO knowledge_sources(id,origin_key,title,url,kind,context,body,status,provenance,reviewed_by,updated_at) VALUES('+','.join(map(quote,[item['sourceId'],'starter-content:'+item['id'],item['question'],item['url'],'website',item['topic'],body,'approved','Original canonical public-page excerpts; source fidelity reviewed '+source['reviewedAt'],'release-source-review',stamp]))+');')
        # Never overwrite an editor's subsequent corrections or withdrawals.
        sql.append('INSERT OR IGNORE INTO knowledge_candidates(id,question,answer,topic_id,evidence_json,status,reuse_approved,published,privacy_checked,reviewed_by,created_at,updated_at) VALUES('+','.join(map(quote,[item['id'],item['question'],item['answer'],item['topic'],evidence,'reviewed']))+",1,1,1,'release-source-review',"+quote(stamp)+','+quote(stamp)+');')
        sql.append('INSERT INTO audit_events(id,entity_type,entity_id,event_type,metadata_json,created_at) SELECT '+','.join(map(quote,['starter-faq-audit-'+item['id'],'knowledge_candidate',item['id'],'starter_seed',json.dumps({'source':item['url'],'reviewedAt':source['reviewedAt']}),stamp]))+' WHERE NOT EXISTS(SELECT 1 FROM audit_events WHERE id='+quote('starter-faq-audit-'+item['id'])+');')
    return '\n'.join(sql)+'\n', len(source['entries'])

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',default=str(ROOT/'.tmp/knowledge-starter-faqs.sql'))
    args=parser.parse_args(); sql,count=build();out=Path(args.output);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(sql,encoding='utf-8')
    print(f'Verified {count} starter FAQs against canonical public pages; prepared {out}')
