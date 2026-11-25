"""Audit reference existence and lexical evidence against publisher WEB text.

Download https://ebible.org/Scriptures/engwebp_vpl.zip into .tmp/biblillion-source
and extract to web first. Lexical misses require editorial review, not auto-approval.
"""
import json,re,unicodedata,xml.etree.ElementTree as ET
from functools import lru_cache
from pathlib import Path
books='Genesis Exodus Leviticus Numbers Deuteronomy Joshua Judges Ruth 1_Samuel 2_Samuel 1_Kings 2_Kings 1_Chronicles 2_Chronicles Ezra Nehemiah Esther Job Psalms Proverbs Ecclesiastes Song_of_Solomon Isaiah Jeremiah Lamentations Ezekiel Daniel Hosea Joel Amos Obadiah Jonah Micah Nahum Habakkuk Zephaniah Haggai Zechariah Malachi Matthew Mark Luke John Acts Romans 1_Corinthians 2_Corinthians Galatians Ephesians Philippians Colossians 1_Thessalonians 2_Thessalonians 1_Timothy 2_Timothy Titus Philemon Hebrews James 1_Peter 2_Peter 1_John 2_John 3_John Jude Revelation'.split()
codes='GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV'.split()
lookup={b.replace('_',' '):c for b,c in zip(books,codes)};lookup['Psalm']='PSA'
verses={}
for v in ET.parse('.tmp/biblillion-source/web/engwebp_vpl.xml').getroot():
 if v.tag=='v':verses[(v.attrib['b'],int(v.attrib['c']),int(v.attrib['v']))]=''.join(v.itertext())
@lru_cache(maxsize=None)
def passage(reference):
 text=[];last_book=None
 for part in reference.split(';'):
  part=part.strip().replace('–','-')
  if re.match(r'^\d+:',part) and last_book:part=last_book+' '+part
  m=re.fullmatch(r'(.+?) (\d+)(?::(\d+))?(?:-(?:(\d+):)?(\d+))?',part)
  if not m:raise ValueError('Unparsed reference '+part)
  book,c,v,endc,end=m.groups();last_book=book;code=lookup[book];c=int(c)
  if v is None and code in ['PHM','JUD','2JN','3JN','OBA']:v=str(c);c=1
  if v is None:
   selected=[s for (b,ch,n),s in verses.items() if b==code and c<=ch<=int(end or c)]
  else:
   start=(c,int(v));finish=(int(endc or c),int(end or v))
   if (code,*start) not in verses or (code,*finish) not in verses:raise ValueError('Missing verse '+part)
   selected=[s for (b,ch,n),s in verses.items() if b==code and start<=(ch,n)<=finish]
  if not selected:raise ValueError('Empty reference '+part)
  text.extend(selected)
 return ' '.join(text)
def norm(s):return re.sub(r'[^a-z0-9 ]','',unicodedata.normalize('NFKD',s).lower())
questions=json.loads(Path('.tmp/biblillion-source/questions.json').read_text(encoding='utf-8'))
report=[]
for q in questions:
 missing=[]
 for a in q['answers']:
  p=passage(a['ref']);pkey=norm(p)
  if not any(norm(x) in pkey for x in [a['name'],*a['aliases']]):missing.append(a['name'])
 if missing:report.append({'id':q['id'],'prompt':q['prompt'],'missingLexicalEvidence':missing,'ref':q['answers'][0]['ref'],'passage':passage(q['answers'][0]['ref'])})
Path('.tmp/biblillion-source/editorial-review.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(f'All references resolved for {len(questions)} questions; {len(report)} sets require lexical/translation review. See .tmp/biblillion-source/editorial-review.json.')
