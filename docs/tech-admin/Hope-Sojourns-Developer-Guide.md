# Hope Sojourns developer guide

Version 1.5

Last reviewed: August 24, 2026

## 1. Purpose and operating rules

This is the living technical guide for the Hope Sojourns website, response portal, and supporting Cloudflare Workers. It explains how the current system is organized, how to make safe changes, and which checks should run before work is handed off.

The repository may contain unrelated or unfinished work. Preserve changes you did not create and keep requested work narrowly scoped.

Do not commit, push, publish, deploy, merge, or open a pull request unless the user explicitly requests that exact action. Local editing, local migrations, tests, and dry runs do not grant deployment permission.

## 2. System overview

Hope Sojourns is primarily a static, progressively enhanced website with two API-backed workflows.

```text
Visitor browser
  |
  +-- Static HTML, CSS, JavaScript, images
  |     Shared header/footer and interaction behavior: /script.js
  |     Shared visual system: /styles.css
  |
  +-- Interest form: /api/interest/*
  |     Cloudflare Interest Worker
  |     D1 database
  |     Private response portal: /admin/
  |
  +-- Giving widget: hope-sojourns-paypal.kernbrent.workers.dev
  |     Cloudflare PayPal Worker
  |     PayPal Orders, subscriptions, and webhooks
  |
  +-- Scheduling page
        Embedded Calendly widget with direct-link fallback
```

There is no top-level frontend package or compilation step. Source HTML, CSS, JavaScript, JSON, and assets are served directly. The ignored `/site-dist` directory is generated or staging output and is not the canonical place to edit files.

## 3. Important locations

| Path | Responsibility |
|---|---|
| `/index.html` | Homepage |
| `/styles.css` | Global CSS and design tokens |
| `/script.js` | Shared header, footer, navigation, motion, introductory experience, and photo viewer |
| `/trip.js` | Data and rendering for developing trip detail pages |
| `/assets/` | Core website images and brand assets |
| `/about/` | About page |
| `/giving/` | Giving page and browser-side PayPal integration |
| `/interest/` | Public trip and internship interest form |
| `/internships/` | Public internships page |
| `/schedule/` | Calendly scheduling page |
| `/resources/` | Resource index, resource data, and resource articles |
| `/trips/` | Developing trip route stubs rendered by `trip.js` |
| `/past-trips/` | Past-trip pages and gallery |
| `/admin/` | Private response portal frontend |
| `/admin/internship-program/` | Generated internship program and policy documents |
| `/cloudflare/interest-worker/` | Interest form, D1 data, and admin API Worker |
| `/cloudflare/paypal-giving-worker/` | PayPal order, subscription configuration, and webhook Worker |
| `/brochure/` | Brochure working files and marketing-folder synchronization |
| `/tools/` | Local document-generation utilities |
| `/docs/tech-admin/` | Canonical living style and developer guides |
| `/DoYouSeeMeMusicVideo/` | Large media-production workspace; not normal web runtime content |

## 4. Public route inventory

### Main pages

| Route | Purpose | Additional runtime |
|---|---|---|
| `/` | Homepage and current journeys | `/script.js` |
| `/about/` | Ministry, partnership, and founder information | `/script.js` |
| `/giving/` | Giving explanation and PayPal widget | `/script.js`, `/giving/giving.js` |
| `/interest/` | Public interest submission | `/script.js`, `/interest/interest.js` |
| `/internships/` | Internship pathways and opportunities | `/script.js` |
| `/resources/` | Searchable/filterable resource library | `/script.js`, `/resources/resources.js` |
| `/resources/do-you-see-me/` | Resource article and audio/lyrics experience | Article-specific JavaScript |
| `/schedule/` | 30-minute Calendly conversation booking | `/script.js`, Calendly embed |
| `/past-trips/` | Past-trip archive | `/script.js` |
| `/past-trips/gallery/` | Filterable photo archive | `/script.js`, gallery script and JSON |

### Developing trip pages

The route stubs under `/trips/<slug>/` set `data-trip="<slug>"` on the body, load `/trip.js`, and provide `<main id="trip-main"></main>`. `trip.js` selects the matching data object and renders the page.

Current slugs include `athens`, `arkansas`, `belize`, `kenya`, `mexico-city`, `nice`, and `others`.

### Past-trip pages

Past-trip pages are static archives. The legacy `/past-trips/kenya-2019/` route immediately redirects to the corrected Kenya 2018 page and still loads the shared stylesheet for its fallback content.

