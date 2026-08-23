# Hope Sojourns color palette

The canonical color definitions live at the top of `styles.css` in the `:root` block. All public pages and the private response portal load that stylesheet. Change a color there and every use of its variable updates across the site.

## Core palette

| Token | Name | HEX | RGB | Primary use |
|---|---|---:|---:|---|
| `--ink` | Ink | `#19322B` | `rgb(25, 50, 43)` | Primary text |
| `--muted` | Muted green-gray | `#60726B` | `rgb(96, 114, 107)` | Secondary text |
| `--paper` | Warm paper | `#FFFDF8` | `rgb(255, 253, 248)` | Main content surface |
| `--white` | White | `#FFFFFF` | `rgb(255, 255, 255)` | Cards, controls, and text on dark surfaces |
| `--cream` | Cream | `#F6F1E7` | `rgb(246, 241, 231)` | Page and section backgrounds |
| `--forest` | Forest | `#275D4D` | `rgb(39, 93, 77)` | Links, secondary actions, and brand accents |
| `--forest-dark` | Dark forest | `#173F35` | `rgb(23, 63, 53)` | Headings, dark sections, and action text |
| `--forest-deep` | Deep forest | `#0B2720` | `rgb(11, 39, 32)` | Footer, photo overlays, and deepest shadows |
| `--gold` | Journey gold | `#D99B42` | `rgb(217, 155, 66)` | Primary actions and accents on light surfaces |
| `--gold-light` | Sunlit gold | `#F3C780` | `rgb(243, 199, 128)` | Gold text and detail on dark/photo surfaces |
| `--coral` | Hope coral | `#C9674E` | `rgb(201, 103, 78)` | Brand accent on light surfaces |
| `--coral-dark` | Dark coral | `#A34C38` | `rgb(163, 76, 56)` | Large coral surfaces carrying white text |

## Supporting tints

| Token | Name | HEX | RGB | Primary use |
|---|---|---:|---:|---|
| `--forest-wash` | Forest wash | `#EDF5F1` | `rgb(237, 245, 241)` | Selected states and pale green sections |
| `--forest-soft` | Soft forest | `#D8EBE4` | `rgb(216, 235, 228)` | Illustrated accents and confirmed states |
| `--sage` | Sage | `#73A997` | `rgb(115, 169, 151)` | The third “Our Approach” story accent |
| `--gold-wash` | Gold wash | `#FFF8E9` | `rgb(255, 248, 233)` | Notices and highlighted panels |
| `--gold-soft` | Soft gold | `#F4E5C8` | `rgb(244, 229, 200)` | Labels and illustrated accents |
| `--gold-ink` | Gold ink | `#6B4B1E` | `rgb(107, 75, 30)` | Text on gold-tinted surfaces |
| `--coral-wash` | Coral wash | `#FFF0EA` | `rgb(255, 240, 234)` | Error and coral-tinted surfaces |
| `--coral-soft` | Soft coral | `#F4D1C3` | `rgb(244, 209, 195)` | Illustrated accents |

## Functional colors

These colors are intentionally distinct because they communicate system status. They should not be used decoratively.

| Token | Meaning | HEX | RGB |
|---|---|---:|---:|
| `--success` | Success | `#1F6849` | `rgb(31, 104, 73)` |
| `--success-wash` | Success surface | `#E2F1E8` | `rgb(226, 241, 232)` |
| `--info` | Information | `#285B8F` | `rgb(40, 91, 143)` |
| `--info-wash` | Information surface | `#E5EEF9` | `rgb(229, 238, 249)` |
| `--warning` | Warning | `#7B4F09` | `rgb(123, 79, 9)` |
| `--error` | Error or destructive action | `#8F3030` | `rgb(143, 48, 48)` |

Warnings use `--gold-wash` as their surface. Errors use `--coral-wash`.

## Why similar colors remain

- `--paper` and `--white` are intentionally separate. Paper gives the site its warm canvas; white creates clear card and form-control separation.
- `--gold` is the accessible action color on light surfaces. `--gold-light` is brighter so it remains legible on dark green and photographic backgrounds.
- `--coral` is a decorative accent on light surfaces. `--coral-dark` is used for filled sections with white text because the base coral is not dark enough for normal-size white text.
- The wash and soft colors have different jobs: washes are large subtle surfaces; soft colors are smaller illustrated accents.
- Success, information, warning, and error colors remain distinct because color reinforces their text labels and meaning.
- Transparent variants use the matching `--*-rgb` channel token. Different opacity levels are intentional for borders, shadows, overlays, and hierarchy; the underlying hue still comes from this palette.

## Accessibility reference

Key text pairings meet WCAG AA for normal text:

| Foreground / background | Contrast |
|---|---:|
| Ink on paper | 13.48:1 |
| Muted on paper | 5.02:1 |
| Forest on paper | 7.49:1 |
| Dark forest on gold | 4.85:1 |
| Sunlit gold on dark forest | 7.39:1 |
| White on dark coral | 5.76:1 |

Do not place normal-size white text on `--coral`; use `--coral-dark` for that pattern.

## Rules for future work

1. Load `/styles.css` on every page.
2. Use a semantic alias such as `--color-page`, `--color-surface`, `--color-text`, `--color-link`, or `--color-action` when it describes the role. Use a named palette token when the hue itself carries meaning.
3. Do not add literal HEX, RGB, HSL, or named colors in component or page CSS. Add or change a token in the shared `:root` block first.
4. For transparency, use a channel token: `rgba(var(--forest-rgb), .2)`.
5. Document any genuinely new color here, including why an existing token cannot serve the same purpose.

```css
/* Preferred */
.new-card {
  background: var(--color-card);
  color: var(--color-text);
  border: 1px solid var(--line);
}

/* Avoid */
.new-card {
  background: #ffffff;
  color: #19322b;
}
```
