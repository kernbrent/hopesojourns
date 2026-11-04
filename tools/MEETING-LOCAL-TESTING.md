# Local meeting and relationship testing

Start from the Hope Sojourns repository root:

```powershell
node tools/start-meeting-preview.mjs
```

Open [the local meeting workspace](http://localhost:4192/admin/meetings/). The preview uses synthetic contacts and a separate local SQLite database at `.tmp/meetings/local-v2.sqlite`. It does not connect to live databases, calendars or outgoing email services. Keep the terminal running; Ctrl+C stops it. Restarting preserves your practice records. Install the existing Worker dependencies first if necessary with `npm install` in `cloudflare/interest-worker`.

Try these workflows:

1. Open the sample meeting. Save different meeting notes and action notes, mark it Held, and verify both survive reopening. Select Grid, Calendar, Month and Week; every entry opens the same record.
2. Type `Scot` into a participant picker and choose the existing Scott Sample result. Add the existing Sample Ministry ABC. Ministry members are never automatically added as participants.
3. Add an introduction with Scott and Blake as introducers. Select several targets to save separate introductions, then edit each target's stage. Add another introduction with an unnamed target description.
4. Explicitly create a new named person through the picker and save. Reopen and save again. Verify one contact-details reminder in the meeting, Tasks and Inbox. The Profile link opens the existing contact record. Complete known contact details and resolve its reminder deliberately.
5. Add My action and Waiting on someone else commitments, some with dates and some without. Use the Work filter to distinguish overdue from undated work.
6. Choose Close follow-up or Move to History. Review unresolved work, retain it explicitly, and save. Verify that open work still appears in Tasks and Inbox. Restore from History and reopen follow-up.
7. Select Review calendar file and use `tools/fixtures/meeting-calendar-sample.ics`. Set a calendar identifier such as `local-calendar`, and review November 1–30, 2026. Previewing imports nothing. Track only one occurrence. Match guests and review the location before saving. Reimport with the same identifier; the occurrence must be recognized. Another occurrence remains a separate meeting.
8. Make a copy of the sample file, change its event summary/location or add `STATUS:CANCELLED`, then reimport and choose Review refresh. Verify your local notes and relationships survive. Applying source fields updates the form only until Save.

The preview allowlist intentionally limits unrelated account, finance and outbound messaging operations. Task cards provide Edit task, Mark complete, Reopen task and linked contact access. Inbox records retain their source meeting link. Grid rows begin collapsed; use the down/up arrows to expand and collapse several meetings independently. The private user guide's section 20 provides the full operating instructions.

Automated checks run in `cloudflare/interest-worker` with `npm run check`, `npm test`, and `npm run validate:environments`. Run `powershell -ExecutionPolicy Bypass -File .\Check-Color-Palette.ps1` from the repository root after page or CSS changes. Some Windows sandboxes require a workspace-local TEMP/TMP directory for Vitest and local-socket access for the two Worker-runtime suites.
