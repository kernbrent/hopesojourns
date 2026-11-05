# Local meeting and relationship testing

Start from the Hope Sojourns repository root:

```powershell
node tools/start-meeting-preview.mjs
```

Open [the local meeting workspace](http://localhost:4192/admin/meetings/). The preview uses synthetic contacts and a separate local SQLite database at `.tmp/meetings/local-v2.sqlite`. It does not connect to live databases, calendars or outgoing email services. Keep the terminal running; Ctrl+C stops it. Restarting preserves your practice records. Install the existing Worker dependencies first if necessary with `npm install` in `cloudflare/interest-worker`.

Try these workflows:

1. Add a meeting with title, When, People and Meeting notes. Select an existing contact; explicitly add a synthetic new person. The contact-details reminder checkbox starts unchecked.
2. Add task: Introduce George to Scott. Enter Who and an optional due date. Save and check the same task in Tasks & follow-up and Inbox.
3. Mark Done and Save. Reopen through Tasks or uncheck Done in the meeting and Save. Task details provides notes, related contact and cancellation.
4. Choose Finish meeting. Verify the meeting is marked Held and appears under Past meetings while unfinished tasks remain open. Restore meeting under More details and Save.
5. Existing introductions convert once into regular tasks when migration 0065 runs. Earlier notes, stage, introducers and dates remain under More details > Earlier introduction history. Existing ordinary tasks remain separate.
6. Use Grid arrow controls to expand multiple rows, then Calendar Month/Week. Scope defaults to Upcoming & recent (unfinished plus finished meetings from the last 90 days); Past meetings and All meetings are available. Calendar import is hidden.
7. Review More details for optional type, end, location, outcome and all-day dates. Changing When retains the original duration. New meetings default to one hour.

No hosted environment is changed by this preview. It limits unrelated account, finance and outbound messaging operations. The private user guide’s section 20 describes the simplified workflow.

Automated checks run in `cloudflare/interest-worker` with `npm run check`, `npm test`, and `npm run validate:environments`. Run `powershell -ExecutionPolicy Bypass -File .\Check-Color-Palette.ps1` from the repository root after page or CSS changes. Some Windows sandboxes require a workspace-local TEMP/TMP directory for Vitest and local-socket access for the two Worker-runtime suites.

Finish meeting contact-date check: add a named attendee and a task with a related contact. Save the planned meeting and confirm Last Contacted has not changed. Choose Finish meeting, open both contact profiles, and confirm the America/Chicago meeting date and Meeting: [title] note. A newer contact date must remain untouched; editing unrelated meeting notes must preserve manually edited contact notes.
