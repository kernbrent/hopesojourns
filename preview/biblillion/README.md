# Biblillion Mission Journey Passport

Original Hope Sojourns Bible game; no Krillion code, art or question sets are reused. Current authorization permits commit, push and deployment to **test.hopesojourns.com only**.

Choose one of nine destinations. Seven correct answers earn seven stamps, a destination-photo celebration and a 150-point bonus (850 maximum). Skips reveal discoveries without stamps. Points and badges have no cash value or trip credit. Clear spelling mistakes receive full points and show the canonical answer; ambiguous names require confirmation.

The bank has 210 questions and 991 canonical answers plus reviewed aliases. Seven daily questions form a 30-day cycle using America/Chicago dates. Practice and daily progress remain separate. Legacy rounds restore unchanged. Browser localStorage and a scoped 180-day cookie allow account-free resume.

## Content and scoring

Every answer has Scripture support and an original explanatory note. See docs/content/biblillion-question-review.md for verification. The 35/50/65/85/100 point bands are editorial familiarity estimates within a prompt, not measured popularity or spiritual importance. Every prompt has a featured 100-point discovery. Add precise scope, accepted answers, references and collision-free aliases before changing a bank; bump BANK_VERSION when answers or scores change.

## Optional insights

Anonymous sharing is optional and initially off. Only canonical answers/skips, correction flags and round/destination metadata are sent; no raw guesses, names, email or persistent player ID. Opt-out clears queued events. Test-only Worker routes validate consent, daily selection and canonical points. Migration 0074 provides idempotent events, aggregates, round summaries, hashed hourly rate counters and private devotional drafts. Detailed answers expire after 180 days; anonymous summaries/aggregates remain.

In test MMT, People & ministry > Biblillion insights requires Contacts read. Contacts edit permits private drafts. Staff can filter trends, inspect the bank, review recent anonymous rounds and download editable devotional starters. Saving never publishes or emails. Review Scripture and interpretation before use. Choice percentages reflect opted-in answers only and never automatically alter editorial scores.

## Local checks

Use bundled Node. Set BIBLILLION_PREVIEW_PORT=4196 and run tools/start-referral-preview.cjs for the isolated fixture server. Open http://localhost:4196/biblillion/ and http://localhost:4196/admin/biblillion/. External providers are blocked; never upload the fixture database.

- node --test tools/biblillion.test.mjs
- Worker: npm test -- --run, type/environment checks and test dry deployment.
- node tools/check-biblillion-passport.cjs: game, resume, spelling, stamps, celebration, consent, MMT drafts and mobile layouts.
- powershell -ExecutionPolicy Bypass -File .\Check-Color-Palette.ps1

## Test-only build and release

node cloudflare/build-test-site.mjs --biblillion-test creates site-dist-biblillion-test. Nine runtime files become /biblillion/, with TEST PREVIEW, no-store/noindex headers and an output-only Resources link. Test MMT gains the private dashboard. Normal builds exclude game and dashboard. Canonical production navigation is unchanged. Colors use shared /styles.css tokens.

node tools/serve-biblillion.cjs --test-build previews the artifact at http://localhost:4195/biblillion/. node tools/check-biblillion-test-release.cjs verifies Resources navigation and exact runtime asset hashes; set BIBLILLION_TEST_ORIGIN to the canonical test URL after release.

Deploy only to hopesojourns-test Pages, branch codex/test-admin-portal. Apply migration 0074 only to test D1 and deploy only the test interest Worker. Upload private guide HTML only to test guide R2. Production Biblillion API routes return 404. Production deployment needs separate authorization.
