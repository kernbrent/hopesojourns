# Hope Sojourns prayer portal

The independent Hope Sojourns prayer and accountability portal serves `prayer.hopesojourns.com`, with the same application release at `prayer-test.hopesojourns.com`. Each hosted environment uses a separate Worker and SQLite-backed Durable Object namespace. It does not use MMT identities, sessions, contacts, data, or email services. The older local preview retains its isolated D1 adapter for development only.

## First version

- Invitation-only individual password accounts. Every invitation creates a regular member; an existing admin must explicitly grant admin access after enrollment.
- Seven-day, single-use invitations, with revocation and replacement. Invitation tokens and session tokens are stored only as SHA-256 hashes. Admins copy a private link and share it themselves; no email is sent automatically. Possession of the link authorizes enrollment for the invited email address, so deliver it privately to that email owner.
- Prayer requests, updates, and answered prayers. Every post independently selects all members, selected people, or only the author and admins. All admins see every post. The default is admins only. Following never grants visibility.
- People directory with display names and roles only. Follow preferences independently select requests, updates, and answered prayers.
- In-portal notifications for new posts from followed people, filtered by type and visibility. A notification does not contain a stored copy of private text; reads re-check the post's current permissions. Notification count refreshes each minute while the tab is visible. No email or device push notifications yet.
- Author/admin removal with a confirmation dialog and cascading notification deletion. Chronological feed with type/following filters and stable cursor pagination.
- Salted PBKDF2-SHA256 passwords (100,000 iterations supported by Workers WebCrypto), 12–128 characters; seven-day host-only Secure/HttpOnly/SameSite sessions; per-session CSRF token and same-origin checks; durable login attempt limits. Content is inserted as text, with CSP, no indexing, no caching, and no framing.

## Account administration and profiles

Migrations 0004 and 0005 add account status, protected primary ownership, administrative audit events, password-reset tokens, usernames, and optional profiles. The original owner at `kernbrent@gmail.com` receives the sign-in username `admin`; the email and existing password are preserved. If the owner's display name was the email, it becomes Admin. Other existing display names are preserved. Sign-in accepts a username or the associated email, case-insensitively. Account email remains attached; username changes do not change email. Members may choose a 3–40 character username or their own email. The username admin is reserved for the primary owner. New invitation screens offer an optional username and default to the invited email when blank. Email-style usernames are not exposed in the member directory.

My account edits display name, username, optional phone (private), IANA time zone (private), short introduction (visible in the member directory), and master in-portal notification preferences for requests, updates, and answered prayers. Master preferences gate new alerts from all group/follow subscriptions; existing notifications are retained. Prayer and audit timestamps use the saved time zone, or the browser's zone when unset. Phone and email are readable only by the account owner and portal admins. Users cannot self-edit role, primary ownership, status, or associated email. A verified email-change workflow is not implemented.

Admin contains searchable/paginated Accounts, All prayers, All groups, and the latest 100 audit entries. Account actions include unlock sign-in, suspend/reactivate, change username, explicitly grant/revoke admin, create a private one-hour password-reset link, clear an introduction, and delete an account. All admin actions require a reason, server authorization, same-origin and CSRF checks, and an atomic audit marker. Blocked or failed transactions leave no partial effects. Self-removal/self-demotion and primary-owner changes are blocked; another admin can unlock the primary owner but cannot suspend, delete, demote, or reset that owner's password. Last-active-admin checks and fresh actor-status checks protect concurrent actions. Roles are never inferred from a username.

Suspension revokes sessions immediately and blocks sign-in while retaining content for review. Reactivation requires fresh sign-in. Unlock clears the canonical email failure bucket shared by username/email login; it does not bypass network-wide limits or reactivate suspended users. Password-reset links are hashed, expire after one hour, work once, revoke prior links/sessions, and let the recipient choose a password. They are shown only once to the admin and are not emailed automatically. Normal or modified invitations can never grant admin privileges; migration 0004 also downgrades unused legacy admin invitations to regular-member invitations.

Deleting an account requires typed DELETE confirmation. It removes authored prayers and associated notifications, revokes access/reset links/invitations, removes follows and memberships, and transfers owned groups to the acting admin. The old identity is replaced by an anonymized, disabled tombstone so audit references remain valid. Other members' group prayers remain. Deleted usernames and personal profile/contact fields are cleared. The account cannot be restored through the app. Moderators may delete any prayer or a whole group, including unlisted groups; group deletion removes its prayers and memberships. Removing another person's prayer uses the audited moderation route. Audit entries store actor/action/target/reason/time, not copies of deleted prayer text or passwords.

This admin/profile revision is authorized for release to both prayer environments. No production account was modified during development or testing. Migrations apply to each environment at release without changing existing password hashes or associated emails.

