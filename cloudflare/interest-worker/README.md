# Hope Sojourns forms and admin Worker

This Cloudflare Worker stores trip and internship interest in a D1 database. It keeps personal information out of the static website, requires and validates both an email address and cell phone number, accepts several opportunities for one person, and prevents duplicate person/opportunity rows and exact repeat submissions.

The trip-registration table is intentionally separate from public interest submissions. A later registration workflow can add sensitive application fields without mixing them into the low-friction interest form.

The same Worker protects the hidden response portal. The initial administrator password is a Cloudflare secret. After an administrator changes it in the portal, a uniquely salted PBKDF2-SHA256 hash in D1 takes precedence; the password itself is never stored. Sessions use secure HTTP-only cookies, an optional “Remember me” login lasts 30 days, and the login page always requires an explicit form submission before showing the dashboard even when the browser has saved and prefilled the password. State-changing requests require a CSRF token, failed logins are rate limited, and every reply, status change, team, relationship, password change, or permanent deletion is recorded.

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

## Environment isolation

The Wrangler configuration defines explicit `test` and `production` environments. Never deploy this Worker without `--env test` or `--env production`.

| Environment | Worker | Route | D1 database |
|---|---|---|---|
| Test | `hope-sojourns-interest-test` | `test.hopesojourns.com/api/interest` and `test.hopesojourns.com/api/interest/*` | `hope-sojourns-forms-test` |
| Production | `hope-sojourns-interest-production` | `/api/interest` and `/api/interest/*` on `hopesojourns.com` and `www.hopesojourns.com` | `hope-sojourns-forms-production` |

The two environments use different D1 database IDs and environment-specific secrets. Test exports, backups, rows, and credentials must never be imported into the production database. Production setup applies the numbered migrations to the empty production database; those migrations create the schema and the legitimate opportunity catalog but do not seed contacts, submissions, teams, ministries, sessions, or administrator credentials.

Run `npm run validate:environments` before migrations or deployment. Apply migrations with `npm run db:migrate:test` or `npm run db:migrate:production`, and deploy with `npm run deploy:test` or `npm run deploy:production`. The required `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` values must be stored separately for each Wrangler environment and must never be committed.

If the D1-backed password is ever forgotten, an authorized operator can remove the `primary` row from `admin_credentials` in the affected environment to restore login with that environment's Cloudflare `ADMIN_PASSWORD` secret, then immediately set a new portal password.

Outbound email stays on the free tier: the response portal stores the prepared reply, opens it in the administrator's normal email application, and records when the administrator marks it sent.
