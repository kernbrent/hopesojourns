# Hope Sojourns technical administration documents

Last reviewed: August 23, 2026

This folder contains the living design and technical standards for the Hope Sojourns website.

## Documents

- [Hope Sojourns Style Guide](Hope-Sojourns-Style-Guide.md) — canonical editable source for brand expression, colors, typography, layout, components, imagery, voice, and accessibility.
- `Hope-Sojourns-Style-Guide.docx` — polished Microsoft Word edition generated from the style-guide source.
- [Hope Sojourns Developer Guide](Hope-Sojourns-Developer-Guide.md) — canonical editable source for architecture, directory structure, data flows, local development, testing, security, and maintenance workflows.
- `Hope-Sojourns-Developer-Guide.docx` — polished Microsoft Word edition generated from the developer-guide source.

The focused color-token implementation reference remains `/COLOR-PALETTE.md` at the repository root. The complete approved palette is also included in the style guide so the external TechAdmin copy is self-contained.

## Source of truth and synchronization

The Markdown files in this repository are the canonical editable copies. Generate the Word editions with:

```powershell
& 'C:\Users\kernb\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' .\tools\build_tech_admin_guides.py
```

Then `Sync-TechAdmin-Docs.ps1` provides an immediate, TechAdmin-only mirror to:

`C:\Users\kernb\OneDrive\MasterFolder\Documents\ChristianStepsDoco\HopeSojourns\TechAdmin`

The broader `Sync-Hope-Sojourns-Website-Documents.ps1` job runs every day at 2:30 a.m. and also includes these canonical files while synchronizing all published website documents to their approved Hope Sojourns library folders. Update the canonical files first, regenerate the Word editions, visually verify them, then run the immediate sync when the external copy should not wait for the scheduled job.

## Maintenance rule

Any change that affects visual standards, site architecture, routes, integrations, security, data handling, development commands, or maintenance procedures must update the appropriate guide in the same work session. Regenerate and synchronize the Word editions after every guide change.