## Accountability groups and prayer partners

Members can create accountability groups, prayer groups, partner circles, or another community group. Listed groups expose their name, description, type, and leader to signed-in portal members. Use Discover groups or a leader's directory entry to ask to join. Only the leader or a portal admin can approve or decline requests. Pending requests do not grant access to members or prayers.

Unlisted groups appear only to their approved members, invited people, existing pending requesters, their leader, and portal admins. Leaders can invite an existing portal member; the recipient must accept under My groups & invitations before receiving access. Leaders can revoke invitations or remove approved members. Removed or declined people need a fresh invitation. Members can leave or withdraw a request; leaders cannot leave their own group. Group editing, archiving, and leadership transfer remain future work.

In Share a prayer, choose the community or one of your approved groups, then choose the audience. The default is only the author and portal admins. Group selected-person recipients must be approved group members. Group-shared posts are visible to approved members, including those who join later. Leaders do not automatically see restricted posts. Leaving/removal revokes access to other people's group posts and notifications, even when following their author. Authors retain their own posts; portal admins retain all-post access. Existing community posts are unchanged by migration 0002.

Group members choose request/update/answered notification types under Group members & notifications. Either a group subscription or a follow subscription can generate an alert, subject to the audience. Overlapping subscriptions generate one notification. Disabling one subscription does not disable the other. Preferences apply to new posts. Group invitations and join-request status appear under My groups & invitations separately from prayer-post alerts. No outbound messaging is sent.

The searchable People directory includes yourself, other members' names, portal roles, and links to available groups each person leads. It does not reveal other people's private group memberships or emails.

## Reusable organization configuration

`src/site-config.mjs` supplies Hope Sojourns defaults for the men's accountability community. Public `/api/site` returns display settings only. Deployment variables can override `PORTAL_ORGANIZATION_NAME`, `PORTAL_ORGANIZATION_TAGLINE`, `PORTAL_COMMUNITY_NAME`, `PORTAL_WELCOME_TITLE`, `PORTAL_WELCOME_MESSAGE`, and `PORTAL_ALLOW_MEMBER_GROUPS`. Set the last value to `false` to reserve group creation for portal admins.

Hope Sojourns keeps its original logo, tagline, and shared root stylesheet. A future customer installation can prepare its own logo by setting `PORTAL_BRAND_LOGO_FILE` to a local image path while running prepare, then setting runtime `PORTAL_LOGO_PATH` to `/assets/organization-logo.png`. Logos scale proportionally. All colors still come from that installation's canonical root stylesheet.

This is a reusable single-organization application, not a completed commercial SaaS service. Each church/nonprofit must have its own Worker, Durable Object namespace, secrets, accounts, and hostname; no customer is selected by a client-supplied tenant ID. Never share a namespace across customer deployments. Self-service onboarding, billing, subscriptions, customer lifecycle management, and a shared multi-tenant hosting model have not been built. Groups are not customer data-isolation boundaries.

## Local operation

Use the existing `cloudflare/interest-worker/node_modules/wrangler` installation. From this directory:

```powershell
$env:WRANGLER_LOG_PATH = Join-Path (Get-Location) '.wrangler/logs'
$env:WRANGLER_SEND_METRICS = 'false'
npm run prepare
npm run check
npm test
npm run migrate:local
node scripts/seed-preview.mjs
npm run dev
```

Open `http://localhost:8791`. Secure cookies work on loopback in supported browsers. The optional seed creates only synthetic local records. Preview credentials: `preview-admin@example.invalid` / `local-preview-only-2026`. Other seeded emails are `preview-anna@example.invalid`, `preview-daniel@example.invalid`, `preview-ruth@example.invalid`, `preview-james@example.invalid`, and `preview-michael@example.invalid`, with the same local preview password. James leads the sample Men's Accountability group; Michael starts with a pending request. Never run this seed against any deployed environment; the script hardcodes `--local`.

For a separate local admin, pass JSON containing `email`, `name`, and `password` to `npm run bootstrap:local` on stdin. Avoid putting passwords in shell history or process arguments. The helper removes its temporary local SQL file in a finally block. There is no public bootstrap endpoint.

`npm run prepare` copies public assets and the canonical root `/styles.css` into ignored `dist/` static output. Do not edit those generated copies. All additional CSS uses existing palette variables. Run prepare again after changing source assets.

## Authorized release procedure

The Hope Sojourns account had reached its D1 database quota when preparing the first release. Hosted environments therefore use SQLite-backed Durable Objects, available on the Workers Free plan, without deleting or reusing existing application databases. `src/sqlite-database.mjs` provides the same query interface and synchronous atomic batches. Every cursor is consumed before awaiting. `src/prayer-store.mjs` applies canonical SQL migrations once per environment using `_prayer_migrations`; `npm run prepare` generates and checks `src/schema.mjs` from those migrations. Never remove or rename a deployed namespace or migration tag to reset data. Free-plan limits still apply; this is not an unlimited service.

