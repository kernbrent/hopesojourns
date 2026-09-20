# Hope Sojourns developer guide

Version 4.5.3

Last reviewed: September 18, 2026

## Inbox completion and trash

GET /admin/ministry/inbox returns source-visible notices with saved completion or deletion state and a canManage flag. POST to the same route accepts itemId and action: complete, reopen, delete, or restore. Actions require inbox edit access, source visibility, and the existing authenticated CSRF checks. The state change and audit entry are saved in one database batch. These actions organize the shared inbox for all authorized users; they never approve payments, finish budgets, or modify source records.

Apply migration 0027_ministry_inbox_states.sql before releasing the updated Worker and ministry UI. It adds a separate state table keyed by prefixed source IDs, preserving the prior manual completion state while an item is in Trash. Reopen removes the manual override and uses the current source status. Restore preserves prior manual completion or uses the current source status. Source visibility and the existing recent-source limits still apply; this is not an unlimited historical archive. Local regression tests cover the action lifecycle, source preservation, validation, CSRF, and read-only or inaccessible-source denial.

## Contact follow up editing

Contact follow-up fields are editable directly in People cards and Spreadsheet rows. Row saves submit only personIds, lastContactedAt, and lastContactedNote to the existing authenticated /contacts/bulk-activity endpoint. Selected-row updates reuse its 100-contact batch limit and 50-character note limit. Confirm replacement of both fields before bulk saving; blank notes clear the previous note. Row saves retain other unsaved rows. Bulk refresh discards pending row edits with an explicit warning. General activity remains separate from actual contact dates. No migration or new API is required.

## Trip budget funding and bulk updates

The trip workspace loads admin/trips/budget-tools.js before trips.js. It renders estimated costs, recorded actual costs, active funding allocations, variance, and remaining funding. A zero actual amount is treated as not recorded unless the cost is Paid. Canceled costs and allocations are excluded. Allocation totals include Planned, Confirmed, and Paid funding; these are funding commitments, not receipts or ledger transactions.

Fund the entire budget previews positive uncovered balances per cost, using either the original estimates or actual costs where recorded. Saving creates Planned allocations through the existing allocations endpoint, preserves prior allocations, and never reduces excess funding. Refresh and review after a partial failure; there is no automatic retry. A pre-save workspace comparison detects changes since opening the dialog, but the sequential requests are not an atomic transaction or a server-side concurrency lock.

Edit multiple budget items supports quantity, estimated unit cost, actual total, estimate-review flag, payment status, paid date, and payment method. Only changed rows are submitted through the existing cost-items endpoint after review and paid-date validation. Untouched fields and original estimates are preserved; changing fixed-cost quantity or unit cost recalculates its estimated total. Percentage-derived fields are read-only. Existing server permissions, cost validation, budget recalculation, reopening, audit, and paid-expense ledger synchronization remain authoritative. The UI reports confirmed saves and stops on the first failure; close and refresh before retrying. No schema migration is needed.

## Shared HS and CSM accounts

Local implementation pending coordinated release. HS holds shared identities and passwords; CSM delegates through a private service binding named IDENTITY to the CsmIdentity entrypoint. The default public HS handler cannot invoke this entrypoint. The financial distribution secret is not reused for identity authorization. SHARED_SIGNIN stays disabled in configuration until an explicitly authorized release activates both portals.

Migration 0025 preserves existing user IDs and HS permissions. It adds is_org_admin, hs_access, csm_access, csm_is_admin, csm_permissions_json, portal-scoped sessions and requests, and one-use switch codes. Brent's existing primary/admin account becomes the first Organization Administrator with access to both portals. Other HS users receive no CSM access automatically. CSM migration 0004 removes legacy shared sessions and adds shared_account_activity. Finance ownership and existing financial records remain unchanged. After activation CSM accepts the existing HS account credentials, not its legacy shared password.

Organization Administrators manage shared identity, either membership, administrator appointments, global suspension, and deletion. Portal Administrators manage only their own portal's membership and section permissions. They may send password instructions to the existing account email but cannot receive an existing user's fallback token, issue temporary passwords, edit another person's shared identity, or manage Organization Administrators. Existing accounts requesting the other portal require an Organization Administrator to verify identity and link the account. Linking preserves its password and original membership. Users can edit their own shared name and contact information, not username or access.

HS retains contacts, trips, destinations, finances, documents, and inbox permissions. CSM has giving (PayPal, donor reports, distribution) and finances (bookkeeping, invoices, mileage, clients/projects, files). CSM's combined finance data response is one permission boundary. Blocked, Read only, and Edit are checked on the server. Page loads with read-only finance access do not trigger PayPal ledger synchronization. Membership removal affects only that portal. Global suspension/deletion ends access to both. The last usable Organization Administrator cannot be demoted, suspended, deleted, or deprived of both memberships. Deletion retains historical attribution and allows later username/email reuse with a new identity.

The private CSM adapter translates cookies and approved routes, never accepts caller-supplied actor IDs, checks origin and CSRF, and fails closed if identity is unavailable. Session token hashes live in the authority DB, scoped to one portal; both memberships and global status are checked on use. Each site retains its own HttpOnly, Secure, SameSite=Strict cookie. No password or session token appears in a redirect URL.

Switching begins at the destination with a random 120-second verifier cookie. The source creates a 60-second one-use code tied to its active session, destination, and verifier hash. The fragment callback is cleared from browser history immediately. Redemption atomically consumes the code, checks the source session and both memberships again, and creates the destination session. Redirects use configured HS_PORTAL_ORIGIN / CSM_PORTAL_ORIGIN defaults and approved www variants. The button appears only when the account has both active memberships and is not awaiting a password change.

The account and recovery screens are available in both portals under /admin/account/ and /admin/access/. /admin/shared-signin/ handles the switch. Shared account behavior is implemented in mmt-users.ts, shared-users.ts, shared-signin.ts, and identity-entrypoint.ts. admin/account/account.js and the switch/phone scripts are copied into CSM's canonical admin sources. Maintain those copies together. CSM account UI uses local admin theme assets and does not alter its public site. The existing HS email service sends invitations and recovery instructions; CSM-only invitation links point to CSM. HS inbox account requests and email failures are scoped to the viewer's administrative authority.

Access updates record the actor, timestamp, and before/after membership, role, status, and profile values. Own-profile updates identify changed fields. CSM records individual actors for financial mutations without changing the finance owner ID. Last logged in is updated for a successful password login or successful portal switch, not ordinary page visits.

Release order after explicit authorization: back up administration databases, verify Brent's HS account, activate the production flags, apply HS 0025 and deploy its Worker, apply CSM 0004 and deploy CSM with the named binding, then publish only affected HS admin assets. Keep test identity isolated from production. Repair outages without silently returning to the old shared password. The detailed coordinated release and rollback guidance lives in the CSM worker/docs/shared-accounts.md runbook.

Validation covers migrations using real SQLite, independent portal permissions, administrator boundaries, same-password login, account linking, scoped requests, temporary passwords, CSRF, browser-bound one-use switches, expiration, revocation, and reset invalidation. The Workers runtime test verifies the named service binding and its absence from public HTTP. Isolated browser checks exercise account creation and both switch directions on desktop and mobile. No production account or financial data are used in these tests.

## Donation allocations

Finance > Income > Split donation assigns a single payment to 2–100 donors without altering the original ledger amount, payer, PayPal identifiers, fee, or net deposit. Amounts use positive integer cents and must total the charitable amount before fees. Each allocation records the donor, original gift date, and optional note. Undo restores the original payer for giving statements and retains the history.

Migration 0024 adds donation_splits, donation_split_history, atomic save guards, and the donation_gifts reporting view. Giving statements and annual contribution reports query this view so the original payer is not counted alongside split donors. Existing rows are unchanged. Contact deletion and changes to a split's charitable total are blocked until the split is undone. Database triggers enforce totals; optimistic revisions prevent stale saves. Finance and contact permissions, CSRF, and existing session rules apply.

The shared admin/donation-splits.js dialog is loaded by the finance workspace. GET and PUT /admin/ledger/entries/:id/donor-splits expose the editor. Splits create or select donor contacts and retain revisions with the editing actor. Allocation names and email are snapshots; HS giving documents use the current contact profile.

CSM sends optional donorAllocations and donorSplitRevision in the existing distribution contract. Inbox approval writes contacts, the original payment, and allocations atomically. After transfer approval, HS is authoritative. The existing secret-protected POST /internal/donation-splits service allows CSM to read and update allocations for approved CSM source records only. CSM giving statements fetch those allocations, including when a status callback is delayed, and stop if authoritative data is unavailable. Before approval, CSM locks the submitted split; complete approval before editing it. CSM migration 0003 protects the split and transfer revision from concurrent changes.

Deploy the HS migration and Worker before the CSM migration and Worker, then publish the HS admin assets. No historical donation is automatically split. Reconcile original deposit totals separately from donor allocations. Test total mismatches, fees, original donation years, multiple donors, edit/undo, stale changes, authorization, and transfer approval. Payment dashboards and bank exports continue to show original payment activity; giving statements show attributed gifts.

