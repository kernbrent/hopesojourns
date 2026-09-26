import {expect, it} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

type Reference = {start:number;end:number;passage:string};
type LinkedNode = {tagName?:string;textContent:string;href?:string;target?:string;rel?:string;children?:LinkedNode[];setAttribute?:(key:string,value:string)=>void;append?:(...nodes:LinkedNode[])=>void};

function formatter() {
  const source=readFileSync(new URL('../../../journey/content-format.js',import.meta.url),'utf8');
  const document={
    createTextNode:(text:string)=>({textContent:text}),
    createElement:(tag:string)=>{
      const element:LinkedNode={tagName:tag.toUpperCase(),textContent:'',children:[],setAttribute(){},append(...nodes){this.children!.push(...nodes);}};
      return element;
    },
  };
  const context={document,encodeURIComponent,HSJourneyContent:undefined as undefined|{references:(value:string)=>Reference[];appendScriptureLinks:(element:LinkedNode,value:string)=>LinkedNode}};
  runInNewContext(source,context);
  return {content:context.HSJourneyContent!,document};
}

it('links each full and shorthand passage to the exact NIV location',()=>{
  const {content}=formatter();
  const text='Read Revelation 21:1–7; 22:1–5 and 1 Corinthians 15:20–23, 50–58; 2 Corinthians 12:9–10.';
  expect(content.references(text).map(ref=>ref.passage)).toEqual([
    'Revelation 21:1-7','Revelation 22:1-5','1 Corinthians 15:20-23',
    '1 Corinthians 15:50-58','2 Corinthians 12:9-10',
  ]);
  expect(content.references('Acts 17 & Matthew 25:40; Psalm 23').map(ref=>ref.passage))
    .toEqual(['Acts 17','Matthew 25:40','Psalm 23']);
});

it('creates safe Bible Gateway anchors while leaving ordinary text untouched',()=>{
  const {content,document}=formatter();
  const paragraph=document.createElement('p');
  content.appendScriptureLinks(paragraph,'Leviticus 23:33–43 and <script>not HTML</script>');
  const links=paragraph.children!.filter(node=>node.tagName==='A');
  expect(links).toHaveLength(1);
  expect(links[0].textContent).toBe('Leviticus 23:33–43');
  expect(links[0].href).toBe('https://www.biblegateway.com/passage/?search=Leviticus%2023%3A33-43&version=NIV');
  expect(links[0].rel).toBe('noopener noreferrer');
  expect(paragraph.children!.at(-1)?.textContent).toContain('<script>not HTML</script>');
  expect(content.references('Day 1 arrives September 26')).toHaveLength(0);
});

it('adds the supplied Day 1 hymns to both copies once without replacing study text',()=>{
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE devotional_library(id TEXT PRIMARY KEY,content TEXT,updated_at TEXT); CREATE TABLE trip_content(id TEXT PRIMARY KEY,content TEXT,content_type TEXT,updated_at TEXT)');
  const original='OPENING STUDY\n\nRead Acts 1:6–11.\n\nCLOSING PRAYER\n\nAmen.';
  const masterOriginal=original.replace(/\n/g,'\r\n');
  sqlite.prepare('INSERT INTO devotional_library(id,content,updated_at) VALUES(?,?,?)')
    .run('1df9e9fd-12e8-5325-a4d7-179cd3826dac',masterOriginal,'old');
  sqlite.prepare('INSERT INTO trip_content(id,content,content_type,updated_at) VALUES(?,?,?,?)')
    .run('7db7a6ef-5bb3-44c8-9834-6a337deb5224',original,'devotional','old');
  const migration=readFileSync(new URL('../migrations/0039_day_one_hymns.sql',import.meta.url),'utf8');
  sqlite.exec(migration);
  sqlite.exec(migration);
  for(const table of ['devotional_library','trip_content']){
    const row=sqlite.prepare(`SELECT content FROM ${table}`).get() as {content:string};
    const normalized=row.content.replace(/\r\n/g,'\n');
    expect(normalized.startsWith('OPENING STUDY\n\nRead Acts 1:6–11.')).toBe(true);
    expect(row.content.match(/HYMNS FOR DAY 1/g)).toHaveLength(1);
    expect(row.content).toContain('TO GOD BE THE GLORY');
    expect(row.content).toContain('AMAZING GRACE');
    expect(row.content).toContain('5. When we’ve been there ten thousand years,');
    expect(row.content.indexOf('AMAZING GRACE')).toBeLessThan(row.content.indexOf('CLOSING PRAYER'));
    expect(normalized.endsWith('CLOSING PRAYER\n\nAmen.')).toBe(true);
  }
});
