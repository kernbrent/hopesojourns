# Hope Sojourns website style guide

Version 4.8.1

Last reviewed: September 22, 2026

## Trip photos and past trip stories

Photos & memories adds responsive photo cards and dated journal notes to each trip. Administrators can upload several photos, add captions and credits, edit image descriptions, and select traveler visibility. Use descriptive alternative text that communicates the scene. The collection separates adding new material from editing saved items and includes a removed-items view with Restore controls.

Past-trip story uses a destination selector, public title, short summary, narrative, and explicit checkboxes for the material to publish. Save and preview opens a modal showing the exact public version. Publishing remains unavailable until the trip has ended and is marked Completed. The live version stays unchanged while a new draft is prepared; Unpublish story removes it from public access.

Traveler and public displays share journey/memories.css and memories-view.js. Galleries adapt to available width, include captions and dates, and open the full image in a new tab. Longer devotional resources use native expandable sections. Text uses the existing safe content formatter. Forms, cards, previews, and disclosure controls use existing palette tokens, visible labels, keyboard-accessible controls, and readable spacing. Keep the established public homepage and destination design; add past-trip stories within the existing destination layout.

In Photos & memories, Show removed items reveals Restore and, for administrators, Delete permanently. Keep the removed view selected after an action so the user can see the result. Permanent deletion asks for confirmation naming the item and explains that its record and stored photo cannot be restored. Items still used in a story show instructions to remove them from the preview and update or unpublish the public version first. An interrupted deletion shows a pending message and a retry control; hide the image and Restore control while its file is being deleted.

## Shared MMT navigation

The MMT portal uses a single forest sidebar across Ministry Management, Trips, Finances, Destinations, Account, and the Response Center. The logo and Home link return to Ministry Management. Home, Inbox, and Documents precede four expandable groups: Trips and destinations, People and ministry, Finances, and Account and settings. Links retain the same names and order across workspaces, subject to the signed-in user’s permissions.

The current group opens automatically when moving to another area; other groups collapse. Users may open additional groups manually. Native disclosure controls support keyboard interaction. The current page uses a gold accent and aria-current. The sidebar can be hidden, starts closed on phones, and scrolls independently when needed. Sign out stays at its foot. Use only shared palette tokens; shared sidebar typography and spacing must not inherit inconsistent page-specific styles.

## Devotional library

Open Devotional library from the Trips sidebar or toolbar, or use /admin/trips/?library=devotionals. Search matches every entered word against title, Scripture references, topics, and content. Add or edit masters with separate Scripture and comma-separated topic fields. The Trips and dates section shows original use and saved trip copies, including dates, draft/published status, and removed assignments. Deletion is reversible through Show deleted and does not change trip copies.

In a trip's Content tab, choose a devotional, select a date, and copy it into the trip editor. Personalize and save that copy. An empty generated devotional for that date is filled instead of creating a duplicate; nonempty studies are preserved. New trip-only devotionals can optionally be saved as a library master with the checkbox in the trip editor. Newly created trips open the Content tab. Hidden editor IDs are cleared after save/cancel and when changing trips.

Use the existing forest, gold, paper, ink, and line palette. The library uses a native modal with a searchable list beside the master editor on desktop; stack these on narrow screens. Keep primary trip-copy controls above the master editor, explain copy independence, and label master-save actions explicitly. Use regular-weight readable text in the content editor, visible focus/selection states, and live result counts. Enforce hidden attributes so deleted-only controls and inactive panels do not appear accidentally.


## Collapsible devotional days

Begin the devotional section with wrapping day-and-date links. Each dated group starts collapsed in a native details element. Its banner shows the trip day, full date, study title, Scripture references when supplied, and an Open study or Close study cue. Use forest-wash panels, existing text colors, visible keyboard focus, and generous touch targets. Selecting a day link opens and focuses its banner. Multiple studies on the same date share one banner. Keep unpublished days absent rather than renumbering the published days. This enhancement is deployed September 21, 2026.

## Traveler study typography

