# Hope Sojourns project instructions

## Color system

- Treat the `:root` color block at the top of `styles.css` as the single source of truth for the entire site, including the private response portal.
- Every new HTML page must load `/styles.css`.
- Do not add literal HEX, RGB, HSL, `white`, or `black` color values outside the shared `:root` block. Use an existing palette or semantic variable.
- If a genuinely new color is required, define it in the shared `:root` block, add its HEX/RGB/role to `COLOR-PALETTE.md`, and explain why an existing token is insufficient.
- Use matching RGB channel variables for transparency, such as `rgba(var(--forest-rgb), .2)`.
- Run `powershell -ExecutionPolicy Bypass -File .\Check-Color-Palette.ps1` after CSS or page changes.

## Living technical documentation

- Treat `docs/tech-admin/Hope-Sojourns-Style-Guide.md` and `docs/tech-admin/Hope-Sojourns-Developer-Guide.md` as living project documentation.
- Update the style guide in the same work session when colors, typography, layout, components, imagery, voice, accessibility, or other visual standards change.
- Update the developer guide in the same work session when routes, architecture, file responsibilities, integrations, data flows, schemas, security, commands, testing, or maintenance procedures change.
- Keep the “Last reviewed” date and revision history current for material changes.
- After updating either Markdown guide, regenerate both Word editions with the bundled Python runtime and `tools/build_tech_admin_guides.py`.
- Render and visually inspect every page of each regenerated Word document before delivery.
- After regeneration and review, run `powershell -ExecutionPolicy Bypass -File .\Sync-TechAdmin-Docs.ps1` to mirror the canonical copies immediately. The broader `Sync-Hope-Sojourns-Website-Documents.ps1` job also includes them in the daily 2:30 a.m. document-library sync.