`wrangler.jsonc` contains explicit `test` and `production` environments bound to their own Workers and namespaces at `prayer-test.hopesojourns.com` and `prayer.hopesojourns.com`. Hosted environments intentionally have no D1 bindings. Wrangler warns that the local-only top-level D1 binding is not inherited; this is intentional and verified by `scripts/validate-environments.mjs`. MMT and public-site roots are not redeployed by a prayer-only release. Never copy preview accounts, prayers, or data between environments.

After explicit release authorization, run prepare, check, tests, the root palette check, and both `deploy:dry:*` commands. Commit only the intended changes, push, then deploy the same prepared assets/source to both environments with `--env test` and `--env production`. Pass the same full commit SHA as `--var RELEASE_VERSION:<sha>` on each deploy. The hosted storage is initialized automatically, so no remote D1 migration command is used. Read `/api/health` on each hostname to verify required schema, environment, and matching release version; confirm protected `/api/posts`, `/api/people`, `/api/groups`, and `/api/notifications` return 401 without a prayer session. Test displays a persistent banner and uses separate accounts.

For an organization with no users, supply the initial admin email as JSON on stdin to `node scripts/initial-admin.mjs test` or `node scripts/initial-admin.mjs production`. The authenticated Wrangler CLI stores `INITIAL_ADMIN_SETUP` as an environment-specific Worker secret containing the email, a token hash, and seven-day expiry. The raw invitation link is returned once on stdout; deliver it privately to the intended administrator and never save it in source, logs, or the public repository. The recipient uses the existing invitation screen to enter their own name/password. Migration 0003 and server-side atomic checks allow this only while the organization has no users. After the first account is created, this mechanism cannot create another admin. Test and production setup links are independent. There is no unauthenticated endpoint for creating setup tokens or choosing the initial admin email.

The Word guide editions and private MMT guide must not be published until their required rendering and page-reference checks can be completed. A missing document renderer does not justify distributing an unreviewed Word edition; retain those files locally and report the remaining documentation work.

Self-service email recovery, verified email changes, invitation email delivery, email/device-push notifications, edits to existing posts, threaded updates/comments, prayer acknowledgments, and attachments remain future work. Admin-issued recovery, account suspension/deletion, explicit role management, and content moderation are covered above. Updates are independent posts with their own audience, not replies inheriting a previous audience.

Security tests run the same thirty-four tests against both the local D1-compatible fixture and the hosted SQLite adapter, including bootstrap expiry/reuse, group access, account administration, profiles, owner migration, atomic rollback, and schema initialization. Wrangler local runtime checks also exercise the hosted Durable Object path. No external communications are sent by the application.

## Resource library

Resources is available after sign-in. Migration 0006 seeds twelve categories and two books: [Wild at Heart by John Eldredge](https://wildatheart.org/books/wild-at-heart/) and [Not Even a Hint by Joshua Harris](https://books.google.com/books?vid=ISBN9781590521472). The migration runs once per installation and does not restore resources an admin later removes.

Members search title, creator, description, category name, and tags; combine category, tag, and featured filters; and sort by recommended order, title, or newest. Lists paginate in batches of 50. Hashtag buttons set the exact tag filter. Hidden resources never enter member results, counts, or tag suggestions.

Admins manage resources from Resources or Admin → Manage resources. Add/edit title, author/artist/speaker, category, description or prayer text, optional HTTPS link, up to 20 tags, visibility, featured placement, and numeric order. Hide and promote open the editor with that change selected; supply a reason and save. Featured resources appear first in recommended order; lower numbers appear first within each featured/nonfeatured section. Manage categories adds, renames, orders, and deletes empty categories. Move resources before deleting their category. Deletions require a reason and typed DELETE. All changes are audited and stale revisions fail rather than overwriting someone else's edit. Updates produce no prayer alerts. Links open on the external provider's site; file uploads and embedded players are not implemented.

API: authenticated GET `/api/resources`, `/api/resource-categories`; admin GET/POST `/api/admin/resources`, `/api/admin/resource-categories`; admin POST `/:id` to edit and `/:id/delete` to delete under each admin collection. Resource search parameters are `q`, `category`, `tag`, `featured` (1/0), `sort` (curated/title/newest), and `offset`. Admin resource queries also accept `visibility` (visible/hidden/all). Mutation bodies use snake_case model fields plus `reason`; edits/deletes require the current `revision`, and deletes require `confirmation: "DELETE"`.
