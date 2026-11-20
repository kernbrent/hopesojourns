import {afterEach, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {ministryFixture} from './ministry-fixture';
import worker from '../src/index';
import {handleDestinations} from '../src/destinations';

const fixtures: Awaited<ReturnType<typeof ministryFixture>>[] = [];
afterEach(() => fixtures.splice(0).forEach(f => f.sqlite.close()));

it.each(['camino-de-santiago', 'kilimanjaro'])('publishes %s and saves interest through the real intake route', async slug => {
  const f = await ministryFixture(); fixtures.push(f);
  const env = {...f.env, ALLOWED_ORIGINS:'https://hopesojourns.com'} as any;
  const opportunity = 'trip-' + slug;
  const destinationPath = '/public/destinations/' + slug;
  const response = await handleDestinations(f.request(destinationPath), f.env, destinationPath);
  expect(response.status).toBe(200);
  const destination = await response.json() as any;
  expect(destination.destination).toMatchObject({slug});
  expect(destination.departures).toEqual([]);
  const body = {firstName:'Journey',lastName:'Tester',email:slug+'@example.org',phone:'9725550100',contactPreference:'email',opportunities:[opportunity],preferredTiming:'When details are available',message:'Please send planning information.',consent:true,idempotencyKey:crypto.randomUUID()};
  const request = () => new Request('https://hopesojourns.com/api/interest/submissions', {method:'POST',headers:{'content-type':'application/json',origin:'https://hopesojourns.com',referer:'https://hopesojourns.com/interest/?type=trip&opportunity='+opportunity},body:JSON.stringify(body)});
  const received = await worker.fetch(request() as any, env);
  expect(received.status).toBe(201);
  const result = await received.json() as any;
  expect(result).toMatchObject({success:true});
  expect(result.submissionId).toBeTruthy();
  expect(f.sqlite.prepare('SELECT opportunity_id FROM interests').get()?.opportunity_id).toBe(opportunity);
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM trips').get()?.n).toBe(0);
  const retry = await worker.fetch(request() as any, env);
  expect(retry.status).toBe(200);
  expect((await retry.json() as any).submissionId).toBe(result.submissionId);
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM interest_submissions').get()?.n).toBe(1);
  // Reapplying the content seed must preserve later staff edits.
  f.sqlite.prepare('UPDATE destinations SET summary=? WHERE slug=?').run('Staff update',slug);
  f.sqlite.exec(readFileSync(new URL('../migrations/0070_metro_relief_journeys.sql',import.meta.url),'utf8'));
  expect(f.sqlite.prepare('SELECT summary FROM destinations WHERE slug=?').get(slug)?.summary).toBe('Staff update');
});