### Private route

`/admin/` is the private response portal. It loads the global stylesheet first, then `/admin/admin.css`, and uses `/admin/admin.js` to communicate with `/api/interest/admin`.

## 5. Shared frontend architecture

### Global styling

The `:root` block at the top of `/styles.css` is the single source of truth for color. It defines:

- core neutrals;
- forest, gold, and coral brand colors;
- reusable washes and illustrated accents;
- functional success, information, warning, and error colors;
- RGB channels for alpha treatments; and
- semantic aliases such as `--color-page`, `--color-surface`, and `--color-action`.

All page and component CSS must use variables. `Check-Color-Palette.ps1` fails if a stylesheet introduces literal color values outside the root block or if a page omits `/styles.css`.

Global component families include the header/navigation, buttons, heroes, sections, cards, calls to action, trip cards, forms, galleries, lightboxes, resources, giving, internships, and reduced-motion behavior.

Portal CSS belongs in `/admin/admin.css`, but it inherits all shared design tokens.

### Shared JavaScript

`/script.js` provides the public site shell and cross-page behavior:

- injects the shared header and footer;
- injects the floating giving action;
- manages mobile navigation state;
- manages the “Our Approach” disclosure pattern;
- drives reveal and journey-line motion when motion is allowed;
- manages the optional first-visit invitation and its replay control;
- initializes the photo viewer/lightbox; and
- marks the test environment when the hostname matches the test site.

Because the header and footer are JavaScript-injected, pages that need the public site chrome must load `/script.js`. Pages should still retain meaningful `<main>` content if shared enhancement is unavailable.

### Cache-busting versions

HTML references use query values such as `/styles.css?v=25` and `/script.js?v=15`. When a shared asset changes, bump its query version everywhere that loads it. Keep versions consistent for the same shared file; do not leave pages pointing at several generations of the same stylesheet.

## 6. Content and data files

### Developing trips

`/trip.js` contains the developing-trip data objects and renders route stubs. When adding a trip:

1. Add a unique, lowercase, hyphenated slug to `tripData`.
2. Add the destination, status, image, summary, facts, description, and appropriate actions.
3. Create `/trips/<slug>/index.html` using an existing trip stub.
4. Update any homepage, interest-form, or navigation content that should expose the new trip.
5. Verify missing data does not create blank labels or broken links.

### Resources

`/resources/resources.json` is the library data source. `/resources/resources.js` fetches it without long-term caching and renders filters, featured cards, related items, and search results.

Use stable IDs, valid types, accurate metadata, descriptive action labels, and valid `relatedIds`. If a resource needs a full local article, create its route and keep the JSON entry linked to that route.

### Gallery

`/past-trips/gallery/gallery-data.json` contains trip, date, URL, and caption values. Captions should be factual and dignity-preserving. Confirm that remote image URLs are intentionally allowed and reliable before adding them.

### Internship program documents

`/tools/build_internship_program_docs.py` generates Word documents into `/admin/internship-program/` and then packages the generated set as `/admin/internship-program/Hope-Sojourns-Internship-Program-Documents.zip`. Treat the script as the maintainable source for bulk document formatting, repeated text, and the download-all archive. The Internship toolkit keeps individual Word links available beside the ZIP bundle. After changing document design constants or templates, regenerate and visually inspect the affected documents before replacing approved copies; confirm the ZIP contains every current Word document before handoff.

### Website document synchronization

`/Sync-Hope-Sojourns-Website-Documents.ps1` synchronizes the website's published Word, PDF, spreadsheet, presentation, CSV, and technical Markdown documents with the external Hope Sojourns document library. The mapped destinations include Marketing, `IntershipProgram`, BusinessAdmin, WebsiteResources, TechAdmin, and the library root for agreements.

The sync is deliberately allowlisted from website folders. Private files that exist only in the document library are never copied into the public website. The first run initializes external copies from the current website files; subsequent runs use SHA-256 state tracking for two-way updates. When both copies changed, the newer file wins and the other version is preserved in `Website-Document-Sync-Conflicts`.

The Windows scheduled task `Hope Sojourns Brochure Sync` retains its historical name but now runs the comprehensive script every day at 2:30 a.m. Review `/document-sync.log` and the external conflict folder after a nontrivial sync.

## 7. Interest form and response portal

### Browser flow

