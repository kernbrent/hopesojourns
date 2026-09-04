# Hope Sojourns website style guide

Version 2.6

Last reviewed: September 3, 2026

## 1. Purpose

This guide defines how Hope Sojourns should look, sound, and behave across the public website and private response portal. It is a living standard: when the website intentionally changes, this guide should change with it.

The goal is a site that feels warm, grounded, hopeful, relational, and trustworthy. The design should support the ministry story without becoming more prominent than the people, partnerships, and opportunities being described.

## 2. Canonical design sources

| Source | Responsibility |
|---|---|
| `/styles.css` | Global visual system and the canonical `:root` design tokens |
| `/admin/admin.css` | Portal-specific layouts that inherit global tokens |
| `/script.js` | Shared header, navigation, footer, motion, and photo-viewer behavior |
| `/COLOR-PALETTE.md` | Focused color specification, contrast notes, and token rules |
| `/Check-Color-Palette.ps1` | Automated guardrail against one-off colors or pages missing the shared stylesheet |

Every page must load `/styles.css`. A future color change should be made in the `:root` token block, never by hunting through individual components.

## 3. Brand foundation

### Core idea

Hope Sojourns invites people to travel with humility, serve alongside trusted local ministries, and carry a deeper practice of faith and service home.

### Design principles

1. **Invitation over promotion.** Create room for discernment instead of using urgency or pressure.
2. **Partnership over tourism.** Show that local leaders and communities already possess wisdom, agency, and ongoing ministries.
3. **Dignity over spectacle.** Never use suffering, poverty, or vulnerability as decoration.
4. **Warmth with clarity.** The experience may feel handcrafted and human, but navigation, forms, and calls to action must remain obvious.
5. **Movement with restraint.** Motion should reinforce a journey or reveal hierarchy; it should not compete with content.
6. **Consistency over novelty.** Reuse established tokens, components, spacing, and content patterns before inventing a new treatment.

## 4. Logo system

| Asset | Approved use |
|---|---|
| `/assets/hope-sojourns-logo.png` | Primary horizontal website and document logo |
| `/assets/hope-sojourns-icon.png` | Favicon, compact identity, circular or square brand placement |
| `/assets/hope-sojourns-oval-icon.png` | Alternate emblem where the oval silhouette is specifically useful |
| `/assets/csm-logo.jpg` | Christian Steps Ministries partnership identification |
| `/assets/csm-green-feet.png` | Supporting Christian Steps mark, not a replacement for the Hope Sojourns logo |

### Logo rules

- Prefer the primary horizontal logo in the site header and formal materials.
- Preserve the original aspect ratio. Do not stretch, skew, rotate, recolor, outline, or add effects to the logo artwork.
- Give the mark open space. As a minimum, keep surrounding content approximately one icon-width away when space permits.
- Use the icon only when the full wordmark would be too small to read or when the context already identifies Hope Sojourns.
- Place logos on quiet, high-contrast surfaces. Avoid busy image areas unless a controlled overlay or solid field protects legibility.
- Partnership marks should be visually subordinate to the Hope Sojourns identity unless the content is specifically about the partner organization.
- Do not create new logo variants without an intentional brand decision and an update to this guide.

## 5. Color system

The canonical values are defined in the `:root` block at the top of `/styles.css`. The values below are repeated here so this guide remains useful outside the code repository.

### Core palette