## Individual MMT accounts and phone storage

The administrator user directory displays Last logged in from the existing mmt_users.last_login_at field, in the viewer’s local time zone with a zone label. Missing timestamps show Never logged in. Only successful authentication updates this timestamp; failed attempts and session activity do not. The account API returns the nullable timestamp; no migration is required.

This account upgrade is implemented locally and has not been released. The existing administrator signs in as admin using the existing password. Migration 0020_mmt_users.sql creates individual users, access and recovery requests, hashed reset tokens, email events, and public rate limits. It ends existing administrator sessions so subsequent activity has an identifiable user. Passwords use salted PBKDF2 hashes; no recoverable password is stored. The legacy password is accepted only to initialize the primary account when no stored hash exists.

The account workspace at /admin/account/ provides personal profile editing and administrator user management. Users can change their name, email, phone, and country, but cannot change their own username or access. Administrators assign Blocked, Read only, or Edit separately for contacts and ministries, trip operations and budgets, public destinations, finances, documents, and the inbox. The contacts group includes people, ministries, teams, and public requests. Trip access includes participant and budget information; trip imports and exports also require contact access. Administrator status grants all sections and user management. Server authorization is authoritative; hiding navigation is only a usability aid. The last usable administrator cannot be disabled or demoted. Account and access changes invalidate affected sessions and outstanding setup links.

The public /admin/access/ page provides access requests, forgotten-password requests, and administrator recovery requests. Access and recovery requests enter the administrator inbox. Approving an access request creates an account with explicitly selected permissions. Recovery approval requires independent identity verification; submitted contact details do not automatically replace trusted account information. Administrators can issue a temporary password valid for one sign-in within 24 hours. That session can only change the password or sign out until a personal password is saved. New-account invitations let the recipient choose a personal password before first sign-in.

Invitation links expire after 24 hours; reset links expire after one hour. Tokens are stored hashed, claimed once atomically, and carried in URL fragments that the page clears after reading. Resetting a password revokes existing sessions. Public recovery responses do not reveal whether an account exists. Public forms are rate limited, and authenticated writes require CSRF protection. Audit records include the acting user when invoked through the Worker request context.

Account email supports Resend through src/account-email.ts. Set MMT_EMAIL_PROVIDER=resend, MMT_EMAIL_DELIVERY_MODE=live, and the RESEND_API_KEY Worker secret only after domain verification. Use a sending-only key restricted to hopesojourns.com; never put it in source control. Sender and reply-to default to admin@hopesojourns.com. Disable domain click/open tracking for account links. This account-only switch leaves existing trip-message delivery unchanged. Provider acceptance records Sent; it does not prove inbox delivery. Rejections or timeouts preserve Not sent and the administrator's private setup-link fallback. Public responses never expose the link. Requests have a ten-second timeout, use manual redirect handling (all 3xx responses are rejected), use a per-token idempotency key, and do not automatically retry or fall back to another provider. Delivery diagnostics trim surrounding credential whitespace; log mmt_email_rejected with provider and HTTP status, or mmt_email_failed with an allowlisted exception type. Never log keys, recipients, message bodies, setup links, provider response bodies, or exception messages. The domain is verified with enforced TLS. Production activation requires the encrypted API key and the authorized Worker deployment.