Bible studies and devotionals in the traveler portal use a reading column limited to 70 characters, generous paragraph spacing, forest-green bold section headings, bulleted talking points, and numbered group questions. Scripture references are bold; NIV reading links are descriptive and underlined. Closing prayers use italics and the existing dark gold-ink token. Keep body copy at 17px on desktop and 16px on small phones, with a 1.8 line height. Underlining denotes links rather than decorative emphasis. Use semantic headings, lists, strong text, and emphasis so the organization remains clear without color.

Apply this presentation when displaying devotional records, including Bible studies stored in that category. Existing drafts receive the same presentation when their owner publishes them. Formatting does not change publication status, visibility, or saved text. The typography update was deployed September 21, 2026.

## Dated trip preview layout

Dated trip pages use bounded horizontal padding inside the shared 1240px page shell. Keep the hero heading at a maximum of 4.5rem, allow long titles and codes to wrap, and stack the summary and details card at 760px. Never calculate inner hero padding from unused viewport width.

## Current shared trip password

Keep the credential card locked after saving, but label the password field Current shared password and show masked dots when a saved display copy is available. The field is read-only, so editors can use the existing eye button without unlocking or changing credentials. Keep the Show shared trip password and Hide shared trip password labels and aria-pressed state synchronized. Retrieve the value only on reveal and clear it when hidden, unlocked, reloaded, switched to another trip, or signed out.

Unlock credentials still enables editing, clears the field, changes its label to New shared password, and exposes the save action. Saving revokes traveler sessions and returns the card to the masked, locked state. For older passwords, show a brief instruction to unlock and save the password again before reveal is available. Read-only users see a permission explanation and cannot reveal or modify the credential. Use the existing field, eye button, card, status, and palette styling.

## Inbox completion and trash

Inbox cards offer Mark completed and Delete to users with inbox edit access. Manually completed notices offer Reopen; deleted notices offer Restore. The Show filter includes Needs action, Recent activity, Completed, and Trash. Completed and deleted items leave the home page attention count; Recent activity excludes Trash. Keep Open record available so users can review the original item.

Explain that these actions organize the shared inbox without approving payments, finishing budgets, or changing source records. Confirm deletion with plain language about Trash and restoration. Show success or failure feedback and disable an action while it is saving. Source-completed notices do not offer Reopen unless they also have a manual completion override. Read-only users can browse permitted notices but do not see management buttons. Reuse existing card, button, label, and status styles.

## Contact directory and spreadsheet

Contacts use compact summary cards without inline follow-up inputs or selection tools. Default order is last name A–Z. Show an alphabet above the filtered contact list containing only initials present in last names; clicking a letter instantly scrolls to and focuses its first contact. Normalize accented initials to their base letter, retain other Unicode letters, and omit blank or nonletter initials without hiding those contacts. Explicit alternative sort choices remain available.

Keep Last Contacted date and notes editing, row saves, selection, bulk updates, and personalized-document tools in Spreadsheet. The table has its own keyboard-focusable region with horizontal and vertical scrolling, a viewport-relative height limit, and sticky column headings, including on small screens. Bulk tools remain outside the table scrolling region. Preserve the separate Latest activity display and 50-character note limit. Ledger transfer amounts use the existing shared info color token.

## Trip budget comparison and bulk editing

Show estimated costs, actual costs, funding allocations, and remaining funding together in a labeled, horizontally scrollable table. Clearly distinguish unrecorded actual costs from a paid zero-cost item. Positive variance means over budget; excess allocations must say overallocated rather than appearing as a negative funding need.

Use Fund the entire budget for a funding-source and amount-basis preview, and Edit multiple budget items for a scrollable grid with labeled inputs. Show Needs estimate or Estimate reviewed on both collapsed rows and expanded details. Keep estimate review separate from payment status. Require a review step before bulk saves; explain ledger effects and report partial completion without retrying silently. Reuse shared palette variables, native dialog focus handling, semantic table headers, and accessible per-item input labels.

## Shared portal account management