| Token | Name | HEX | RGB | Use |
|---|---|---:|---:|---|
| `--ink` | Ink | `#19322B` | `rgb(25, 50, 43)` | Primary text |
| `--muted` | Muted green-gray | `#60726B` | `rgb(96, 114, 107)` | Secondary text |
| `--paper` | Warm paper | `#FFFDF8` | `rgb(255, 253, 248)` | Main content surface |
| `--white` | White | `#FFFFFF` | `rgb(255, 255, 255)` | Cards, controls, and text on dark surfaces |
| `--cream` | Cream | `#F6F1E7` | `rgb(246, 241, 231)` | Page and section backgrounds |
| `--forest` | Forest | `#275D4D` | `rgb(39, 93, 77)` | Links, secondary actions, brand accents |
| `--forest-dark` | Dark forest | `#173F35` | `rgb(23, 63, 53)` | Headings, dark sections, action text |
| `--forest-deep` | Deep forest | `#0B2720` | `rgb(11, 39, 32)` | Footer, photo overlays, deepest shadows |
| `--gold` | Journey gold | `#D99B42` | `rgb(217, 155, 66)` | Primary actions and light-surface accents |
| `--gold-light` | Sunlit gold | `#F3C780` | `rgb(243, 199, 128)` | Gold details on dark or photographic surfaces |
| `--coral` | Hope coral | `#C9674E` | `rgb(201, 103, 78)` | Brand accent on light surfaces |
| `--coral-dark` | Dark coral | `#A34C38` | `rgb(163, 76, 56)` | Large coral surfaces carrying white text |

### Supporting tints

| Token | Name | HEX | RGB | Use |
|---|---|---:|---:|---|
| `--forest-wash` | Forest wash | `#EDF5F1` | `rgb(237, 245, 241)` | Selected states and pale green sections |
| `--forest-soft` | Soft forest | `#D8EBE4` | `rgb(216, 235, 228)` | Illustrated accents and confirmed states |
| `--sage` | Sage | `#73A997` | `rgb(115, 169, 151)` | Third “Our Approach” story accent |
| `--gold-wash` | Gold wash | `#FFF8E9` | `rgb(255, 248, 233)` | Notices and highlighted panels |
| `--gold-soft` | Soft gold | `#F4E5C8` | `rgb(244, 229, 200)` | Labels and illustrated accents |
| `--gold-ink` | Gold ink | `#6B4B1E` | `rgb(107, 75, 30)` | Text on gold-tinted surfaces |
| `--coral-wash` | Coral wash | `#FFF0EA` | `rgb(255, 240, 234)` | Error and coral-tinted surfaces |
| `--coral-soft` | Soft coral | `#F4D1C3` | `rgb(244, 209, 195)` | Illustrated accents |

### Functional colors

Functional colors communicate status and must not be used decoratively.

| Token | Meaning | HEX | RGB |
|---|---|---:|---:|
| `--success` | Success | `#1F6849` | `rgb(31, 104, 73)` |
| `--success-wash` | Success surface | `#E2F1E8` | `rgb(226, 241, 232)` |
| `--info` | Information | `#285B8F` | `rgb(40, 91, 143)` |
| `--info-wash` | Information surface | `#E5EEF9` | `rgb(229, 238, 249)` |
| `--warning` | Warning | `#7B4F09` | `rgb(123, 79, 9)` |
| `--error` | Error or destructive action | `#8F3030` | `rgb(143, 48, 48)` |

Warnings use `--gold-wash` as their surface. Errors use `--coral-wash`.

### Why similar colors remain

- Warm paper and white are intentionally separate: paper provides the site canvas while white separates cards and controls.
- Journey gold works on light surfaces; sunlit gold remains readable on dark green and photographs.
- Hope coral is a light-surface accent; dark coral supports accessible white text on filled sections.
- Washes are broad, quiet surfaces. Soft colors are smaller illustrated accents.
- Status colors remain distinct because they reinforce a written status label.
- Alpha differences are allowed for hierarchy, borders, shadows, and overlays, but the underlying RGB channels must come from palette tokens.

### Required contrast pairings

| Foreground on background | Contrast |
|---|---:|
| Ink on warm paper | 13.48:1 |
| Muted on warm paper | 5.02:1 |
| Forest on warm paper | 7.49:1 |
| Dark forest on journey gold | 4.85:1 |
| Sunlit gold on dark forest | 7.39:1 |
| White on dark coral | 5.76:1 |

Do not place normal-size white text on `--coral`; use `--coral-dark`.

### Implementation rule

Do not add literal HEX, RGB, HSL, `white`, or `black` values to page or component CSS. Use a shared variable. For transparency, use an RGB channel token such as:

```css
border-color: rgba(var(--forest-rgb), .2);
```

## 6. Typography

### Font families

