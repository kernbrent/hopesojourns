# Biblillion Mission Journey Passport

Original Hope Sojourns common-knowledge discovery game; no Krillion code, art or question sets are reused. This local revision requires explicit approval before commit, push or deployment to test.hopesojourns.com only. Production remains excluded.

Choose one of nine destinations. Correct answers press destination-specific ink stamps onto a passport. Seven stamps earn 150 bonus points. A completed current-bank round also earns a score-based travel reward (0/25/50/100/150), up to 1,000 total points. Skips reveal discoveries without stamps. Points and badges have no cash value or trip credit. Clear spelling mistakes receive full points and show the canonical answer; ambiguous names require confirmation.

The bank has 99 active prompts and 286 archived prompts (385 total), with reviewed canonical answers and aliases. Every round has three Bible/faith, two geography/travel and two care prompts. Seven daily questions form a 14-day deck using America/Chicago dates. Most active prompts accept 10+ distinct answers; every care prompt accepts at least 20. The everyday-needs example accepts 31 ideas, including clothes, shelter, warmth, cooling, shoes and coats. Food earns 35, love 85 and someone to talk to 100. These are editorial game scores, not measured rarity or rankings of human needs. Practice and daily progress remain separate. Legacy questions and scores restore unchanged. Bank 2026-11-25.4 retains .3 daily schedules for saved rounds. Browser localStorage and a scoped 180-day cookie allow account-free resume.

## Content and scoring

Bible answers have Scripture support; geography and care answers have clearly labeled background sources and original notes. friendly-bank.js and mission-bank.js define regular prompts; country-areas.js snapshots UN M49 country/area data. The free starting clue supplies one familiar answer. Community and belonging accept job, church and family for 35 while existing specific discoveries retain their higher points. Care-only possessives and everyday phrases count as equivalent wording; negative phrases are not typo-corrected into positive answers. Adding words alone does not earn more points. Unknown wording may still be valid. Staff can select regular/all/archived questions; non-Scripture devotional starters require a Bible passage chosen by the editor. See docs/content/biblillion-question-review.md for verification. The 35/50/65/85/100 point bands are editorial familiarity estimates within a prompt, not measured popularity or spiritual importance. Every prompt has a featured 100-point discovery. Add precise scope, accepted answers, references and collision-free aliases before changing a bank; bump BANK_VERSION when answers or scores change.

## Optional insights

Anonymous sharing is optional and initially off. Only canonical answers/skips, correction flags and round/destination metadata are sent; no raw guesses, names, email or persistent player ID. Opt-out clears queued events. Test-only Worker routes validate consent, daily selection and canonical points. Migration 0074 provides idempotent events, aggregates, round summaries, hashed hourly rate counters and private devotional drafts. Detailed answers expire after 180 days; anonymous summaries/aggregates remain.

In test MMT, People & ministry > Biblillion insights requires Contacts read. Contacts edit permits private drafts. Staff can filter trends, inspect the bank, review recent anonymous rounds and download editable devotional starters. Saving never publishes or emails. Review Scripture and interpretation before use. Choice percentages reflect opted-in answers only and never automatically alter editorial scores.

## Local checks

Use bundled Node. Set BIBLILLION_PREVIEW_PORT=4196 and run tools/start-referral-preview.cjs for the isolated fixture server. Open http://localhost:4196/biblillion/ and http://localhost:4196/admin/biblillion/. External providers are blocked; never upload the fixture database.

- node --test tools/biblillion.test.mjs
- node tools/check-biblillion-common.cjs: practical/relational answer scores, step labels, mandatory timer controls and regular/archive library.
- Worker: npm test -- --run, type/environment checks and test dry deployment.
- node tools/check-biblillion-passport.cjs: game, resume, spelling, stamps, celebration, consent, MMT drafts and mobile layouts.
- powershell -ExecutionPolicy Bypass -File .\Check-Color-Palette.ps1

## Test-only build and release

node cloudflare/build-test-site.mjs --biblillion-test creates site-dist-biblillion-test. Runtime game files become /biblillion/, with TEST PREVIEW, no-store/noindex headers and an output-only Resources link. Test MMT gains the private dashboard. Normal builds exclude game and dashboard. Canonical production navigation is unchanged. Colors use shared /styles.css tokens.

node tools/serve-biblillion.cjs --test-build previews the artifact at http://localhost:4195/biblillion/. node tools/check-biblillion-test-release.cjs verifies Resources navigation and exact runtime asset hashes; set BIBLILLION_TEST_ORIGIN to the canonical test URL after release.

Deploy only to hopesojourns-test Pages, branch codex/test-admin-portal. Apply migration 0074 only to test D1 and deploy only the test interest Worker. Upload private guide HTML only to test guide R2. Production Biblillion API routes return 404. Production deployment needs separate authorization.

## Stamps, pace and balanced questions

question-settings.js retains legacy difficulty metadata. Current rounds use only the 99 active easy-entry prompts. The three earlier banks retain their schedules, answers and scores. The previous balanced bank also retains its travel reward; original 14/210-question banks retain their 850-point maximum.

timer.js enforces 25 seconds of active play per question, pauses for hidden tabs/open help/privacy dialogs, saves remaining milliseconds and treats expiry as a zero-point missed discovery. There is no untimed option or timer-off control. Restored old untimed rounds become timed. Everyone reaches the chosen destination after seven questions, even with misses; the answer score determines the travel tier, including a layover for low scores. Migration 0075 already provides timeout counters; this revision requires no new schema. Analytics preserve legacy event signatures.

passport.css and passport.js draw distressed inline SVG customs-style stamps and a brief press animation. rewards.js defines the five travel tiers and shared server bonus calculation. Celebrations occur once at round end; high tiers use finite confetti. Reduced motion keeps static emblems/stamps. Run node tools/check-biblillion-fun.cjs for the timer, stamp and tier acceptance checks.

The passport now has an American-style navy/gold cover, original eagle/shield engraving and a cream visa page. Seven faint number watermarks replace outlined placeholders; each fades out as its stamp lands. Shared passport-navy lives in styles.css with its palette documentation. Listen, Learn, Pray, Notice, Care, Serve and Arrive remain visible alongside the passport, with the current step highlighted. Each earned stamp includes its corresponding step label beneath the date. Visa-page stage/result descriptions also remain available to screen readers.