Use Organization Administrator for shared identity and cross-portal authority, Portal Administrator for one portal, and Member for assigned section access. Both account pages show My shared profile, Change shared password, and Users & access requests when authorized. The user list shows portal memberships, global status, and last logged in with the viewer's local time zone.

Separate HS and CSM access into labeled fieldsets. Each has Allow access to this portal, Portal Administrator, and section-level Blocked, Read only, and Edit choices. Presets change only that portal's section choices. Only Organization Administrators see both fieldsets, shared status, shared profile editing for others, and the Organization Administrator checkbox. Explain that removing one membership leaves the other intact, while Suspended in both portals and Delete shared account affect both. Keep typed username confirmation for deletion. Linking an existing account requires independent identity verification and preserves the existing password.

Use compact inline checkboxes, readable sidebar link contrast, palette-based borders and backgrounds, scrollable dialogs, and a horizontally scrollable directory on small screens. Shared profile and recovery screens preserve US phone masking while storing ten digits. Existing users retain usernames, and users cannot edit their own access level. The Switch to Hope Sojourns or Switch to Christian Steps Ministries link appears only when both memberships are active. The switch screen shows progress or a clear retry/sign-in message without showing tokens.

The shared account UI is maintained in HS admin/account/account.js and copied to CSM's admin/account directory. Both portals keep their own branding. New account forms, role selection, instructions, and permission denial messages must describe the scope of the action plainly, especially changes that affect both portals.

## Donation split editor

Place Split donation beside eligible income entries. The dialog identifies the original payer and date, charitable amount before fees, and any fee and net deposit. Use labeled donor fields, an existing-contact selector, and Add donor and Remove donor controls. Selecting an existing contact makes identity fields read-only; choosing New donor enables entry. A live Amount remaining message helps the user allocate the complete donation.

Use two columns for donor fields on wider screens and one column on small screens. Keep dates, amounts, validation messages, Save split, Cancel, and Undo split visible through normal dialog scrolling. Escape and Cancel close without saving. Explain that the original payment remains counted once. Undo requires confirmation and retains a readable change history. Use the shared palette and existing buttons, labels, and focus styles.

## MMT account and access screens

The sign-in form visibly requires User name and Password; the primary administrator uses admin. Request access and Forgot password are adjacent recovery choices. My profile and users is available in the administration navigation. The profile screen shows the immutable username, registration date, and access summary alongside editable personal contact fields.

Use a labeled permission matrix with Blocked, Read only, and Edit choices for each section group. Read-only and blocked presets make common assignments easier; administrator access is an explicit separate choice. Group labels must explain that contacts includes people, ministries, and requests, while trip operations includes participants and budgets. Hide unavailable destinations in navigation and explain restricted actions clearly. Do not rely on disabled controls for security.

Account dialogs retain explicit Save and Cancel controls and preserve existing palette, typography, responsive layout, and keyboard labels. Temporary-password actions require an identity-verification acknowledgement and show the password once. Delivery messages distinguish Sent from Not sent and must never imply an email was delivered when it was not. Recovery requests explain that an administrator will review identity before resetting access.

