# Hope Sojourns test forms and admin Worker

This Cloudflare Worker stores trip and internship interest in a D1 database. It keeps personal information out of the static website, requires and validates both an email address and cell phone number, accepts several opportunities for one person, and prevents duplicate person/opportunity rows and exact repeat submissions.

The trip-registration table is intentionally separate from public interest submissions. A later registration workflow can add sensitive application fields without mixing them into the low-friction interest form.

The same Worker protects the hidden response portal. Administrator passwords are Cloudflare secrets, sessions use secure HTTP-only cookies, state-changing requests require a CSRF token, failed logins are rate limited, and every reply, status change, team, relationship, or permanent deletion is recorded.

The `people` table is the master Hope Sojourns contact list. Public interest forms automatically reuse or create a person and classify that person as a prospective traveler. Administrators can also create and edit contacts with multiple roles, Hope Sojourns areas, languages, trips, addresses, organizations, notes, and active/inactive status. The portal includes card and spreadsheet views, contact filters, and a contact-oriented CSV export.

Ministries have their own profiles, contact information, notes, active/inactive status, connected trips, and linked people with ministry roles and primary-contact markers. Teams remain separate so travelers and leaders can be assigned without duplicating contact records. Confirmed deletion controls can remove an individual interest form, trip application, complete contact, team, or ministry while preserving unrelated records. CSV exports neutralize spreadsheet formulas before download.

## Local validation

```text
npm install
npm run types
npm run check
npm test
npm run db:migrate:local
npm run deploy:dry
```

The migrations seed the current trip and internship opportunities and add the master-contact and ministry relationship tables. Local migrations and tests do not create or modify a production database.

## Test deployment

The test environment uses the `hope-sojourns-forms-test` D1 database, the `hope-sojourns-interest-test` Worker, and the `test.hopesojourns.com/api/interest/*` route. Apply pending D1 migrations before deploying Worker code that depends on them. The required `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` values must be stored with Wrangler secrets and must never be committed.

Outbound email stays on the free tier: the response portal stores the prepared reply, opens it in the administrator's normal email application, and records when the administrator marks it sent.