`/interest/index.html` declares `data-interest-api-base="/api/interest"`. On localhost, `/interest/interest.js` uses `http://127.0.0.1:8787`; otherwise it uses the configured relative API path.

Public submissions include opportunity choices, contact details, optional background or experience, timing, notes, and consent. The user-facing label for legacy `fieldOfStudy` is “Background, skills, or areas of experience”; retain the key absent a coordinated migration. Never store submissions in the static site.

### Worker

`/cloudflare/interest-worker/src/index.ts` handles public submissions and admin APIs. The Wrangler configuration requires an explicit environment and binds `DB` to a different D1 database in each environment:

| Environment | Worker | Route | D1 database |
|---|---|---|---|
| Test | `hope-sojourns-interest-test` | `test.hopesojourns.com/api/interest` and `test.hopesojourns.com/api/interest/*` | `hope-sojourns-forms-test` |
| Production | `hope-sojourns-interest-production` | `/api/interest` and `/api/interest/*` on `hopesojourns.com` and `www.hopesojourns.com` | `hope-sojourns-forms-production` |

`/cloudflare/interest-worker/scripts/verify-environment-isolation.mjs` fails when routes, allowed origins, environment names, or database IDs cross those boundaries. Both the exact `/api/interest` path and its `/api/interest/*` descendants must be routed so the public submission endpoint and admin endpoints reach the same environment-specific Worker. Never copy a test D1 export, backup, credential row, or user-data row into production. Production is initialized only by applying the numbered migrations to its empty database; the migrations seed the legitimate opportunity catalog but no contacts, submissions, teams, ministries, sessions, or administrator credentials.

Current migrations:

1. `0001_initial_forms.sql`
2. `0002_enforce_trip_registration_kind.sql`
3. `0003_admin_portal.sql`
4. `0004_admin_filter_indexes.sql`
5. `0005_admin_teams.sql`
6. `0006_master_contacts_ministries.sql`
7. `0007_contact_imports.sql`
8. `0008_admin_credentials.sql`

Do not edit a migration that has already been applied to a shared environment. Add a new numbered migration.

### Admin security model

The response portal uses secure HTTP-only sessions, CSRF protection for state-changing requests, rate-limited login attempts, audit records, and D1-backed password changes. Required secrets include:

- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`

Never store those values in source, documentation, test snapshots, or browser-accessible JavaScript.

The portal supports people, submissions, contact editing/import, teams, ministries, internship-toolkit access, replies, status changes, CSV export, and confirmed deletion flows. The Internship toolkit exposes a download-all ZIP while preserving every individual document download. CSV output must continue to neutralize spreadsheet formulas.

### CSM distribution inbox and giving ledger

`/cloudflare/interest-worker/src/csm-distribution.ts` receives the Christian Steps Ministries distribution feed, lists transactions for review, records approvals or denials, writes approved transactions to the Hope Sojourns financial ledger, and reports the decision back to CSM. The feed accepts received gifts and sent payments; holds and releases are not part of this workflow.

The inbox response includes a current-year `givingSummary` computed from approved `financial_transactions` using UTC calendar-year boundaries. The large value is gross received donations. The supporting values are net received after fees, the count of received donations, distinct linked givers, and the absolute value of sent payments. Sent payments are reported separately and never reduce gross received.

The portal's **Approve all awaiting** action processes the open queue in repeated batches, up to the safety limit of 5,000 transactions. It calls the existing per-transaction approval endpoint for every item so audit records, ledger writes, callbacks, and failure reporting remain identical to individual approval. Received gifts link to an existing Person or create a donor; sent payments do not create People.

Immediately before creating a new donor, the Worker repeats its exact normalized-email match when no person was selected or stored. This final check prevents a duplicate Person when an earlier approval in the same bulk run already created the donor. Approval responses include `createdPerson`, allowing the portal to report how many new donors were added. **View donors in People** resets the People filters, selects Donor, sorts newest first, and opens the People view so approved donors are immediately visible.

### Admin headers and indexing

`/admin/index.html` includes a restrictive Content Security Policy and noindex metadata. `/_headers` adds no-store, clickjacking, referrer, permissions, content-type, and search-indexing protections for `/admin/*`. Preserve these controls when changing the portal.

## 8. Giving and PayPal

`/giving/index.html` contains a giving widget configured with:

`data-paypal-api="https://hope-sojourns-paypal.kernbrent.workers.dev"`

`/giving/giving.js` fetches public configuration, loads the PayPal SDK, creates or captures one-time orders through the Worker, and renders subscription buttons for recurring plans.

The Worker lives in `/cloudflare/paypal-giving-worker/`. Secrets must not be committed:

- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `SETUP_KEY`

Plan and webhook IDs are identifiers and currently live as Worker variables. The configured API base is PayPal production. Tests and dry runs must not create a live charge.

The production custom `/api/paypal/*` route should not be added or changed until the Worker, credentials, plans, capture flow, and webhook verification have been tested and deployment is explicitly authorized.

## 9. Scheduling

`/schedule/` embeds the Calendly URL `https://calendly.com/kern-brent/30min` and provides both a direct-link fallback and a no-JavaScript fallback. If the appointment URL changes, update all three references and test the embedded and direct flows.

## 10. Local development

### Static site

Serve the repository root over HTTP. Do not rely on `file://` because the site uses root-relative paths and browser requests.

One simple option:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Then open `http://127.0.0.1:4173/`.

Use an available local server if Python is not installed. Do not add a permanent dependency solely to serve static files.

### Interest Worker

```powershell
Set-Location cloudflare\interest-worker
npm install
npm run types
npm run validate:environments
npm run check
npm test
npm run db:migrate:local
npm run deploy:dry
npm run dev
```

The local browser form expects the Worker at `http://127.0.0.1:8787`.

### PayPal Worker

```powershell
Set-Location cloudflare\paypal-giving-worker
npm install
npm run types
npm run check
npm test
npm run deploy:dry
npm run dev
```

Do not use live credentials for casual local experimentation.

## 11. Validation standards

### After any page or CSS change

```powershell
powershell -ExecutionPolicy Bypass -File .\Check-Color-Palette.ps1
git diff --check
git status --short
```

Also verify:

- the changed page loads without browser console errors;
- desktop and narrow/mobile layouts have no horizontal overflow;
- navigation and the shared footer appear where expected;
- keyboard navigation and visible focus still work;
- images load and crop correctly;
- motion-disabled behavior remains usable; and
- only intended files changed.

### After interest/admin Worker changes

Run, from `/cloudflare/interest-worker/`:

```powershell
npm run types
npm run check
npm test
npm run db:migrate:local
npm run deploy:dry
```

Add or update tests for changed endpoint behavior, authentication, validation, data relationships, import/export behavior, and deletion rules.

### After PayPal Worker changes

Run, from `/cloudflare/paypal-giving-worker/`:

```powershell
npm run types
npm run check
npm test
npm run deploy:dry
```

Never describe a dry run as a successful live transaction test.

### Document validation

For generated DOCX or PDF artifacts, use the appropriate document workflow to render every page and inspect it visually. File generation alone is not sufficient validation.

## 12. Common change workflows

### Add a standard public page

1. Copy the nearest existing page structure.
2. Add viewport, description, title, icons, current `/styles.css` version, and `/script.js` if public chrome is needed.
3. Add semantic main content with one `h1`.
4. Reuse existing component classes and design tokens.
5. Add navigation links only when the page belongs in global navigation.
6. Test desktop, mobile, keyboard, images, metadata, and console output.
7. Run the palette check and update documentation if a new standard was introduced.

### Change the global header or footer

Edit the templates in `/script.js`. Verify several different page types, not only the homepage. Bump the `/script.js` query version across all pages that load it.

### Change a shared color

1. Change the token once in the `/styles.css` `:root` block.
2. Update `/COLOR-PALETTE.md`.
3. Update the color section of the style guide.
4. Check contrast on every standard foreground/background pairing affected.
5. Run `Check-Color-Palette.ps1` and visually inspect public and admin examples.

### Add a new color

Only add a new color when an existing token cannot serve the role. Define a clear semantic purpose, HEX value, RGB value, optional RGB channel token, contrast pairing, and documentation. Avoid creating a near-duplicate shade for a single component.

### Add or change a form field

Trace the field through the entire flow:

1. HTML label and control;
2. browser validation and payload;
3. Worker schema validation;
4. D1 migration if persistence changes;
5. admin display/edit/export behavior;
6. tests; and
7. privacy and retention implications.

### Add a database field

Create a new numbered migration, update TypeScript queries and response models, add tests, run local migration validation, and document any new personal or sensitive data. Never modify an already-applied shared migration.

## 13. Security and privacy rules

- Never commit secrets, access tokens, passwords, session values, payment credentials, or private API keys.
- Never put personal form data in static HTML, JSON, URLs, logs, screenshots, or public test fixtures.
- Keep admin cookies HTTP-only and secure in deployed environments.
- Preserve CSRF checks for state-changing admin requests.
- Preserve origin allowlists and review them when hostnames change.
- Keep admin pages noindex and no-store.
- Keep CSV formula neutralization.
- Use parameterized D1 statements; do not construct SQL from untrusted strings.
- Validate on the server even when the browser already validates.
- Confirm destructive admin actions and maintain audit records.
- Use `rel="noopener noreferrer"` for untrusted external tabs.
- Review new third-party scripts for privacy, security, CSP, availability, and fallback behavior.

## 14. Deployment boundaries

Deployment is an explicit separate action. The normal completion state for development work is locally edited, validated, and uncommitted.

Before an authorized deployment:

- confirm the intended environment and hostname;
- confirm all required migrations and secrets;
- run relevant tests, type checks, and dry runs;
- review the complete diff;
- verify cache-busting versions;
- confirm the admin security headers and noindex behavior; and
- have a rollback or recovery plan.

The Interest Worker has isolated test and production environments. Always name the intended environment in migration, secret, and deployment commands. Production launch order is: validate isolation, create or verify the production D1 database, apply production migrations, set production-only secrets, dry-run the production Worker, deploy it, publish the production Pages build, and verify both production hostnames. Test data must remain bound only to the test Worker and database.

## 15. Documentation maintenance

The canonical living guides are:

- `/docs/tech-admin/Hope-Sojourns-Style-Guide.md`
- `/docs/tech-admin/Hope-Sojourns-Developer-Guide.md`

`/tools/build_tech_admin_guides.py` generates the polished Microsoft Word editions from those Markdown sources. The generator applies the shared document design, visible palette swatches, Word heading styles, fixed-width accessible tables, running headers, page numbers, and cover pages. Do not hand-edit the generated `.docx` files because those edits will be replaced the next time the guides are built.

Generate both Word editions with the bundled workspace Python runtime:

```powershell
& 'C:\Users\kernb\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' .\tools\build_tech_admin_guides.py
```

After generation, render and visually inspect every page of both Word documents. `/Sync-TechAdmin-Docs.ps1` provides an immediate TechAdmin-only mirror. The daily `/Sync-Hope-Sojourns-Website-Documents.ps1` job also includes the canonical technical documentation in the broader document-library sync.

Update documentation in the same work session when any of the following changes:

| Change | Required documentation |
|---|---|
| Color, type, layout, component, imagery, voice, accessibility | Style guide |
| Route, file ownership, architecture, integration, command, schema, security | Developer guide |
| Color token or contrast pairing | Style guide and `/COLOR-PALETTE.md` |
| New recurring maintenance procedure | Developer guide and TechAdmin README when navigation changes |
| Any guide content change | Regenerate, visually verify, and synchronize both Word editions |

Update the “Last reviewed” date and add a concise revision-history entry for material changes. Run the sync script after the canonical files are final.

## 16. Handoff checklist

- [ ] The requested behavior is complete.
- [ ] Relevant automated checks passed.
- [ ] Desktop and narrow visual checks passed when UI changed.
- [ ] No secrets or personal data were introduced.
- [ ] Only intended files changed; unrelated work was preserved.
- [ ] Cache-busting versions were updated where needed.
- [ ] Style and developer documentation were updated if the standards or architecture changed.
- [ ] TechAdmin copies were synchronized.
- [ ] Changes remain uncommitted and undeployed unless explicitly requested otherwise.

## Revision history

| Date | Version | Change |
|---|---|---|
| 2026-08-24 | 1.5 | Documented the CSM giving dashboard, approve-all queue processing, final donor rematch, and People donor shortcut. |
| 2026-08-23 | 1.4 | Added the production launch architecture, environment guard, isolated Workers and D1 databases, and deployment order. |
| 2026-08-23 | 1.3 | Added inclusive form and portal wording, the internship ZIP workflow, and safer Word list pagination. |
| 2026-08-23 | 1.2 | Added Word editions and their build, visual-review, and synchronization workflow. |
| 2026-08-23 | 1.1 | Added conflict-safe document synchronization and the daily 2:30 a.m. task. |
| 2026-08-23 | 1.0 | Established the guide from the current site, portal, Workers, and validation rules. |