- **Display and editorial headings:** `Georgia, "Times New Roman", serif`
- **Interface and body copy:** `"Segoe UI", Aptos, system-ui, -apple-system, sans-serif`

These are intentionally system-first stacks. Do not introduce a webfont without evaluating privacy, loading performance, licensing, and fallback behavior.

### Type roles

- Page and section headings use the serif stack to create an editorial, journey-oriented tone.
- Body copy, navigation, forms, metadata, labels, and buttons use the sans-serif stack for clarity.
- Eyebrows and compact labels use uppercase text, generous letter spacing, and strong weight.
- Body copy begins at `16px` with a `1.7` line height.
- Heading sizes use responsive `clamp()` values rather than fixed desktop-only sizes.
- Use no more than three obvious levels of emphasis inside a section: eyebrow, heading, and body/supporting text.

### Writing and capitalization

- Use sentence case for headings, navigation, buttons, form labels, and statuses.
- Short invitations may use title-style emphasis when it is part of a campaign line, not as a default UI convention.
- Avoid all caps except for short eyebrows, labels, and badges.
- Use numerals for dates, costs, counts, and steps when they improve scanning.

## 7. Layout and spacing

### Site shell

- Maximum outer shell: approximately `1240px`.
- Primary content width: approximately `1180px`.
- Standard narrow-screen gutter: `16px` on each side, expressed as `calc(100% - 32px)`.
- Major public sections are separated by approximately `12px` within the framed site shell.
- Major surfaces use rounded corners around `22px` to `24px`; small controls use proportional smaller radii or a full pill shape.

### Spacing rhythm

Favor the existing rhythm rather than isolated values:

- Tight: `4px`, `6px`, `8px`
- Component: `10px`, `12px`, `14px`, `18px`, `20px`, `24px`
- Section: `28px`, `30px`, `38px`, `40px`, `48px`, `54px`
- Large composition: `68px`, `72px`, `96px`

Use `clamp()` for large responsive spacing. Keep related items closer together than unrelated groups.

### Responsive standards

The stylesheet currently uses breakpoints around `980px`, `850px`, `760px`, `700px`, `680px`, `560px`, `480px`, and `430px`. New work should reuse the nearest existing breakpoint rather than add a nearly identical one.

- Multi-column content should stack before text or controls become cramped.
- Mobile controls should normally fill available width when side-by-side controls no longer fit.
- Tap targets should be at least `44px` high; primary actions are generally `48px` or taller.
- Avoid horizontal scrolling on standard pages.

## 8. Core components

### Header and navigation

- The shared header is injected by `/script.js`.
- It is sticky, uses the primary wordmark, and carries the same navigation across public pages.
- Desktop navigation remains quiet; the gold action receives the strongest emphasis.
- On narrow screens, use the existing menu toggle and preserve its ARIA-expanded state.

### Heroes

- Use authentic photography with a dark green overlay strong enough to protect white text.
- Keep one primary page heading, a concise supporting sentence, and no more than two immediate actions.
- Use sunlit gold for small accents on dark imagery.
- Apply deliberate `object-position` rules when the focal point needs protection at different widths.

### Eyebrows

- Eyebrows identify context, not content hierarchy.
- Keep them brief, uppercase, letter-spaced, and paired with the short line motif.
- Gold is the default on dark surfaces; forest or coral may be used on light surfaces when the component pattern already establishes it.

### Buttons and links

- `.button` is the primary pill action: journey gold with dark forest text.
- `.button.secondary` is a restrained outline or translucent action.
- `.button.light` is used on sufficiently dark fields.
- `.button.compact` is reserved for smaller supporting actions.
- Use one visually dominant action per local decision area.
- Link text must describe its destination or action; avoid “click here.”
- Keep visible keyboard focus and do not remove outlines without an equally clear replacement.
- When a document set is offered, provide one clearly labeled bundle download as well as descriptive links for each individual file.

### Sections, cards, and callouts

- Use warm paper for main content, white for elevated cards, and cream or washes for grouped information.
- Borders use `--line`; shadows use the shared green-tinted shadow language.
- Avoid nesting multiple card surfaces unless the hierarchy genuinely requires it.
- Gold-left-border callouts are appropriate for scripture, commitments, facts, and important contextual notes.
- Dark green bands are reserved for high-emphasis invitations, next steps, and narrative transitions.

