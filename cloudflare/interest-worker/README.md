# Hope Sojourns test forms and admin Worker

This Cloudflare Worker stores trip and internship interest in a D1 database. It keeps personal information out of the static website, requires and validates both an email address and cell phone number, accepts several opportunities for one person, and prevents duplicate person/opportunity rows and exact repeat submissions.

The trip-registration table is intentionally separate from public interest submissions. A later registration workflow can add sensitive application fields without mixing them into the low-friction interest form.

The same Worker protects the hidden response portal. Administrator passwords are Cloudflare secrets, sessions use secure HTTP-only cookies, state-changing requests require a CSRF token, failed logins are rate limited, and every reply, status change, team, team assignment, or permanent deletion is recorded. Administrators can review people as cards, individual requests, or a spreadsheet-style grid; open a complete person history; create teams and manage applicants; open a complete team view; launch a team email in the machine's preferred email client; and filter or export by search, status, opportunity, contact preference, reply state, team, and received date. Confirmed deletion controls can remove an individual request, an applicant and every connected record, or a team while preserving its applicants. CSV exports neutralize spreadsheet formulas before download.

## Local validation

```text
npm install
npm run types
npm run check
npm test
npm run db:migrate:local
npm run deploy:dry
```

The migration seeds the current trip and internship opportunities. Local migrations and tests do not create or modify a production database.

## Test deployment

The test environment uses the `hope-sojourns-forms-test` D1 database, the `hope-sojourns-interest-test` Worker, and the `test.hopesojourns.com/api/interest/*` route. The required `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` values must be stored with Wrangler secrets and must never be committed.

Outbound email stays on the free tier: the response portal stores the prepared reply, opens it in the administrator's normal email application, and records when the administrator marks it sent.