Format clearly identified US phone numbers as (###)###-#### in forms and record displays. Accept pasted ten-digit numbers or a leading US country code; the storage layer keeps ten digits. Preserve international numbers and extensions rather than truncating them to fit a US mask. Country fields determine whether a phone is treated as US-based.

## Destination management patterns

The Destinations navigation item opens a shared finance-style workspace for public trip tiles. Editors can change names, dates, plain-text content, photos and photo credits; choose Draft, Published, or Hidden; and preview content privately. Hiding retains trip and financial history. New destinations are saved as Draft before uploading a photo, then published explicitly.

Display order uses lower numbers first. Explain beside the field that choosing an occupied number moves that destination and all higher-numbered destinations up by one automatically. Refresh the table after saving to show every affected number. Ordinary content edits must not change neighboring order. Photo previews scale to the dialog width, and labels and status messages remain accessible. Public interest choices follow the same published list and order as the tiles.

## 1. Purpose

This guide defines how Hope Sojourns should look, sound, and behave across the public website and private response portal. It is a living standard: when the website intentionally changes, this guide should change with it.

The goal is a site that feels warm, grounded, hopeful, relational, and trustworthy. The design should support the ministry story without becoming more prominent than the people, partnerships, and opportunities being described.

## 2. Canonical design sources

| Source | Responsibility |
|---|---|
| `/styles.css` | Global visual system and the canonical `:root` design tokens |
| `/experience.css` | Public editorial redesign, imported by the shared stylesheet and scoped to `hs-redesign` |
| `/tools/build_front_door.py` | Maintainable story, welcome, discovery, and public partnership page source |
| `/admin/admin.css` | Portal-specific layouts that inherit global tokens |
| `/admin/trips/trips.css` | Focused trip-administration workspace that inherits global tokens |
| `/journey/journey.css` | Shared trip portal layout and content hierarchy |
| `/trip-account/trip-account.css` | Private financial statement layout and print treatment |
| `/trip/trip.css` and `/admin/annual-summary/annual-summary.css` | Actual-trip public detail and printable annual summary treatments |
| `/script.js` | Shared header, navigation, footer, motion, and photo-viewer behavior |
| `/COLOR-PALETTE.md` | Focused color specification, contrast notes, and token rules |
| `/Check-Color-Palette.ps1` | Automated guardrail against one-off colors or pages missing the shared stylesheet |

Every page must load `/styles.css`. A future color change should be made in the `:root` token block, never by hunting through individual components.

## 3. Brand foundation

### September 2026 test experience

The public test site uses an editorial design centered on encounters, shared humanity, and Christian service. Production retains its previously approved release until a separate promotion is requested. The standards in this subsection take precedence over the older public hero, pill-button, rounded-shell, and cinematic-introduction treatments described elsewhere in this guide. Private portal components retain their existing standards.

The welcome at `/` uses large Georgia typography, warm paper, and a deep forest quotation field. It opens with a personal encounter rather than a destination. `/explore/` is the complete main page, with ministry photography, curiosity links, the existing journey catalog, internships, and the founding story. Keep the visible “Explore the main site” link in the sticky header on every public page, including mobile; it must remain outside the collapsed menu.

Visitors can read two short, manually paced stories at `/stories/`. There is no automatic introduction, audio, timed advance, entrance animation, or scroll reveal. Every story includes an exit to the main site. Greece is identified only as the setting of the founding stories and one destination among many; it must not define the organization’s reach.

The discovery page offers questions about going, joining local work, and bringing a community. These are invitations to explore, not assigned identities. People can change direction freely. No hidden persona, browsing profile, or inferred role is saved. Dedicated ministry, group, and college pages provide relevant practical continuations.

Public typography uses Georgia for expressive headings and the existing system sans-serif for body copy. Large headings scale with the viewport; body copy is normally 17–18px. Primary actions are deep forest with paper text, modest 3px corners, and a clear hover/focus state. Secondary actions are understated text links. Use flat surfaces, fine rules, open spacing, and 3–5px card corners rather than raised rounded panels. The main photographic arch is a deliberate exception.

Use only existing shared palette tokens: paper and cream surfaces, deep forest fields, forest actions, dark coral emphasis on paper, and light gold emphasis on deep forest. No new palette colors are introduced. Downloaded copies of existing ministry photographs are optimized for local delivery; retain accurate captions and do not imply that Athens represents every journey. The existing destination catalog imagery remains separate from the personal story imagery.

At 1000px the navigation collapses; at 700px editorial columns stack. Keep all controls usable at 320px. Native anchors provide shareable story and curiosity locations, browser history, and a complete reading experience without JavaScript. On enhanced pages, move focus to the revealed heading after a visitor changes the story or question. Escape closes the mobile menu.

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

### Trip management and participant portals

- Treat a public opportunity, an actual trip, shared traveler resources, and private financial information as four distinct layers. Labels and actions must make the current layer obvious.
- Use **Trip management** as a focused administrator destination instead of crowding the main response-portal tabs. Give the workspace a persistent trip list on wide screens, a clear back action, and a compact selector or stacked layout on narrow screens.
- Lead each trip workspace with name, trip ID, dates, status, and concise readiness and financial summaries. Follow with task-centered areas for overview, team and partners, traveler portal, content, budget and funding, accounts and payments, invitations and messages, public page, and setup lists.
- Keep summary cards visibly distinct from entry forms. Label read-only cards as **Summary**, use a lighter dashed boundary, and provide an adjacent edit action when the saved values are maintained elsewhere.
- Introduce the workspace with one short explanation: labeled fields plus a Save button are editable; summary cards show saved information; core dates, location, status, capacity, and public settings use **Edit trip**.
- Offer **Guided help** as an optional, persistent control. When enabled, show a setup-guide card after a trip opens with completed and total step counts, a progress meter, the next recommended action, a direct **Go to next step** control, and an expandable checklist. Enable it for first use, remember the administrator's on/off choice in that browser, and keep required prerequisite notes visible independently of this preference.
- Make every setup-checklist item an action. Available items may be opened in any order; an unavailable item must remain clickable and answer with a brief **Please complete [prerequisite] before this [item]** message. Do not impose a linear sequence when the underlying records are independent.
- Provide the same persistent, collapsible administration rail in the main response center and trip management. Remember its open or closed state in that browser, place the collapse control at the rail edge, and change it to a slide-over menu at narrower widths. A valid cross-workspace session should show a neutral loading state while it is checked, never a momentary login form.
- Every password input needs an adjacent eye control with an accessible Show/Hide label. Revealing text is temporary; reset it to masked after sign-in, sign-out, successful save, or a return to a protected state.
- After a shared trip login has been created, render its credential card as visibly locked and muted. Disable the login-ID field and make the masked current-password field read-only, with its eye button available to authorized trip editors. Hide the save action and expose one explicit **Unlock credentials** action. Unlocking clears the password for entry; saving revokes prior traveler sessions and returns the card to its masked, locked state. Explain when older passwords must be saved again before reveal is available.
- Offer a spreadsheet-import callout wherever administrators manage trip content, budgets, accounts, payments, support, or invitations. The modal must offer both a clean starter template and **Download this trip's workbook**, require a preview before commit, show row-by-row Create, Update, Unchanged, or Blocked actions beside the detailed status, and preserve the selected file while corrections are reviewed.
- Put People and Ministries first in the workbook workflow so one upload can create those records before Team, Partners, Accounts, or other dependent rows reference them. In exported trip workbooks, visually mute the protected metadata columns and plainly tell administrators not to change Record ID, Original Updated At, Original Fingerprint, or Original Role. Block stale edits with a brief instruction to download a fresh copy; never export invitation secrets or private links, and treat existing payment rows as read-only audit records.
- Keep dense setup forms inside cards or disclosures and keep saved records visually separate beneath them. Buttons must use direct verbs such as **Save cost**, **Record payment**, **Add coverage**, **Create request**, and **Create invitation**.
- Show saved budget items as a slim native-disclosure register. The collapsed row identifies the category, description, calculation, total, and status; each row can expand independently, and an **Expand all items** control may open or close the full register.
- Treat **Finish budget** as an explicit workflow decision, not a side effect of entering one cost. Show whether the budget is in progress or finished and visibly reopen it whenever budget inputs change.
- Present the budget as one traveler's base expenses multiplied by the paying-traveler count, plus percentage-based Hope Sojourns leadership/administration fees and fixed trip-wide costs. Keep covered leaders and scholarship recipients out of the paying-traveler multiplier while preserving their support-credit and funding records.
- Put a small question-mark help trigger beside every Budget and Accounts & Payments field heading. Each help message states both what belongs in the field and why the business needs it. These small non-modal help popovers are the one intentional click-away exception: clicking outside dismisses them. A large page explanation remains a semantic dialog and follows the global intentional-close rule.
- Keep administrator cards visually and technically separate from the cinematic public trip cards. Trip administration uses the neutral `trip-admin-card` component; the public `trip-card` component includes image overlays, fixed visual heights, and hover movement that must never cover or resize an administrator form.
- When an action depends on another record, place a visible note inside that card using **Please complete [prerequisite] before this [item]** and disable only the unavailable action. Link to another administrator workspace when that is where the prerequisite is created. Saved team-member and organization cards must provide an **Edit** action that returns the administrator to the populated form.
- Use friendly **payment request**, **balance notice**, or **status** language in participant communication. Do not use **invoice** unless a later legal or accounting decision specifically requires it.
- Financial summaries must distinguish charges, payments, support credits, balance, costs paid through Hope Sojourns, and costs paid externally. Never use one unlabeled total to combine cash received by Hope Sojourns with an outside partner's settlement.
- Present support for a leader or scholarship recipient as a named support credit with its funding source. Do not visually disguise coverage as a traveler payment.
- Cost records should show estimate, actual total, settlement route, payment status, vendor, and funding allocations together. State plainly that a paid Hope Sojourns cost enters the central ledger and that externally settled costs do not.
- Interest-form submissions remain a visible prospect list until an administrator changes the separate team-member status. Invitation records show label, organization, use count, expiration, and status without re-exposing their secret token.
- Describe Invitations plainly as application/interest links for prospective travelers. Never imply that an invitation opens the approved traveler's shared portal; distribute the separate Trip ID and password only after approval.
- The shared traveler portal uses one trip login ID and password for common information. Its sign-in screen should feel calm and welcoming while plainly explaining shared access. Never show charges, balances, payment history, private links, internal notes, or non-opted-in directory fields there.
- State explicitly that the traveler sign-in does not use a personal email address. Disable repeat submission while opening, announce a slower request, stop stalled requests with a useful retry message, briefly retry the session handoff, and replace the sign-in view with the trip portal after success.
- Within the shared portal, group content by practical purpose: devotionals, itinerary, instructions, resources, updates, and team. Use date and time labels where relevant, preserve multiline content, and keep exact operational details out of public content.
- Individual, family, group, organization, and sponsor finances belong on the private account statement. Lead with charges, payments, support credits, and remaining balance; follow with itemized records and payment requests. Make the page printable, low-chrome, and explicit that the link is private.
- Public actual-trip pages show only an approved summary, dates, location, interest action, and Public plus Published content. On the evergreen opportunity page, actual departures appear as dated action cards without replacing the broader opportunity story.
- Content visibility and publication status are independent. Use readable text for Public, Travelers only, Admin only, Draft, and Published; never rely on color. Finishing a trip must not visually imply that traveler-only content became public.
- The annual contact summary must use separate, clearly titled sections for charitable contributions and other payments. Show subtotals for payments received by Hope Sojourns and settled externally, retain the charitable receipt disclaimer, and hide administrator controls in print.
- Invitation and account links are sensitive results. Show each new secret link only after creation, offer a clear copy action, and do not repeat it in ordinary saved-record cards.
- Message delivery status must say Draft, Queued, Sent, Failed, or Canceled in text. When outbound email is not configured, keep the message queued and explain the setup state rather than implying delivery.
- All new trip pages load `/styles.css` first and use only shared palette variables. The focused stylesheets may add layout and component rules but may not introduce literal colors.

### Admin ministry details

- Order ministry detail content by review workflow: profile and connected trips first, then **Ministry contacts**, then **Add a ministry contact**, with permanent deletion last.
- Existing linked contacts take precedence over the add form so administrators can understand current relationships before creating another one.

### Dialogs and lightboxes


- Use semantic `<dialog>` where practical and provide an obvious close action.
- Clicking a dialog backdrop must leave the dialog open and preserve entered or selected information; dismissal requires an intentional close, cancel, or completed action.
- Apply that backdrop rule to every administrator dialog, including the trip create and edit window. Do not add component-specific backdrop handlers that close a dialog.
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
- Keep interactions responsive and short. The redesigned public experience has no cinematic introduction or timed transitions; readers advance stories themselves.
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

## Ministry Management interface

The private `/admin/ministry/` workspace uses the shared palette and `/admin/ministry/ministry.css`. Desktop navigation is a persistent left rail. At the mobile breakpoint it becomes a horizontal navigation row, with a single-column content area. Tables scroll within their containers rather than widening the page.

Home emphasizes actions requiring attention. Inbox separates Needs action, Recent activity, and Completed. Financial work uses recognizable Income and Expenses views with add and edit dialogs, and keeps advanced tools accessible. All existing functionality remains reachable through the original workspaces.

Trip preparation follows budget, traveler assignment, and content review. Label unreviewed costs Needs estimate; zero is a valid reviewed estimate. Explain percentage and amount overrides alongside HS Travel. Distinguish traveler contributions from HS leader expenses and projected balances from recorded cash allocations. Funding actions show the source and settlement route before saving. Mark all paid means recording funding, not deleting a balance.

Use native labeled controls, keyboard-accessible dialogs, visible focus indicators, live status messages, and disabled submit buttons while saving. Escape all record text before rendering. Document replacements retain prior versions; deletion uses the plain-language Move to trash action with Restore available.

The main administration and trip sidebars provide direct Ministry Management, Inbox, Documents, and Settings links. Settings reuses the existing password and sign-out controls and stores Guided Trip Help in the existing browser preference. It opens after authentication at `/admin/#settings`.

The ledger follows the CareerSteps Income and Expenses work pattern with direct sidebar views, separate add buttons, and compact rows. Full record disclosures retain every previously displayed field. Receipt, edit, delete, import review, export, source filters, and pagination continue to use the same HS handlers and database. No data migration is needed for this interface change.

## Expanded bookkeeping screens

The finance workspace at `/admin/finance/` uses a CareerSteps-style left navigation rail, a compact page heading, summary cards, filter controls, and transaction tables. Apply HS forest, cream, and gold tokens from the shared palette. Desktop navigation is 232 pixels wide, with horizontal navigation on small screens. Tables scroll within their own containers.

Provide direct navigation for Dashboard, Expenses, Income, Invoices, Documents, Mileage, Trips, Ministries, Reports, and Settings. Keep the existing ledger/import workflow reachable. Use organization-wide as the default trip choice and None as the default ministry choice. Neither relationship is required, including for board meetings, office expenses, fundraising, or general ministry travel.

Invoice screens distinguish draft, issued, partially paid, paid, overdue, and void records. Show total, received payments, and remaining balance. Applying a payment matches received income; it never charges or sends a payment. Mileage screens distinguish logged miles, estimated mileage value, tolls, and missing rates. Do not combine mileage estimates with cash expenses.

Forms use labeled native inputs, optional trip/ministry selectors, visible keyboard focus, intentional dialog dismissal, and disabled Save controls while saving. Provide printable invoice and report layouts without navigation. Escape record text and neutralize spreadsheet formula prefixes in CSV output.

## User deletion

Place Delete user beside the existing user actions, except on the signed-in administrator's own row. The confirmation dialog names the person, explains that access ends while past activity is retained, and requires the exact username. State that the username and email remain reserved. Preserve explicit Save and Cancel controls, validation feedback, and intentional dialog dismissal.

## Revision history

| Date | Version | Change |
|---|---|---|
| September 22, 2026 | 4.8.1 | Administrator permanent deletion for removed trip memories with confirmation, story protection, and retry handling. |
| September 22, 2026 | 4.8.0 | Trip photo collections, traveler memories, and reviewed destination trip stories; prepared locally. |
| September 22, 2026 | 4.7.0 | Shared, expandable MMT navigation and consistent portal home link. |
| 2026-09-22 | 4.6.0 | Added reusable devotional library, topic/Scripture search, trip copies, usage history, and recoverable deletion. Preserved approved public design. |
| 2026-09-21 | 4.5.8 | Added collapsed devotional day banners and day navigation. Deployed September 21, 2026. |
| 2026-09-21 | 4.5.7 | Added readable traveler study sections, Scripture emphasis, real lists, underlined reading links, and italic prayers. Deployed September 21, 2026. |
| 2026-09-20 | 4.5.6 | Corrected dated-trip hero spacing and heading wrapping across phone and wide desktop layouts. |
| 2026-09-19 | 4.5.5 | Added masked current shared password, eye-button reveal while locked, and legacy-password and permission explanations. |
| 2026-09-19 | 4.5.4 | Added inbox action buttons, Completed and Trash views, and source-preserving confirmation copy. |
| 2026-09-18 | 4.5.3 | Compact contacts, last-name alphabet navigation, and independent spreadsheet scrolling. |
| 2026-09-18 | 4.5.2 | Added direct Last Contacted fields and selected-contact follow-up updates in People and Spreadsheet views. |
| 2026-09-18 | 4.5.1 | Added whole-budget funding previews, estimated/actual/allocated comparisons, and reviewed multi-item cost editing. |
| 2026-09-17 | 4.5.0 | Added shared profile and role terminology, independent portal access fieldsets, scoped actions, and portal-switch navigation. Local pending release. |
| 2026-09-17 | 4.4.2 | Added responsive donor split dialog, remaining-amount feedback, and edit/undo history patterns. |
| 2026-09-17 | 4.4.1 | Added confirmed user deletion with access revocation and preserved history; local pending release. |
| 2026-09-17 | 4.4 | Added individual MMT accounts, section permissions, profile and recovery workflows, email delivery requirements, and US phone storage and masks; local implementation pending release. |
| 2026-09-17 | 4.3 | Added managed public destinations, photo and visibility controls, and automatic insertion ordering. |
| 2026-09-17 | 4.2 | Added local bookkeeping dashboard, optional trip/ministry relationships, mileage, invoices, reports, and review controls. |
| 2026-09-17 | 4.1 | Added Ministry Management navigation, trip preparation, funding, and document interface standards. |
| 2026-09-10 | 4.0 | Added the test-only editorial public experience, permanent main-site escape, manually paced stories, curiosity navigation, partnership pages, and responsive design rules. |
| 2026-09-07 | 3.6 | Added compact expandable budget records, explicit budget-finish status, paying-traveler and fee-percentage presentation, What/Why field help, the field-popover click-away exception, and invitation-purpose language. |
| 2026-09-07 | 3.5 | Added clean and current-trip workbook choices, same-upload People and Ministries creation, protected metadata styling, explicit Create/Update/Unchanged/Blocked preview actions, and immutable secret/payment guidance. |
| 2026-09-06 | 3.4 | Clarified traveler sign-in identity and required bounded, announced, recoverable, single-view session-opening behavior. |
| 2026-09-06 | 3.3 | Added persistent slide-out administration rails, no-flash session loading, accessible password reveal controls, locked shared credentials, dependency-aware clickable setup steps, and preview-first trip spreadsheet imports. |
| 2026-09-06 | 3.2 | Separated neutral trip-administration cards from the public trip-card overlay and grid treatment so every administrator form remains readable, correctly sized, and interactive. |
| 2026-09-06 | 3.1 | Distinguished trip summary cards from editable forms, added clear edit paths, selection prerequisites, and optional progress-based guided help, and applied the no-backdrop-dismiss rule explicitly to trip administration. |
| 2026-09-06 | 3.0 | Added visual and language standards for actual-trip administration, public departures, traveler-only content, private account statements, financial separation, invitation handling, and annual gift/payment summaries. |
| 2026-09-04 | 2.7 | Required intentional dismissal for Admin Portal dialogs so backdrop clicks preserve work in progress. |
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


### Public design restoration — September 21, 2026

Restored the production homepage, shared navigation script, and shared stylesheet to the approved public design from c617a30 (archived deployment bcdaf6ac). The homepage again reads “Travel farther. Serve closer.” The experimental experience stylesheet is no longer imported globally. Current admin, finance, trip portal, and devotional formatting/day navigation remain intact. Experimental routes and assets remain available in source but are not linked by the restored public navigation. Do not run tools/build_front_door.py for production; that generator replaces the approved homepage with the experimental design.