### Resource collection cards

- When an article, song, video, sermon, or other media item shares one title and one central theme, prefer a single collection card over several sibling tiles.
- Give each item inside the collection a clear type label, a short description, and a descriptive action. Audio items may use labeled native controls inside the card.
- Use a full-width featured layout when the bundled actions would make paired cards uneven or cramped.
- Search and type filters should recognize the items inside the collection while returning the collection card only once.
- On narrow screens, keep the collection as one stacked card with controls and links contained within its width.
### Forms

- Every input requires a visible label.
- Group related choices with `fieldset` and `legend`.
- Explain optional fields without weakening required-field clarity.
- Use inclusive labels and examples that welcome adults in different seasons of life. Do not assume school enrollment, employment, marital status, or another life circumstance unless the workflow truly requires it.
- Use visible working, notice, success, and error messages; do not rely on color alone.
- Preserve entered data when validation fails.
- Error text uses `--error`; error surfaces use `--coral-wash`.
- Keep personal information out of static files and URLs.

### Statuses and badges

- Always pair status color with readable status text.
- Scheduled uses sunlit gold, confirmed uses soft forest, and planning uses a restrained translucent treatment on dark surfaces.
- Admin success, information, warning, and error states use the functional palette only.
- Admin environment copy must be derived from the current hostname. Production must say “Production portal” or use neutral private-portal language and must never display a test-environment label; static HTML uses neutral wording to prevent an incorrect label before JavaScript runs.

### Admin giving workspace

- Lead with a compact current-year summary: gross received is the largest figure, with net after fees directly beneath it; donations, givers, and sent payments use smaller companion cards.
- Keep sent payments visually separate from received giving so they cannot be mistaken for a deduction from the gross donation total.
- Queue toolbars may combine the review filter, approve-all action, and a shortcut to the related People view. Actions must wrap before their labels or controls become cramped.
- Transaction cards use compact supporting type, a two-column review form, and full-width donor matching. Names, item titles, and email addresses must wrap inside their fields rather than overflow.
- At medium widths, the giving summary and transaction metadata reduce to two columns. At narrow widths, the toolbar, summary, metadata, and review fields stack into one column.
- Bulk actions require clear confirmation, visible progress, a completion summary, and per-item failure reporting. Do not replace the existing individual approval and denial controls.

### Admin contact directory

- Present the master contact list as a compact directory by default. Each closed row contains only Name, Contact type, Organization, and Phone number so substantially more contacts remain visible at once.
- Use a four-column heading above compact rows on wider screens. On phones, hide the shared heading and repeat those labels inside each card so the values remain understandable when the layout wraps.
- Keep the contact name underlined and use it as a direct action that opens the complete contact record. Place a separate plus/minus control beside it for expanding and collapsing the compact summary; update that control's expanded state and accessible label.
- Keep no more than one summary expanded at a time. Expanding a different contact closes the previously expanded summary so the directory does not gradually return to a long-card layout.
- The expanded summary restores the established organization and activity date, email and phone, contact-type and language pills, request and reply counts, and a distinct **View everything** button. Keep that button hidden in the compact state.
- In the complete contact record, show **Email address** and **Phone number** directly below **Preferred contact** when their values exist. Omit either row when its value is empty instead of displaying a **Not provided** placeholder.
- On narrow screens, let compact values wrap instead of clipping. Stack expanded summary sections and make **View everything** full width.
### Admin mobile workspace