Migration 0021_us_phone_storage.sql normalizes clearly identified US phone values in people, ministries, trip funding sources, billing accounts, and MMT users. Valid ten-digit values are stored without punctuation; an eleven-digit value beginning with 1 loses that country prefix. Triggers apply the same rules to subsequent writes. Explicit foreign countries, international prefixes, extensions, and ambiguous values are preserved for review. Historical audit and JSON snapshots remain unchanged. phone-ui.js supplies the (###)###-#### presentation mask without using the mask as the stored value.

Release procedure: obtain explicit deployment authorization, capture a database recovery point and record counts, apply migrations 0020 and 0021, and deploy the compatible Worker and account assets together. Verify the existing admin password, permissions, invitation delivery, recovery, and canonical phone values before opening access to more users. Do not include unrelated pending public redesign work. Local regression coverage includes authentication, section enforcement, temporary passwords, one-use reset links, administrator protection, request throttling, recovery review, email payloads, and phone preservation.

## Managed public destinations

Local implementation adds /admin/destinations/, destinations-public.js, and migration 0019_public_destinations.sql. Destinations are public marketing content, separate from dated trips and private traveler or financial records. The migration preserves the seven existing opportunity IDs and seeds their current public content. Public tiles, destination detail pages, and interest-form choices read the same published destination list. Existing /trips/ links remain valid; new pages use /destination/?destination=slug.

Authenticated /admin/destinations APIs manage content, visibility, and photos; writes require CSRF and revision checks. Public /public/destinations endpoints expose published content only. Draft and hidden destinations return 404 publicly; hiding retains associated records. Photos accept JPEG, PNG, or WebP up to 6 MB, stored under destination-images in the existing private R2 binding. Only the current published photo is publicly served, with no-store headers. Original objects are retained for recovery.

Display order is a nonnegative integer; lower values appear first. Assigning an occupied number inserts the destination there and increments all other destinations at or above that number by one, including drafts and hidden destinations. The bump and save occur in one database batch. Bumped records receive new revisions; their opportunity order is synchronized by triggers. Unchanged order or an unoccupied number does not shift neighbors. Stale edits cannot reorder records, and failed creates roll back all shifts. Tests cover collisions, unchanged order, rollback, public visibility, authentication, and stale edits.

Destination release status: deployed from commit f3e9fd0 on September 17, 2026, including migration 0019. Unrelated pending homepage redesign changes were excluded.

## 1. Purpose and operating rules

This is the living technical guide for the Hope Sojourns website, response portal, and supporting Cloudflare Workers. It explains how the current system is organized, how to make safe changes, and which checks should run before work is handed off.

The repository may contain unrelated or unfinished work. Preserve changes you did not create and keep requested work narrowly scoped.

Do not commit, push, publish, deploy, merge, or open a pull request unless the user explicitly requests that exact action. Local editing, local migrations, tests, and dry runs do not grant deployment permission.

## 2. System overview

Hope Sojourns is primarily a static, progressively enhanced website with public interest, trip-management, financial, and giving workflows backed by Cloudflare Workers and D1.

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
| `/trip/` | Public page for one administrator-created actual trip |
| `/journey/` | Shared-credential traveler portal for common trip content |
| `/trip-account/` | Token-protected individual, family, group, organization, or sponsor financial statement |
| `/admin/trips/` | Administrator trip workspaces, catalogs, budgets, accounts, communications, and publishing controls |
| `/admin/annual-summary/` | Printable annual contact summary separating charitable gifts from other payments |
| `/cloudflare/interest-worker/src/trip-platform.ts` | Trip platform validation, persistence, public/private APIs, financial posting, and message delivery |
| `/cloudflare/interest-worker/src/spreadsheet-reader.ts` and `trip-import.ts` | Bounded XLSX decoding plus trip-sheet/header normalization and dependency ordering |
| `/cloudflare/interest-worker/src/trip-xlsx.ts` | Worker-safe generation of the current-trip XLSX download without exposing secrets |
| `/cloudflare/build-test-site.mjs` | Creates the ignored `/site-dist/` Pages artifact and explicitly includes the public, admin, journey, trip-account, and actual-trip routes |
| `/tools/build_trip_import_template.mjs` | Generates the canonical branded trip bulk-import workbook in the task output directory |
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
| `/` | Shared story-led welcome with a direct main-site link | `/script.js`, `/experience.js` |
| `/explore/` | Complete main page and retained journey catalog | `/script.js`, `/experience.js` |
| `/stories/` | Two manually paced founding stories | `/script.js`, `/experience.js` |
| `/discover/` | Curiosity-led exploration and practical continuations | `/script.js`, `/experience.js` |
| `/partners/` | Local ministry partnership introduction | `/script.js`, `/experience.js` |
| `/groups/` | Church, workplace, and community journeys | `/script.js`, `/experience.js` |
| `/students/` | College and university partnership introduction | `/script.js`, `/experience.js` |
| `/about/` | Ministry, partnership, and founder information | `/script.js` |
| `/giving/` | Giving explanation and PayPal widget | `/script.js`, `/giving/giving.js` |
| `/interest/` | Public interest submission | `/script.js`, `/interest/interest.js` |
| `/internships/` | Internship pathways and opportunities | `/script.js` |
| `/resources/` | Searchable/filterable resource library | `/script.js`, `/resources/resources.js` |
| `/resources/do-you-see-me/` | Resource article and audio/lyrics experience | Article-specific JavaScript |
| `/schedule/` | 30-minute Calendly conversation booking | `/script.js`, Calendly embed |
| `/past-trips/` | Past-trip archive | `/script.js` |
| `/past-trips/gallery/` | Filterable photo archive | `/script.js`, gallery script and JSON |
| `/trip/?trip=<actual-trip-slug>` | Public detail for a dated actual trip | `/trip/trip.js` |
| `/journey/` | Shared trip credential sign-in and traveler-only resources | `/journey/journey.js` |
| `/trip-account/?access=<one-time-issued-token>` | Private account statement and balance | `/trip-account/trip-account.js` |

### Public story experience maintenance

The September 2026 redesign is authorized for `test.hopesojourns.com` only. It changes public static pages, not Workers, D1 databases, receipt buckets, payment behavior, or private portal logic. The shared public header and visual treatment also reach existing public detail pages. Production requires a separately requested promotion; no commit or push is required for a direct test Pages deployment.

`tools/build_front_door.py` generates the seven public entry, exploration, story, and partnership pages. Edit this source for their copy and structure, then regenerate with the bundled Python runtime. The retained journey catalog lives in `tools/front-door-journey-catalog.inc`; dates and opportunity descriptions there must remain synchronized with the developing journey information. The include is an authoring source and is not part of the public artifact.

`experience.css` imports the existing palette through `/styles.css` and scopes public treatments to `body.hs-redesign`. The shared stylesheet imports the experience stylesheet so existing public pages adopt the same presentation. New pages explicitly load both stylesheets. `script.js` adds the public body class, shared header and footer, main-site escape, mobile menu state, and legacy `/#trips` forwarding to `/explore/#trips`. Private administration pages do not load the shared public script and retain their own styles.

`experience.js` uses native URL fragments for `red-1`, `red-2`, `john-1`, `john-2`, `discover`, `partners`, and `together`. It reveals the selected panel, hides its siblings, and moves focus after visitor navigation. Browser back and forward use native history. Without JavaScript, all story and discovery panels remain readable. No story progress, persona, inferred role, or browsing preference is persisted or sent to an API.

The new pages link to the existing interest form, internship information, giving options, and scheduling page. They do not add a new submission endpoint or send messages. Header access to `/explore/` remains visible outside the mobile menu at all screen sizes. Stories additionally expose a direct main-site exit. The old timed invitation and scroll-reveal block is disabled for the redesigned public body class.

Existing ministry photographs copied to `assets/ministry-gathering-athens.jpg` and `assets/athens-team-2026.jpg` come from the ministry’s previously used `christiansteps.net` image URLs. Local optimized copies avoid a third-party load dependency on the main page. Shared CSS and JavaScript use revalidation cache headers.

Run `tools/check-front-door.cjs` with the bundled Node runtime and an optional origin argument to check the public routes, four viewport sizes, both story flows, browser history, three discovery directions, menu/Escape behavior, image loading, and no-JavaScript reading. The checker uses an isolated browser and writes review images under the unpublished `output/front-door-review` directory. It makes no form submissions or donations. Also run `Check-Color-Palette.ps1` and build the allowlisted artifact before publishing to the dedicated test Pages project.

### Developing trip rendering

The route stubs under `/trips/<slug>/` set `data-trip="<slug>"` on the body, load `/trip.js`, and provide `<main id="trip-main"></main>`. `trip.js` selects the matching data object and renders the page.

Current slugs include `athens`, `arkansas`, `belize`, `kenya`, `mexico-city`, `nice`, and `others`.

### Past-trip pages

Past-trip pages are static archives. The legacy `/past-trips/kenya-2019/` route immediately redirects to the corrected Kenya 2018 page and still loads the shared stylesheet for its fallback content.

### Private route

`/admin/` is the private response portal. It loads the global stylesheet first, then `/admin/admin.css`, and uses `/admin/admin.js` to communicate with `/api/interest/admin`. `/admin/trips/` uses the same administrator session for focused trip workspaces, and `/admin/annual-summary/` creates printable contact summaries without exposing them publicly.

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

HTML references use query values such as `/styles.css?v=26` and `/script.js?v=15`. When a shared asset changes, bump its query version everywhere that loads it. Keep versions consistent for the same shared file; do not leave pages pointing at several generations of the same stylesheet.

## 6. Content and data files

### Developing trips

Use **Destinations** in the admin portal to create or edit public destinations. Save new entries as Draft, add a photo, then publish. Set Display order to choose tile placement; occupied numbers automatically bump later destinations. Existing route stubs remain valid and new destinations use the generic destination page. Dated trips and private program records remain separate.

### Resources

`/resources/resources.json` is the library data source. `/resources/resources.js` fetches it without long-term caching and renders filters, featured cards, related items, collection actions, and search results.

Use stable IDs, valid types, accurate metadata, descriptive action labels, and valid `relatedIds`. If a resource needs a full local article, create its route and keep the JSON entry linked to that route.

A top-level resource may use an `actions` array when an article, song, video, sermon, or other media item should appear inside one collection tile. Each action requires `type`, `label`, and `url`; it may also include `description`, `author`, `duration`, `media`, `secondaryLabel`, `secondaryUrl`, and `downloadName`. Set `media` to `audio` for an inline audio player. Action types and copy are included in search and type filtering, but the matching collection renders only once. Use `fullWidth: true` when a featured collection needs a one-column layout to keep the bundled controls readable. Do not create separate top-level records for items that are intentionally presented as one collection tile.

YouTube URLs in top-level resources and collection actions are detected by `/resources/resources.js` and rendered as responsive, privacy-enhanced `youtube-nocookie.com` players with direct YouTube fallbacks. Standard watch, share, embed, Shorts, and live URL forms are supported. Collection actions render in JSON order, so place a video action after the sermon when it should appear at the bottom of the card.

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

`/cloudflare/interest-worker/src/index.ts` handles public submissions and admin APIs. The Wrangler configuration requires an explicit environment and binds `DB` and `RECEIPTS` to different D1 databases and private R2 buckets in each environment:

| Environment | Worker | Route | D1 database | Private receipt bucket |
|---|---|---|---|---|
| Test | `hope-sojourns-interest-test` | `test.hopesojourns.com/api/interest` and `test.hopesojourns.com/api/interest/*` | `hope-sojourns-forms-test` | `hope-sojourns-receipts-test` |
| Production | `hope-sojourns-interest-production` | `/api/interest` and `/api/interest/*` on `hopesojourns.com` and `www.hopesojourns.com` | `hope-sojourns-forms-production` | `hope-sojourns-receipts-production` |

`/cloudflare/interest-worker/scripts/verify-environment-isolation.mjs` fails when routes, allowed origins, environment names, database IDs, or receipt-bucket names cross those boundaries. Both the exact `/api/interest` path and its `/api/interest/*` descendants must be routed so the public submission endpoint and admin endpoints reach the same environment-specific Worker. Never copy a test D1 export, R2 receipt object, backup, credential row, or user-data row into production. Production is initialized only by applying the numbered migrations to its database and uses a dedicated production receipt bucket; migrations seed the legitimate opportunity catalog but no contacts, submissions, teams, ministries, sessions, administrator credentials, or receipt files.

Current migrations:

1. `0001_initial_forms.sql`
2. `0002_enforce_trip_registration_kind.sql`
3. `0003_admin_portal.sql`
4. `0004_admin_filter_indexes.sql`
5. `0005_admin_teams.sql`
6. `0006_master_contacts_ministries.sql`
7. `0007_contact_imports.sql`
8. `0008_admin_credentials.sql`
9. `0009_csm_distribution_inbox.sql`
10. `0010_last_contacted_note.sql`
11. `0011_unified_ledger.sql`
12. `0012_ledger_entry_management.sql`
13. `0013_ledger_receipts.sql`

14. `0014_trip_platform.sql`
15. `0015_trip_bulk_imports.sql`
16. `0016_trip_budget_planning.sql`
Do not edit a migration that has already been applied to a shared environment. Add a new numbered migration.
Migration `0011_unified_ledger.sql` creates `ledger_entries`, indexes its date, type, source, and linked-person fields, and backfills existing approved CSM `financial_transactions`. Apply it before deploying Worker code that reads or writes the unified ledger.
Migration `0012_ledger_entry_management.sql` adds the optional `check_number` field. Apply it before deploying Worker or portal code that reads, writes, searches, imports, or exports check numbers.
Migration `0013_ledger_receipts.sql` creates receipt metadata with a cascading relationship to `ledger_entries`. Apply it and provision the environment's private R2 bucket before deploying Worker code that lists or stores receipts.

Migration `0014_trip_platform.sql` creates the actual-trip, content, organization, team, cost, allocation, account, charge, support-credit, payment, payment-request, private-link, portal-session, portal-rate-limit, invitation, interest, and email-outbox tables. It also adds trip, purpose, charitable-amount, account, and funding-source dimensions to `ledger_entries` and seeds editable funding-source and cost-category catalogs. Apply it before deploying the trip platform Worker or pages.

Migration `0016_trip_budget_planning.sql` adds the paying-traveler multiplier and explicit budget-completion time to `trips`, plus calculation method and percentage rate to `trip_cost_items`. Apply it before deploying code that reads or writes the budget-planning fields.



### Admin security model

The response portal uses secure HTTP-only sessions, CSRF protection for state-changing requests, rate-limited login attempts, audit records, and D1-backed password changes. Required secrets include:

- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`

Never store those values in source, documentation, test snapshots, or browser-accessible JavaScript.

A direct visit to `/admin/` always starts on the login page. Startup may check for a newer frontend build, but it must not exchange a remembered session for immediate dashboard access. The one exception is intentional navigation from the authenticated `/admin/trips/` workspace: those links write the one-time `hope-sojourns-admin-navigation` marker to same-tab session storage, and `/admin/` consumes and removes the marker before validating the existing HTTP-only session through `GET /admin/session`. The destination hash selects People, Ministries, or Organization finances after validation. An invalid or expired session still returns to login, and a direct visit without the marker still requires an explicit login-form submission. The password field retains the current-password autocomplete attribute so the browser can securely prefill a saved password, and the non-sensitive “Remember me” checkbox preference is retained in local storage; the password itself must never be copied into local storage or other browser-accessible application data.

The portal supports people, submissions, contact editing/import, teams, ministries, internship-toolkit access, replies, status changes, CSV export, and confirmed deletion flows. A contact can store `last_contacted_at` plus a short `last_contacted_note`; the note is limited to 50 characters in the browser, Worker, and D1 schema, appears in person details and contact CSV exports, and is preserved by spreadsheet imports. The Contact type search filter presents its options alphabetically by label. The Internship toolkit exposes a download-all ZIP while preserving every individual document download. CSV output must continue to neutralize spreadsheet formulas.

### Compact contact-card disclosure

The renderPersonCard() function returns an article containing separate controls rather than making the whole card a button. The closed state exposes only Name, Contact type, Organization, and Phone number through elements marked with data-person-compact. The underlined name button calls openPerson() directly to display the complete contact record. A separate plus/minus button calls togglePersonCard(), which closes any other expanded contact card before passing the selected card to setPersonCardExpanded().

Expanded-only summary fields and the **View everything** button use data-person-expanded. setPersonCardExpanded() changes their hidden state, the card's is-expanded class, the plus/minus button's expanded value and accessible label, and state.expandedPersonId. The full-record dialog opens through openPerson() from either the underlined name or the expanded **View everything** action.

`renderPersonDetail()` inserts **Email address** and **Phone number** rows after **Preferred contact** only when the corresponding person value is present. Keep these checks in the row construction so `detailList()` continues to use **Not provided** for required profile rows without creating empty communication fields.

applyListResult() prepends renderPersonListHeading() only for non-empty People results. Keep the four headings synchronized with personCompactField() calls and with the phone labels in /admin/admin.css. Preserve the one-card-at-a-time behavior and the focused contract test in /cloudflare/interest-worker/test/contact-card-disclosure.test.ts when modifying this directory.
Date-only contact activity values use local calendar parsing in the portal. Do not pass a `YYYY-MM-DD` string directly to the JavaScript `Date` constructor for display, because UTC interpretation can move the visible date one day earlier in United States time zones.

### Admin mobile rendering

`/admin/index.html` includes a phone-only `#admin-mobile-workspace-select` with the same view values as the desktop tab list. `/admin/admin.js` keeps that selector synchronized inside `switchView()` and routes selector changes through the same view-loading path as tab clicks. When adding or renaming a top-level workspace, update the desktop tab, the mobile option, the `tabs` map, and the view-title map together.

Generated contact, ledger, ledger-import, and contact-import tables pass through `prepareResponsiveTable()`. The helper copies each desktop column heading into a `data-column-label` on the corresponding body cell and applies the shared responsive-table class. `/admin/admin.css` uses those labels to present each row as a readable record card at `760px` and below; desktop behavior remains table-based. New generated admin tables should use the same helper unless their mobile presentation is intentionally different and documented.

The phone layout also replaces the desktop tab strip with the sticky workspace selector, stacks forms and actions, removes table-shell overflow for converted tables, and expands supported admin dialogs to `100dvh` with sticky headings. This is a presentation-only layer: it does not change API routes, authentication, authorization, storage, or record semantics.

### Admin cache and data refresh

`/admin/index.html` declares its current build in `data-admin-build`; that value must match `/admin/version.json` and the query revision on `/admin/admin.css` and `/admin/admin.js`. The version manifest is fetched with `cache: "no-store"` at startup, on `pageshow`, and when a hidden mobile tab becomes visible. If a different revision is found, the browser adds a one-time refresh query and reloads the page. A session-storage guard prevents a reload loop while a Pages deployment is still converging.

All authenticated GET and HEAD requests in `api()` and `apiDownload()` use `cache: "no-store"`. **Refresh data** therefore re-reads the active production API and database-backed view; it never resets or migrates D1. When the Admin Portal returns to the foreground after at least one minute, it automatically checks the build and refreshes the visible workspace if its data is stale.

**Update portal** performs an explicit page reload with a unique query value so the newest no-store HTML can load the current versioned CSS and JavaScript. The `/admin/*` response rule remains `no-store, private`, while `/styles.css` uses `max-age=0, must-revalidate` so the shared stylesheet may be stored but must be checked before reuse.

The contact spreadsheet supports persistent row selection for up to 25 contacts at a time. One bulk action updates `last_contacted_at` and `last_contacted_note`; document actions generate personalized Word files from the branded giving-statement template or an uploaded `.docx` template. The server repeats all selection, length, file-size, and template validation even when the browser has already enforced it.

### Payment inbox and giving ledger

`/cloudflare/interest-worker/src/csm-distribution.ts` receives the Christian Steps Ministries distribution feed, lists transactions for review, records approvals or denials, writes approved transactions to the Hope Sojourns financial ledger, and reports the decision back to CSM. The feed accepts received gifts and sent payments; holds and releases are not part of this workflow.

The portal labels this workspace **Payment inbox**. Keep the internal route names, source-type value, and Worker integration identifiers as `csm` because they identify the upstream system; use the purpose-based Payment inbox wording in administrator-facing navigation, headings, loading text, and empty-state text.

The inbox response includes a current-year `givingSummary` computed from approved `financial_transactions` using UTC calendar-year boundaries. The large value is gross received donations. The supporting values are net received after fees, the count of received donations, distinct linked givers, and the absolute value of sent payments. Sent payments are reported separately and never reduce gross received.

The portal's **Approve all awaiting** action processes the open queue in repeated batches, up to the safety limit of 5,000 transactions. It calls the existing per-transaction approval endpoint for every item so audit records, ledger writes, callbacks, and failure reporting remain identical to individual approval. Received gifts link to an existing Person or create a donor; sent payments do not create People.

Immediately before creating a new donor, the Worker repeats its exact normalized-email match when no person was selected or stored. This final check prevents a duplicate Person when an earlier approval in the same bulk run already created the donor. Approval responses include `createdPerson`, allowing the portal to report how many new donors were added. **View donors in People** resets the People filters, selects Donor, sorts newest first, and opens the People view so approved donors are immediately visible.

### Unified financial ledger


`/cloudflare/interest-worker/src/ledger-admin.ts` owns the authenticated ledger, contact-activity, and document-generation APIs. The routes are:

| Method and route | Purpose |
|---|---|
| `GET /admin/ledger` | Filtered, paginated entries, summary totals, years, and category suggestions |
| `POST /admin/ledger/entries` | Create one validated manual income or expense entry |
| `PUT /admin/ledger/entries/:id` | Validate and update an existing ledger entry without changing its source or import key |
| `DELETE /admin/ledger/entries/:id` | Permanently delete one ledger row and its stored receipt objects while retaining audit events |
| `GET /admin/ledger/entries/:id/receipts` | List authenticated receipt metadata for one ledger entry |
| `POST /admin/ledger/entries/:id/receipts` | Validate and privately store one receipt file for an expense |
| `GET /admin/ledger/entries/:id/receipts/:receiptId/file` | Stream one authenticated private receipt with no-store security headers |
| `DELETE /admin/ledger/entries/:id/receipts/:receiptId` | Permanently delete one receipt record and private object |
| `POST /admin/ledger/imports/preview` | Parse an Excel or CSV file and return editable row values plus duplicate and validation classifications |
| `POST /admin/ledger/imports` | Re-parse the original file, apply the reviewed row set, revalidate every edit, and insert only new valid rows |
| `GET /admin/ledger/export.xlsx` | Export the complete ledger, receipt counts, and reusable category lists |
| `POST /admin/contacts/bulk-activity` | Update the latest-activity date and 50-character note for selected contacts |
| `POST /admin/contacts/documents` | Create a ZIP of personalized Word documents for selected contacts |

`ledger_entries` is the unified reporting store. `source_type` distinguishes `csm`, `import`, and `manual` entries. Each row has a unique `import_key`, a separate `content_fingerprint`, and an optional `check_number`; together they let a spreadsheet preview distinguish a previously loaded row from a changed row that reuses a sequence number. CSM approvals write the legacy `financial_transactions` record and its unified ledger row in the same D1 batch. Imported income uses exact normalized donor-name matching when a unique Person exists; ambiguous or unmatched names remain unlinked for safe review.

The HSLedger importer accepts `.xlsx` or `.csv`, no more than 2 MB and 1,000 data rows. It recognizes the current ledger layout plus optional Check Number aliases, ignores sequence-only placeholder rows, and validates dates, types, amounts, text lengths, and required categories. The preview permits the administrator to edit fields or omit selected source rows. Commit re-parses the original upload, verifies that every submitted row number existed in that file, applies only the reviewed rows, repeats all validation, recomputes deduplication identities, and inserts only rows classified as new. Omitted rows are not deleted from the source file or from the database. The export is a real `.xlsx` workbook with `Ledger` and `Categories` worksheets and includes check numbers and per-entry receipt counts; binary receipt files are not embedded in the export.

Manual entries reuse category values already present in the database while retaining safe defaults. Existing manual, spreadsheet, and CSM ledger rows can be corrected through the authenticated update route or permanently removed through the typed-confirmation delete control; both actions write audit events. An expense with receipts cannot be changed to income until those receipts are removed. Deleting a ledger entry also removes its receipt metadata and private objects; deleting a CSM-sourced ledger row does not delete its upstream `financial_transactions` record. Editing does not change the row's source or unique import key. Amounts are stored as positive numbers and interpreted through `entry_type`; financial reporting computes balance as income minus expenses.

### Actual trip platform

`/cloudflare/interest-worker/src/trip-platform.ts` owns actual-trip administration and the three intentionally different participant-facing surfaces:

| Surface | Access | Information |
|---|---|---|
| `/trip/` | Public | Approved summary, dates, location, interest action, and content marked both Public and Published |
| `/journey/` | One shared trip login ID and password | Devotionals, instructions, itinerary, resources, updates, and opted-in team-directory fields |
| `/trip-account/` | Expiring private account link | One individual, family, group, organization, or sponsor account's charges, payments, support credits, requests, and balance |

An actual trip is a dated operational record in `trips`. Its optional `opportunity_id` links it to one broader public opportunity, such as Mexico City. This preserves the evergreen idea page under `/trips/<slug>/` while allowing several actual departures, each with its own dates, status, capacity, public page, interest intake, content, traveler portal, team, partners, and finances. Completing a trip does not publish private content automatically.

The administrator workspace is `/admin/trips/`. Its bootstrap endpoint returns trips plus shared People, Ministries, funding-source, cost-category, and public-opportunity lists. A trip workspace returns its content, interest records, members, organizations, accounts, costs, allocations, charges, support awards, payments, payment requests, invitation records, and message outbox. Create and update routes reuse the main administrator session, CSRF token, audit log, validation conventions, and no-store response headers.

The trip interface labels read-only cards as summaries and identifies cards with labeled fields and Save buttons as entry forms. Trip workspace panels use `trip-admin-card`; do not reuse the public `trip-card` class because `/styles.css` gives public destination cards an absolute visual overlay, fixed minimum heights, grid spans, and hover transforms that can cover or resize form controls. The administrator UI contract test must continue to reject the public class token in `/admin/trips/index.html`. Core trip and public settings open through the shared trip dialog; backdrop clicks are intercepted and `closedby="closerequest"` permits only an intentional close request. `renderPrerequisiteGuidance()` checks the active People, Ministries, cost-category, funding-source, cost-item, and trip-account records. When a required catalog is empty, the affected card shows a **Please complete [prerequisite] before this [item]** note and disables its submit button. People and Ministry notes link to the corresponding main administrator workspace. Those cross-workspace links set a one-time navigation marker so the valid administrator session can be checked and reused without forcing another login. The main response center begins in an authentication-loading state; it reveals the login form only after a direct visit or failed session check, eliminating the old login flash during trusted navigation. Both administrator surfaces use the same local-storage sidebar preference and expose a collapsible rail. Team-member and connected-organization record cards provide Edit actions that repopulate their forms. Event listeners for independent forms, invitation creation, and invitation-link copying must be registered once during startup.


Guided setup is a presentation-layer helper, not stored trip data. `TRIP_GUIDED_HELP_KEY` saves only an on/off preference in local storage and defaults to enabled when no preference exists. `tripSetupSteps()` derives completion and true record dependencies from the currently loaded workspace, and `renderSetupGuide()` displays the completed/total count, progress meter, next action, and a clickable checklist. `openGuideStep()` opens any independent item immediately; blocked items raise the precise prerequisite in a transient live alert. `openNextGuideStep()` prefers the first incomplete item whose dependencies are currently met. Required prerequisite notices remain active when guided help is disabled.

The budget step is complete only when the administrator selects **Finish budget**. Saving a cost, changing the paying-traveler count, deleting a cost, or importing budget changes clears `budget_completed_at`; the administrator must review the recalculated totals and finish the step again. The budget register uses native `details` disclosures so saved items remain compact while one item or all items can be expanded without opening an edit form.

Budget and Accounts & Payments labels receive contextual What/Why help from the frontend field-help map. These small non-modal popovers are the intentional click-away exception: a click outside the help trigger and popover dismisses only that help text. Full semantic dialogs, including the Accounts & Payments page guide, continue to require an explicit close action and must never close on a backdrop click.

All password inputs in the main administrator, trip administrator, and traveler surfaces have accessible show/hide controls. Shared trip credentials are write-only: the Worker never returns a plaintext password. When `portal_login_id` exists, the browser locks and mutes the credential card until **Unlock credentials** is selected. A replacement requires a new password and the existing save route revokes all traveler sessions.

Trip bulk import is a preview-first multipart route at `POST /admin/trips/:id/import`. It accepts only `.xlsx` files up to 3 MB and at most 200 populated rows. The bounded ZIP/XML reader rejects path traversal, encrypted or unsafe packages, excessive entries or decompressed bytes, formulas, unsupported files, duplicate Import Refs, and unsafe changed-data reuse. The supported data sheets are People, Ministries, Team, Partners, Content, Accounts, Budget, Allocations, Charges, Support, Payments, and Invites; Instructions and blank sheets are ignored. Dependency order creates or updates People and Ministries first, then partner and team links, followed by content, accounts, budget items, allocations, charges, support, payments, and invitations. This permits a new person or ministry to be referenced elsewhere in the same workbook. People are referenced by email; Ministries, cost categories, and funding sources by normalized name; dependent trip records by their workbook Import Ref. Cost categories and funding sources remain administrator-managed setup lists and must already exist.

`GET /admin/trips/:id/export` builds a current-trip workbook directly from D1. Existing rows include pale metadata columns for Record ID, Original Updated At, and Original Fingerprint; partner rows also include Original Role because role is part of that relationship's key. Administrators may edit ordinary cells, add rows, and upload the same workbook. Preview labels every row as Create, Update, Unchanged, or Blocked. Update rows require the original metadata and are blocked when the portal record changed after download, so a stale workbook cannot silently overwrite newer work. Existing payments are immutable audit records and must remain unchanged; corrections are entered as new rows. Invitation tokens and private links are never exported.

Migration `0015_trip_bulk_imports.sql` adds `trip_bulk_import_rows`. Its unique trip/entity/external-key constraint and SHA-256 content fingerprint make identical reruns safe while surfacing conflicting reuse. The current-trip export reuses a prior Import Ref when available and otherwise generates a deterministic trip-workbook reference. People and Ministries introduced for the trip remain in later exports even when a partially completed setup has not linked them to another trip record yet. Commit reuses the ordinary trip save handlers so validation, ledger synchronization, invitation token creation, audit events, and CSRF controls remain centralized. A row failure stops later ready rows; an administrator may correct and rerun the same workbook, and prior successful rows are skipped. New secret invitation paths are returned once in the commit result.

The Budget worksheet includes Calculation Method and Percentage Rate. Supported methods are `fixed`, `per_traveler`, and `percentage_of_individual`. A blank method in an older workbook remains `fixed` for backward compatibility. Percentage calculations are permitted only for the seeded Hope Sojourns Leadership Expenses and Administration / Overhead categories.

The canonical workbook is `/outputs/01a0775c-925e-7713-9822-42450cb2f4b6/Hope-Sojourns-Trip-Bulk-Import-Template.xlsx`. Rebuild it with the bundled Node runtime, `NODE_PATH` set to the bundled modules directory, and `tools/build_trip_import_template.mjs`. The test-site build copies this one source workbook to `/site-dist/downloads/Hope-Sojourns-Trip-Bulk-Import-Template.xlsx`; do not maintain a second source copy.

Trip invitations are hashed bearer tokens. They invite someone to apply or express interest in one actual trip; they are not traveler-portal credentials. They preselect the actual trip and optional organization on `/interest/`, can expire or have a maximum use count, and are revealed only at creation. A successful interest form links the submission and Person to `trip_interests`; it does not silently confirm the traveler. Administrators review the interest and control the separate `trip_members.status` lifecycle. Approved travelers receive the trip's separate shared ID and password.

The shared traveler password is PBKDF2-SHA-256 derived with a random per-trip salt and 100,000 iterations. The plaintext password is never stored. Successful sign-in creates an HTTP-only, Secure, SameSite Strict session cookie scoped to the portal API. Changing the credential revokes all existing sessions. Failed logins are limited by the hash of the normalized login ID and client address; repeated failures create a temporary block, and old attempt rows are removed automatically. The shared portal never includes account balances or payment history.

The traveler sign-in uses the shared Trip ID and trip password, not the traveler's email address. The client disables repeat submission while the portal opens, applies a 15-second request timeout, announces a longer-than-expected request after four seconds, and briefly retries the session lookup after a successful credential exchange. Success clears the message and hides sign-in before the portal appears; failures return the form to an actionable state without clearing the entered password.

Private financial access uses random account tokens whose hashes, expiration, revocation, and last-used time are stored in D1. Creating a replacement link revokes the prior active link. Because these links expose financial information, distribute them directly to the intended account contact and do not place them in the shared traveler portal or public pages.

The trip financial model separates obligation, cash, and responsibility:

- `trip_cost_categories` is an administrator-extensible list seeded with airfare, ground transportation, lodging, meals, onsite ministry donation, insurance, visas and fees, supplies, Hope Sojourns leadership, Hope Sojourns administration, contingency, and other.
- `trip_funding_sources` is an administrator-extensible list seeded with traveler, Hope Sojourns general, leader-support and scholarship funds, church or ministry sponsor, individual sponsor, external partner, grant, and other. A custom source may link to a Person or Ministry.
- `trip_cost_items` records estimates, actual totals, vendor, scope, dates, payment status, calculation method, and whether settlement occurred through Hope Sojourns or externally. `trip_cost_allocations` records who covered each cost and supports split funding.
- `per_traveler` costs represent one paying traveler's quantity times unit cost and are multiplied by `trips.paying_traveler_count`. Their per-person subtotal is the individual base. `percentage_of_individual` is restricted to the Hope Sojourns leadership and administration categories, applies its percentage to that base, and then multiplies the fee by paying travelers. Percentage fees are excluded from the base, so fees do not compound. `fixed` costs are included once. Covered leaders and scholarship recipients may remain trip members without being included in the paying-traveler count.
- A paid cost settled through Hope Sojourns automatically creates or updates one linked `ledger_entries` expense with purpose `trip_expense`. Editing that cost keeps the ledger row synchronized. Changing it to external settlement or a non-paid state removes only its automatic ledger posting. Externally paid costs remain in operational trip totals but never inflate Hope Sojourns cash expenses.
- `trip_accounts` supports individual, family, group, organization, and sponsor rollups. Multiple dated `trip_charges` provide installment plans; `trip_payment_requests` provide friendly balance notices instead of invoice language.
- `trip_coverage_awards` records leader support, scholarships, sponsor credits, fee waivers, and other approved coverage without pretending cash was received from the traveler.
- `trip_payments` records multiple payments, their funding source, purpose, payment method, status, and settlement route. Payments received by Hope Sojourns post to the unified ledger. External settlements reduce the appropriate trip account without becoming Hope Sojourns cash income. A payment application may reduce a selected charge only when the payment and charge use the same account.

The unified ledger distinguishes transaction purpose and charitable amount. A trip payment or administrative fee has a charitable amount of zero. A donation or scholarship contribution may have a charitable portion, and only that portion appears in charitable giving output. The existing branded giving statement remains donation-focused. `/admin/annual-summary/` produces a broader printable annual summary with one section for charitable contributions and another for non-charitable trip or administrative payments, including separate Hope Sojourns-received and externally settled totals. It is an administrative record and not tax advice.

The message outbox stores invitations, payment requests, statements, trip updates, and other messages before delivery. `EMAIL_DELIVERY_MODE` is `capture` by default in both configured environments; a Send action then returns a safe unavailable response and leaves the message queued. Live delivery requires all of the following: a Cloudflare Email Service `send_email` binding named `EMAIL`, `EMAIL_DELIVERY_MODE=live`, a verified sending domain, a permitted `EMAIL_FROM_ADDRESS`, and a valid `EMAIL_REPLY_TO`. Do not add the binding or switch modes until the Cloudflare account and sender are ready.

Inbound `admin@hopesojourns.com` forwarding is operational DNS/account setup, separate from Worker message delivery. Verify `christianstepsministries@gmail.com` as the destination in Cloudflare Email Routing, then add the `admin` custom address. Resend handles outgoing account mail; keep Resend receiving disabled so Cloudflare handles replies. Keep delivery in capture mode until both forwarding and outbound sender requirements have been tested in the test environment.

Primary route families are:

| Method and route | Purpose |
|---|---|
| `GET /admin/trip-platform/bootstrap` | Load trips and shared selection catalogs |
| `POST /admin/trips`, `PUT /admin/trips/:id`, `GET /admin/trips/:id` | Create, update, and open a trip workspace |
| `POST /admin/trip-platform/funding-sources`, `POST /admin/trip-platform/cost-categories` | Create or update administrator-managed catalogs |
| `POST /admin/trips/:id/<resource>` | Save members, organizations, content, costs, allocations, accounts, charges, awards, payments, payment requests, invites, or messages |
| `POST /admin/trips/:id/portal-credential` | Replace the shared credential and revoke sessions |
| `POST /admin/trips/:id/budget-plan` | Save the paying-traveler multiplier, finish the budget, or reopen it |
| `POST /admin/trips/:id/import` | Preview or commit a formatted XLSX trip import |
| `GET /admin/trips/:id/export` | Download the current trip as a safe round-trip XLSX workbook |
| `POST /admin/trips/:id/accounts/:accountId/access-links` | Revoke and replace a private account link |
| `POST /admin/trips/:id/messages/:messageId/send` | Deliver one queued message only when live email is configured |
| `GET /admin/trip-platform/annual-summary` | Return the two-part annual contact summary |
| `GET /public/trips`, `GET /public/trips/:slug` | List or read published actual-trip information |
| `POST /portal/login`, `GET /portal/session`, `POST /portal/logout` | Shared traveler portal session lifecycle |
| `GET /private-account/:token` | Read one unrevoked, unexpired private account statement |

### Expense receipt attachments

Expense receipts use two coordinated stores. D1 table `ledger_receipts` holds the ledger relationship, private object key, original filename, verified media type, byte size, SHA-256 digest, creator session ID, and creation time. The `RECEIPTS` R2 binding holds the binary object. Object keys are random-ID paths and are never returned by the API. Test and production use different buckets; neither bucket should have public development URLs or a custom public domain.

The portal presents receipt controls only on expense rows. An expense may hold up to 20 JPEG, PNG, WebP, AVIF, HEIC, HEIF, or PDF files, with a 10 MB limit per file. Mobile users can invoke the rear-facing camera through the capture input; all users can choose one or more existing photos or PDFs.

Photos returned by the dedicated camera input are optimized in the browser before upload. The portal honors encoded orientation, caps the longest edge at 2,000 pixels, re-encodes at 82 percent JPEG quality, and uses the optimized result only when it is smaller than the captured file. Canvas re-encoding removes incidental camera metadata. If the browser cannot safely decode or encode the capture, the original file continues through the normal upload path; manually chosen photos and PDFs are never changed. Browser acceptance and optimization are conveniences only. `/cloudflare/interest-worker/src/receipt-file.ts` still verifies file signatures, normalizes display filenames, and creates storage-safe object keys before an upload is accepted.

Receipt list and file-stream requests require a valid administrator session. Upload and delete additionally require CSRF validation. File responses use the D1-verified media type plus `private, no-store`, `nosniff`, same-origin resource policy, no-referrer policy, and a sandboxed content security policy. Upload and delete events are audited with size, media type, filename, and SHA-256 metadata.

R2 storage is written before D1 metadata; if the D1 write fails, the Worker removes the just-written object. Deleting a receipt removes D1 metadata first and then its object. Deleting a ledger entry relies on the D1 cascade and removes all known objects after the database deletion. Failed best-effort object cleanup is logged without disclosing file content. Reconcile those logs against R2 if a cleanup failure occurs.

A D1 backup alone is not a complete receipt backup. Full recovery requires the matching D1 metadata and R2 object inventory from the same environment. Do not restore test metadata or objects into production. Treat permanent receipt or expense deletion as irreversible unless a separate, access-controlled R2 backup or version-retention process has been established.

### Personalized Word documents

`/cloudflare/interest-worker/src/document-merge.ts` performs server-side `.docx` merging without executing macros or external programs. It accepts Word templates up to 2 MB and a maximum of 25 selected contacts. Text replacement works even when Word splits a placeholder across XML runs. Giving statements repeat the contribution-detail row and use the gross PayPal gift when available; the output ZIP includes one `.docx` per contact plus a manifest identifying contacts with no gifts in the selected tax year.

Supported placeholder forms include `[[FIELD_NAME]]` and `{{FIELD_NAME}}`. The current merge data supports contact identity, greeting, address, email, phone, organization, letter date, tax year, receipt statement, contribution total, and the giving-statement detail fields. Keep the canonical branded template at `/admin/supplemental-documents/Hope-Sojourns-Giving-Statement-Template.docx`. If a new placeholder is introduced, add its alias in `document-merge.ts`, add a test for split and unsplit Word runs, and update the portal help text.

`/cloudflare/interest-worker/src/office-archive.ts` provides the constrained ZIP reader/writer used by both spreadsheet and Word flows. Preserve its entry-count, expanded-size, path, compression, and CRC checks when extending Office-file support.

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
- Keep `last_contacted_note` to brief operational follow-up context; do not put confidential pastoral, medical, financial, or safeguarding details in this short field.
- Confirm destructive admin actions and maintain audit records.
- Use `rel="noopener noreferrer"` for untrusted external tabs.
- Review new third-party scripts for privacy, security, CSP, availability, and fallback behavior.
- Treat imported financial files and uploaded Word templates as untrusted binary input; preserve file-size, ZIP-entry, expanded-size, path, and format validation.
- Keep ledger deduplication server-side and preserve the unique `import_key`; browser preview alone is not a data-integrity control.
- Giving statements may contain donor names, addresses, and contribution history. Generate them only through authenticated, CSRF-protected admin routes and never store generated batches in the public static site.
- Treat receipts as private financial records. Keep R2 buckets private, require an administrator session to read a file, and require CSRF validation to upload or delete one.
- Validate receipt signatures on the server instead of trusting filenames or browser media types. Preserve the 10 MB per-file and 20-file per-expense limits unless Worker memory, audit needs, and storage cost are reviewed.
- A D1 backup contains receipt metadata but not R2 object bytes. Include both stores in any full financial-record backup or recovery plan.
- Keep the 25-contact document limit unless memory and CPU behavior is revalidated for the Worker runtime.

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

The Interest Worker has isolated test and production environments. Always name the intended environment in migration, secret, R2, and deployment commands. Production launch order is: validate isolation, create or verify the production D1 database and private receipt bucket, back up existing production data, apply production migrations, set production-only secrets, dry-run the production Worker, deploy it, publish the production Pages build, and verify both production hostnames. Test data and receipt files must remain bound only to the test Worker, database, and R2 bucket.

For an authorized test-site publication, build the allowlisted artifact and deploy that directory to the dedicated test Pages project:

```powershell
node .\cloudflare\build-test-site.mjs
npx wrangler pages deploy .\site-dist --project-name hopesojourns-test --branch codex/test-admin-portal
```

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

## Ministry Management workspace

The original Ministry Management implementation was deployed on September 17, 2026. The expanded bookkeeping extension below was authorized for production release on September 17, 2026. Apply migration `0017_ministry_management.sql` to the target environment before releasing the corresponding Worker and frontend, only after explicit deployment authorization. Preserve the existing database and private receipt bucket; no production data is copied into local previews.

`/admin/ministry/` adds Home, Inbox, Trips, Finances, and Documents while linking to all existing contact, ministry, ledger, receipt, import, statement, and trip tools. `/admin/` and `/admin/trips/` retain their original workflows. The new UI uses the existing administrator cookie and CSRF token. The API namespace `/admin/ministry/` is handled by `src/ministry-admin.ts`.

New trips use the standard template in `src/ministry-budget.ts` unless `useTemplate` is explicitly false. Trip codes and slugs are generated when omitted. Dates create up to 90 daily devotional and itinerary drafts, plus preparation and packing resources. These are editable outlines, not a completed devotional library. Content starts private and unpublished. New-trip creation is one atomic database batch.

Budget items distinguish traveler expenses, HS costs, and local ministry donations. HS Trip Leadership and Administration Fee is separate from HS Travel contribution. HS Travel defaults to 10 percent of eligible travel items, excluding percentage fees; the percentage or calculated amount can be overridden using the existing calculation methods. Eligibility is explicit. The leader travel expense is a separate fixed HS expense that is not charged to travelers a second time. The contribution and administrative fee are budget charges, not automatically posted outgoing expenses.

Traveler assignment creates an individual account when needed and snapshots reviewed budget items into itemized charges. Unestimated items are skipped until reviewed. `GET /admin/ministry/trips/:id/budget-review` returns differences and a revision fingerprint; POST applies the reviewed changes. Existing payments are preserved, stale reviews are rejected, and a charge cannot be reduced below its applied funding. Budgets remain editable independently of issued traveler charges.

The funding screen records payer, source, date, method, reference, and the settlement route. Received HS cash posts through the existing trip payment ledger path; externally settled costs do not create HS cash income. Support credits use coverage awards and item applications, not new cash income. Installments require a self-funded account plan. Mark all paid records the outstanding amount with a source; it never clears balances without funding. Existing unallocated payments and awards can be applied to items first. Operation IDs and database allocation guards protect retries and prevent overpayment. Legacy tools remain available for existing statements, group accounts, allocation details, and payment requests.

The HS Travel reserve view totals received HS payments applied to HS Travel charges less recorded paid HS leader travel expenses across trips. It is a recorded allocation balance, not a reconciled bank balance; unallocated payments and legacy costs without the template association are excluded. Scholarships and external settlements do not increase this cash reserve.

The central inbox combines submitted interest, payment approvals and callback failures, trip messages, budgets, account requests, failed account emails, and extensible ministry events. Source records determine the initial action status; separate inbox states can mark notices completed or deleted without changing their source. Current lists are bounded to 250 recent requests, payments, account requests, and custom events, and 100 sent or failed trip messages, budgets, and failed account emails. Future integrations must emit deduplicated event keys and provide a source action URL.

Documents use authenticated APIs and the existing environment-specific R2 binding under a separate `ministry-documents/` prefix. Metadata and immutable versions are in D1. Uploads are bounded to 10 MB and allow PDF, Office Open XML, PNG, and JPEG signatures. Downloads are authenticated attachments with private no-store caching. Replace creates a new version; delete is recoverable trash, and restore re-enables access. A database failure after object upload removes that new object. No public object URLs are issued.

Public trip responses include only explicitly selected trip fields, ministry names, and published public overview or itinerary content. Budgets, funding, documents, traveler contacts, and devotionals are never returned through that endpoint.

The ledger category catalog adds donation receipts, sponsorships, traveler fees, traveler-covered costs, internship and corporate programs, reimbursements, operating costs, scholarships, salary, and Donation to another organization. Incoming and outgoing donations are distinguished by entry direction. The internship and corporate categories reserve reporting space; specialized workflows still require definition.

Validation includes TypeScript checks, existing regression tests, new SQLite integration tests for the complete migration chain and atomic payment writes, and browser checks against local sample data. On this Windows host use `npm test -- --pool=threads --maxWorkers=1` because forked test workers are unavailable in the sandbox. The local preview helper under `.tmp/` is for sample-data inspection only and must never be deployed or bound to a public interface.

The main administration and trip sidebars provide direct Ministry Management, Inbox, Documents, and Settings links. Settings reuses the existing password and sign-out controls and stores Guided Trip Help in the existing browser preference. It opens after authentication at `/admin/#settings`.

The ledger follows the CareerSteps Income and Expenses work pattern with direct sidebar views, separate add buttons, and compact rows. Full record disclosures retain every previously displayed field. Receipt, edit, delete, import review, export, source filters, and pagination continue to use the same HS handlers and database. No data migration is needed for this interface change.

## Expanded bookkeeping workspace

The finance extension is available at `/admin/finance/`. It adapts CareerSteps navigation and bookkeeping workflows to Hope Sojourns: Dashboard, Expenses, Income, Invoices, Documents, Mileage, Trips, Ministries, Reports, and Settings. The existing ledger and import screen remains at `/admin/#ledger`. Production release was authorized on September 17, 2026.

Migration `0018_finance_workspace.sql` is additive. It creates finance settings, review metadata, mileage rates, saved routes, mileage logs, invoices, invoice lines, and payment links. It does not replace, copy, or renumber ledger entries, people, trips, ministries, or receipt objects. Apply this migration before deploying the corresponding Worker. The existing cookie and CSRF protection secure every `/admin/finance/` endpoint in `src/finance-admin.ts`.

Trips and ministries are optional reporting relationships, not a new client/project catalog. Organization-wide expenses, income, mileage, and invoices require neither relationship. A church, sponsor, organization, or traveler can be the invoice payer independently of the related trip or ministry.

Income and expense writes continue through `ledger-admin.ts`. Review status, accountant follow-up, and reimbursement flags are stored separately from the original ledger. Exclusion affects filtered reporting only. Reimbursement flags do not create cash entries. Cash totals are recorded activity, not reconciled bank balances. Reports expose source, date, direction, trip, ministry, status, missing-receipt, and follow-up filters. CSV and print exports include all matching pages; the existing Excel link exports the full original ledger.

Mileage supports saved routes, 1–90 distinct dates per batch, editable purpose, miles, tolls, optional relationships, review status, trash, and restore. Effective-date rates are explicitly configured, with database guards against overlapping active ranges. There is no assumed IRS rate or automatic tax deduction. Changing a rate recalculates estimates; mileage and toll records never generate ledger expenses. Record actual reimbursement spending separately.

Invoices support draft, issued, and void status, itemized quantities and amounts, due dates, payer address, notes, print output, and partial settlement. Creating an invoice does not post income or create traveler charges. Payments match existing received-income entries, using each entire ledger entry once. Database guards prevent overpayment, duplicate links, payment against an unissued invoice, and edits to funded invoices. Operation identifiers protect retries. Removing a payment link is audited and preserves the income entry. Invoice-linked income cannot be deleted or have its amount/type changed until unlinked.

The new SQLite integration suite verifies authentication, CSRF, organization-wide mileage, effective rates, duplicate batch dates, invalid links, invoice retries, overpayments, ledger preservation, and review filtering. The local demo is sample-only and must stay bound to localhost. Release validation passed 87 tests; migration 0018 and the production Worker were deployed on September 17, 2026.

## User deletion

Administrators can select Delete user in the user list and must type the exact username to confirm. The server rejects self-deletion, unauthorized requests, and stale edits. Migration 0022_mmt_user_deletion.sql adds deleted_at and prevents later changes to deleted accounts. Deletion disables access, clears credentials and section permissions, revokes sessions and setup links, and removes the account from the directory. The account identity remains for historical attribution; migration 0023 preserves its original username and email in deleted_username and deleted_email, and replaces the login identifiers with an inaccessible deleted:id marker. This releases those identifiers for a new account with a new ID, fresh access settings, and a new setup link. Previously deleted users are backfilled without changing their IDs or historical references. The existing last-administrator protection remains active. The re-creation fix is local pending a separately authorized release.

## Revision history

| Date | Version | Change |
|---|---|---|
| 2026-09-18 | 4.5.3 | Added shared inbox completion, reopening, Trash, and restoration with separate audited state. |
| 2026-09-18 | 4.5.2 | Added direct Last Contacted fields and selected-contact follow-up updates in People and Spreadsheet views. |
| 2026-09-18 | 4.5.1 | Added whole-budget funding previews, estimated/actual/allocated comparisons, and reviewed multi-item cost editing. |
| 2026-09-17 | 4.5.0 | Implemented shared HS/CSM identity, scoped administrator authority, one-use portal switching, preserved financial ownership, and coordinated release checks. Local pending release. |
| 2026-09-17 | 4.4.6 | Added donation allocations, donor reporting, edit and undo history, and shared CSM transfer handling. |
| 2026-09-17 | 4.4.5 | Display each user’s last successful sign-in with local date, time, and time zone in the administrator directory. |
| 2026-09-17 | 4.4.4 | Fix account email request construction in Workers by using manual redirect handling; retain rejection of redirects and add a real-runtime regression test. |
| 2026-09-17 | 4.4.3 | Allow deleted usernames and emails to be reused with fresh access; preserve historical identity and backfill previously deleted users. Local pending release. |
| 2026-09-17 | 4.4.2 | Added a separately activated Resend account-email adapter with failure handling and updated forwarding destination; verified domain with encrypted key required for activation. |
| 2026-09-17 | 4.4.1 | Added confirmed user deletion with access revocation and preserved history; local pending release. |
| 2026-09-17 | 4.4 | Added individual MMT accounts, section permissions, profile and recovery workflows, email delivery requirements, and US phone storage and masks; local implementation pending release. |
| 2026-09-17 | 4.3 | Added managed public destinations, photo and visibility controls, and automatic insertion ordering. |
| 2026-09-17 | 4.2 | Added bookkeeping dashboard, optional trip/ministry relationships, mileage, invoices, reports, and review controls. |
| 2026-09-17 | 4.1 | Added local Ministry Management architecture, trip defaults, item funding, central inbox, document storage, and regression requirements. |
| 2026-09-10 | 4.0 | Added test-only public redesign routes, generation sources, hash navigation, persistent main-site access, local image delivery, regression checks, and deployment scope. |
| 2026-09-07 | 3.6 | Added per-traveler and percentage budget calculations, paying-traveler multiplier, explicit budget completion, compact expandable budget records, contextual financial help, and clarified that invitations are for trip interest rather than traveler portal access. |
| 2026-09-07 | 3.5 | Added People and Ministries as same-workbook creation stages, current-trip workbook export, optimistic update metadata, explicit preview actions, immutable payment handling, and secret-free invitation export. |
| 2026-09-06 | 3.4 | Documented the traveler sign-in identity model, bounded request handling, session-handoff retry, and visible recovery behavior. |
| 2026-09-06 | 3.3 | Documented no-flash cross-workspace navigation, collapsible administration rails, password reveal and credential-lock behavior, clickable dependency-aware setup guidance, the bounded XLSX importer, idempotency migration, and canonical workbook build/distribution flow. |
| 2026-09-06 | 3.2 | Namespaced trip-administration cards separately from public destination cards and added a regression contract preventing the public overlay and grid styles from covering administrator forms. |
| 2026-09-06 | 3.1 | Documented intentional session reuse between trip and main admin workspaces, trip form and summary distinctions, edit actions, prerequisites, optional progress-based guided help, universal dialog backdrop protection, and single-registration form wiring. |
| 2026-09-06 | 3.0 | Added the complete actual-trip platform: opportunity linkage, admin workspaces, intake, shared and private portals, content publishing, extensible budgets and funding, central-ledger synchronization, account/payment/support workflows, annual summaries, message-delivery safeguards, and test-only deployment requirements. |
| 2026-09-03 | 2.9 | Documented conditional email-address and phone-number rendering in complete contact records and extended the disclosure contract test. |
| 2026-09-01 | 2.8 | Separated the contact-name full-record action from the plus/minus summary disclosure control. |
| 2026-09-01 | 2.7 | Added the compact contact-card rendering contract, one-at-a-time disclosure state, accessible name control, and separate full-record action. |
| 2026-09-01 | 2.6 | Required an explicit Admin Portal sign-in submission on every page load while preserving secure browser password autofill and the remembered checkbox preference. |
| 2026-09-01 | 2.5 | Added Admin build-manifest checking, asset cache-busting, no-store API reads, explicit portal reload, and mobile foreground data refresh behavior. |
| 2026-09-01 | 2.4 | Documented the Admin Portal mobile workspace selector, generated-table labeling helper, card transformation, stacked controls, and full-screen dialog behavior. |
| 2026-08-31 | 2.3 | Added browser-side phone-camera receipt resizing and JPEG compression with original-file fallback and visible size-reduction feedback. |
| 2026-08-31 | 2.2 | Added private expense-receipt storage, authenticated receipt APIs, R2/D1 isolation, file validation and lifecycle rules, receipt-count export, and backup/deployment guidance. |
| 2026-08-30 | 2.1 | Added local-calendar date handling, editable and removable spreadsheet-review rows with server revalidation, ledger update/delete APIs, and check-number storage, search, import, and export. |
| 2026-08-30 | 2.0 | Documented the purpose-based Payment inbox label while preserving internal CSM integration identifiers and routes. |
| 2026-08-30 | 1.9 | Added the unified ledger schema and APIs, safe spreadsheet preview/import/export, CSM transaction integration, bulk contact activity updates, and authenticated Word giving-statement and template-merge generation. |
| 2026-08-30 | 1.8 | Added the 50-character last-contacted note data field, three-layer validation, import preservation, detail display, CSV export behavior, and alphabetical Contact type search options. |
| 2026-08-30 | 1.7 | Documented automatic privacy-enhanced YouTube embeds and JSON-controlled video placement in resource cards. |
| 2026-08-29 | 1.6 | Documented grouped resource actions, collection filtering, and full-width featured collection cards. |
| 2026-08-24 | 1.5 | Documented the CSM giving dashboard, approve-all queue processing, final donor rematch, and People donor shortcut. |
| 2026-08-23 | 1.4 | Added the production launch architecture, environment guard, isolated Workers and D1 databases, and deployment order. |
| 2026-08-23 | 1.3 | Added inclusive form and portal wording, the internship ZIP workflow, and safer Word list pagination. |
| 2026-08-23 | 1.2 | Added Word editions and their build, visual-review, and synchronization workflow. |
| 2026-08-23 | 1.1 | Added conflict-safe document synchronization and the daily 2:30 a.m. task. |
| 2026-08-23 | 1.0 | Established the guide from the current site, portal, Workers, and validation rules. |
