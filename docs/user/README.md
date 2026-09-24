# Hope Sojourns MMT user guide

Last reviewed: September 24, 2026

`Hope-Sojourns-MMT-User-Guide.md` is the editable, canonical staff manual. `Hope-Sojourns-MMT-User-Guide.docx` is its generated Word edition. The same builder generates `.tmp/mmt-user-guide.html` for private Cloudflare R2 storage. The guide is distinct from the developer and style guides in `docs/tech-admin/`. Because the GitHub repository is public, the Markdown, Word, and generated HTML files are intentionally ignored by Git; keep the private copies in `ChristianStepsDoco\HopeSojourns\UserGuides` and on the authorized laptop.

Update the Markdown in the same work session as any user-facing MMT workflow, navigation, label, permission, or report change. Maintain the table of contents, alphabetical index, Last reviewed date, and revision history. Then regenerate and visually inspect every Word page:

```powershell
& 'C:\Users\kernb\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' .\tools\build_mmt_user_guide.py
```

The website edition is served at `/api/interest/admin/user-guide` only after MMT session validation, from a private, environment-specific R2 bucket. It is not in the public GitHub repository or Pages artifact and has no online editing controls. The footer link appears only in signed-in workspaces. After verification, run `Sync-MMT-User-Guide.ps1` from the repository root to mirror the local README, Markdown, and Word guide to `ChristianStepsDoco\HopeSojourns\UserGuides`. The daily website-document sync also includes this directory. For an authorized guide release, upload the same generated HTML file to the `mmt-user-guide.html` object key in both private guide buckets, then verify both sites. Never commit or publish the guide content as a static asset. Do not edit generated Word, HTML, or library mirror directly; changes there will be superseded by the canonical source.