- At `760px` and below, replace the desktop tab strip with one sticky **Choose a workspace** selector. Keep its selected value synchronized with the active Contacts, Requests, Payment inbox, Ledger, Spreadsheet, Teams, Ministries, or Internship toolkit view.
- Reduce dashboard spacing while retaining the summary hierarchy. Header actions, account controls, filters, form fields, toolbars, and action groups stack to the available width instead of requiring sideways scrolling.
- Convert generated data tables into labeled record cards on phones. Each value must retain the text of its desktop column header through a visible mobile label; selection checkboxes and action controls remain reachable in normal reading order.
- Use full-screen, `100dvh` dialogs on phones, with a sticky heading and a close control at least `44px` square. Dialog content scrolls independently and all editing actions stack to full width.
- Use at least `46px` for primary mobile controls and `16px` for text inputs, selects, and textareas so controls remain easy to touch and mobile browsers do not zoom unexpectedly.
- Preserve the established desktop tabs, tables, and multi-column layouts above the mobile breakpoint.
- Present **Update portal** as the strongest dashboard refresh control, with the circular-arrow cue and dark-forest treatment. It reloads the page and versioned assets; the separate **Refresh data** control remains visually quieter.
- Keep both controls full-width and plainly labeled on phones. Refreshing data means re-reading the current production records without resetting, replacing, or migrating the database.

### Admin ledger and contact-batch workspace

- Present the ledger as a dedicated top-level portal tab, not as a secondary control inside the Payment inbox. The Payment inbox is for reviewing incoming Christian Steps/PayPal transactions; the ledger is the complete financial record.
- Lead with income, expense, balance, and entry-count summary cards. Balance receives the dark-forest emphasis; a negative balance may use the established error color, but it must retain the visible label and signed amount.
- Place import, export, and manual-entry actions together in the ledger introduction panel. Use one gold primary action and restrained outline treatments for supporting actions.
- Keep search, year, type, and source filters visibly labeled. At wide sizes they may share one row; below the existing medium and narrow breakpoints they reduce to two columns and then one.
- Financial tables must use explicit text labels for Income and Expense in addition to color. Keep dates, values, names, categories, source, and notes scannable; on narrow screens, contain horizontal scrolling inside the table shell rather than forcing the entire page to overflow.
- Include Check # and Receipts as distinct ledger columns. Receipt controls appear only for expenses and combine a camera symbol with either Add or the stored-file count. Keep Edit and Delete in a final Actions column, use established outline and danger buttons, and require typed confirmation before permanent deletion.
- Spreadsheet imports require a preview with separate counts for new entries, exact duplicates, sequence conflicts, and rows needing correction. Every source field must remain editable in the review table, including sequence number and check number. Provide a select-all control, per-row checkboxes, and an explicit **Remove selected entries** action that removes rows only from the current import review.
- The final spreadsheet action must say that reviewed rows will be validated and imported. Keep horizontal overflow inside the review table shell, retain visible field labels through the sticky header and accessible control names, and report which rows were imported or skipped.
- Contact selection belongs in the first grid column and must include an accessible per-row name plus a select-visible control. The selected count remains visible above the actions and survives paging or filtering until the action succeeds or the administrator changes the selection.
- Group bulk activity and personalized-document tools by outcome. Use a date and brief-note pair for activity; use a tax year, branded statement action, uploaded Word template, and merge action for documents.
- At narrow widths, bulk fields and actions stack in a logical reading order and primary buttons fill the available width. Keep the data grid in a contained horizontal-scrolling shell.
- Long-running import and document actions need visible working text, success or error status, and disabled repeat actions while processing.
- The expense-receipt dialog begins with a concise date, amount, and payee summary, then presents one gold camera-first action and one outline file-picker action. State plainly that files are private and show the 10 MB limit near the controls.
- Stored receipts use contained cards with a preview when the browser supports the image format, a clear PDF or image fallback when it does not, filename, file size, added time, View, and Delete. Never rely on a thumbnail as the only file label.
- At narrow widths, receipt actions stack to full width and receipt cards reduce to a compact image-and-copy row with actions below it. Long filenames must wrap without widening the dialog.
- Receipt upload, loading, success, and error states remain visible through the shared live-status pattern; disable repeat upload actions while files are being transferred.
- When **Take photo** invokes the phone camera, explain that the capture will be optimized before upload. Use the shared live-status area for the optimizing state and report the original and stored sizes after a successful reduction. The separate existing-file picker should not imply that chosen photos or PDFs will be changed.
- Downloaded spreadsheets and Word files are operational artifacts. Preserve branded document styles, clear filenames, readable totals, and an accompanying manifest when a batch can contain exceptions.

### Admin ministry details

- Order ministry detail content by review workflow: profile and connected trips first, then **Ministry contacts**, then **Add a ministry contact**, with permanent deletion last.
- Existing linked contacts take precedence over the add form so administrators can understand current relationships before creating another one.

### Dialogs and lightboxes


- Use semantic `<dialog>` where practical and provide an obvious close action.
- Trap attention through the native dialog behavior rather than visual obstruction alone.
- Photo viewing retains captions, position information, previous/next controls, and keyboard support.

## 9. Photography and media

### Image direction

- Prefer candid, authentic images that show people participating, listening, working, worshiping, traveling, and building relationships.
- Favor context and shared activity over posed “hero” imagery.
- Represent communities with dignity and agency. Avoid images that turn poverty, displacement, disability, or children into emotional leverage.
- Do not imply that visitors are the center of a local ministry’s story.
- Obtain appropriate permission for identifiable people, especially minors or people in vulnerable circumstances.

### Technical image standards

- Store core site imagery under `/assets` with lowercase, hyphenated, descriptive filenames.
- Provide meaningful alt text that explains the image’s purpose in context. Use empty alt text only for truly decorative images.
- Resize and compress images to the largest size actually needed; do not ship camera-original dimensions without a reason.
- Preserve aspect ratio and use `object-fit: cover` only when cropping is intentional.
- Keep important faces, text, and landmarks away from crop-sensitive edges.
- Gallery images and captions belong in `/past-trips/gallery/gallery-data.json`.
- Large video-production sources under `/DoYouSeeMeMusicVideo` are production materials, not normal website assets.

### Embedded video and companion audio

- Use YouTube's privacy-enhanced `youtube-nocookie.com` host for embedded players.
- Keep embedded video responsive at a 16:9 aspect ratio, provide a descriptive iframe title, allow full-screen playback, and include an external YouTube link as a fallback.
- Render YouTube video resources as embedded players inside their resource-library cards instead of requiring visitors to leave the site. In an intentionally ordered collection, place the video where its action appears; use the final position when the video should conclude the sequence after the sermon or other companion material.
- Introduce each video or audio item with a concise description that explains how it relates to the surrounding resource.
- Use native audio controls with `preload="metadata"` and include a direct audio link in the fallback text.
- Do not autoplay companion audio on a page that contains another playable media item. Let the visitor decide which experience to begin.
## 10. Voice and content standards

### Voice qualities

- Warm and invitational
- Faith-rooted without insider shorthand
- Relational and partner-centered
- Honest about what is known, scheduled, developing, or still exploratory
- Concrete about practical service while avoiding exaggerated promises
- Respectful, calm, and hopeful

### Preferred language

- “Serve alongside,” “listen first,” “trusted local ministries,” “learn,” “encourage,” and “meet practical needs” reinforce the intended posture.
- Name local partners and their work when permission and context allow.
- Distinguish confirmed opportunities from developing possibilities.
- Use “people experiencing homelessness” and similarly person-first language when it is accurate.

### Avoid

- Savior language, rescue narratives, or claims that a short trip will transform a community.
- Treating destinations or cultures as exotic scenery.
- Manufacturing urgency with unsupported deadlines or scarcity.
- Overpromising spiritual, vocational, or personal outcomes.
- Vague calls to action that hide what happens next.

### Content mechanics

- Use an em dash without surrounding spaces when joining related thoughts in the established site voice.
- Use the serial comma for clarity.
- Use ISO dates (`YYYY-MM-DD`) in JSON and databases; use natural-language dates in public copy.
- Page titles should end with `| Hope Sojourns` except the homepage.
- Every indexable page requires a unique, accurate meta description.

## 11. Accessibility standards

- Use semantic landmarks: header, nav, main, section, footer, and dialog.
- Keep the skip link and a single clear `main` target.
- Maintain logical heading order and one primary `h1` per page.
- Ensure every interactive element is keyboard reachable and visibly focused.
- Pair color with text, iconography, or structure; color must never carry meaning alone.
- Meet WCAG AA contrast for normal text and controls.
- Honor `prefers-reduced-motion` and avoid required information that appears only through animation.
- Use ARIA only to clarify behavior that native HTML does not already communicate.
- Announce dynamic form and loading messages appropriately.
- Keep touch targets large and avoid hover-only disclosure.
- Test zoom, narrow screens, and text wrapping before release.

## 12. Motion standards

- Motion should explain arrival, hierarchy, expansion, or the journey motif.
- Do not loop decorative motion.
- Keep interactions responsive and short; longer cinematic motion is limited to the optional first-visit invitation.
- Preserve content and navigation when motion is disabled.
- Any new animation requires a reduced-motion alternative.

## 13. New page checklist

Before a new page is considered complete:

- [ ] Load `/styles.css` with the current cache-busting version.
- [ ] Load `/script.js` when the shared public header and footer are required.
- [ ] Add a unique title, meta description, favicon, and mobile viewport.
- [ ] Use one `h1` and a logical heading outline.
- [ ] Reuse existing sections, cards, buttons, form fields, and status patterns.
- [ ] Use palette variables only; run `Check-Color-Palette.ps1`.
- [ ] Add meaningful alternative text and verify image cropping.
- [ ] Verify keyboard navigation, focus, contrast, and reduced motion.
- [ ] Test at desktop and narrow/mobile widths with no horizontal overflow.
- [ ] Check the browser console for errors.
- [ ] Update this guide if the page establishes a genuinely new standard.

## 14. Governance

If a proposed treatment differs from this guide, first determine whether it is:

1. a one-off inconsistency that should use an existing pattern;
2. a component-specific exception with a clear accessibility or content reason; or
3. a deliberate evolution of the design system.

Only the third case should create a new standard. Update `/styles.css`, `/COLOR-PALETTE.md` when colors are affected, and this guide in the same change.

## Revision history

| Date | Version | Change |
|---|---|---|
| 2026-09-03 | 2.6 | Added conditional email-address and phone-number rows to the complete Admin Portal contact record. |
| 2026-09-01 | 2.5 | Made the underlined contact name open the complete record while retaining a separate plus/minus summary control. |
| 2026-09-01 | 2.4 | Added the compact four-field contact directory, one-card-at-a-time summary disclosure, and separate full-record action. |
| 2026-09-01 | 2.3 | Added the prominent mobile Update portal control, distinct fresh-data action, and plain-language database refresh guidance. |
| 2026-09-01 | 2.2 | Added the phone-first Admin Portal workspace selector, labeled record cards, stacked touch controls, and full-screen mobile dialog standards. |
| 2026-08-31 | 2.1 | Added phone-camera optimization messaging, live optimizing status, before-and-after size feedback, and unchanged-file-picker guidance. |
| 2026-08-31 | 2.0 | Added camera-first private receipt-management patterns, responsive receipt cards and status behavior, a Receipts ledger column, and ministry-contact-before-add-form ordering. |
| 2026-08-30 | 1.9 | Added editable and removable spreadsheet-review rows, ledger check-number and row-action columns, and typed-confirmation deletion guidance. |
| 2026-08-30 | 1.8 | Renamed the user-facing CSM inbox to Payment inbox so the portal describes the workspace by purpose rather than by its internal integration. |
| 2026-08-30 | 1.7 | Added responsive unified-ledger, spreadsheet-import preview, bulk contact selection, activity-update, and personalized-document interface standards. |
| 2026-08-30 | 1.6 | Required embedded YouTube players in resource-library cards and documented intentional collection ordering. |
| 2026-08-29 | 1.5 | Added the single-card resource collection standard for related articles, songs, videos, and sermons. |
| 2026-08-29 | 1.4 | Added the responsive embedded-video and companion-audio standard for resource articles. |
| 2026-08-24 | 1.3 | Added the compact, responsive admin giving dashboard and transaction-review layout standard. |
| 2026-08-23 | 1.2 | Added hostname-aware response-portal environment labeling for the production launch. |
| 2026-08-23 | 1.1 | Added inclusive form-language and document-bundle standards for the public interest form and response portal. |
| 2026-08-23 | 1.0 | Established the living site-wide style guide from the implemented Hope Sojourns design system. |
