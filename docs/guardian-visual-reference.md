# Guardian Visual Reference

This document is the portable visual contract for Guardian Program pages in Apps MROVERE.

Published pages after GitHub Pages rebuild:

- Visual reference: `https://www.mrovere.com/guardian-visual-reference.html`
- LATAM demo page: `https://www.mrovere.com/guardian-latam.html`

Local preview:

```bash
python3 -m http.server 8765
```

Then open:

```text
http://127.0.0.1:8765/guardian-visual-reference.html
http://127.0.0.1:8765/guardian-latam.html
```

## Visual DNA

- Use `Work Sans` for all text.
- Use matte dark pages, not gradients.
- Use the Tenable hex logo plus lowercase `tenable` wordmark in the top navigation.
- Use a sticky top navigation with active underline.
- Use Tenable yellow only for active nav, status, calls to action, and Guardian One accents.
- Use square or nearly square card edges, subtle borders, and dense operational layout.
- Keep dashboards information-first and low decoration.

## Color Tokens

```css
:root {
  --bg: #1a1a1a;
  --bg-raised: #242424;
  --bg-card: #2a2a2a;
  --bg-hover: #323232;
  --border: rgba(255, 255, 255, 0.08);
  --border-mid: rgba(255, 255, 255, 0.14);
  --yellow: #d4f000;
  --yellow-dark: #a8c000;
  --white: #ffffff;
  --grey-1: #e0e0e0;
  --grey-2: #a0a0a0;
  --grey-3: #606060;
  --success: #00c896;
  --warning: #f5c020;
  --danger: #ff4040;
}
```

## Typography

- Font family: `"Work Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Hero heading: `72px`, `font-weight: 800`, `line-height: 1`.
- Section heading: `42px`, `font-weight: 800`.
- Labels and badges: uppercase, `10px` to `12px`, `font-weight: 800`, `letter-spacing: 1.5px` to `2px`.
- Body copy: `14px` to `18px`, grey text.

## Core Layout

The pattern is:

1. Sticky dark top nav.
2. Hero with faint hex decoration.
3. Full-width dark section bands.
4. Dense card grids with 1px borders.
5. Dashboard metrics and status cards.
6. Prompt library cards.
7. Benefits table or comparison grid.
8. Compact footer.

## State Model

The live LATAM demo uses body-level state classes:

- `view-public`: public / non-Guardian.
- `view-guardian`: logged-in Guardian.
- `view-g1`: logged-in Guardian One.

Content visibility classes:

- `.only-public`
- `.only-guardian`
- `.only-g1`
- `.show-guardian`

The reference JS function `setView(cls, btn)` changes:

- top navigation badge,
- active prototype button,
- dashboard heading,
- Guardian vs Guardian One status block,
- Cloud Security certification row,
- progress bar animation.

## Components To Reuse

- Tenable hex SVG logo.
- `nav` with active underline.
- `.hero` with `.highlight` in the H1.
- `.btn-yellow` and `.btn-outline`.
- metric cards with `.metric-value`.
- `.status-block` with `.status-dot`.
- `.prompt-card` with `.prompt-cat`.
- benefits/comparison table.

## Tool Prompt Seed

Use this prompt when asking another tool to create a page in this style:

```text
Use the Apps MROVERE Guardian visual reference. Follow the Tenable LATAM Guardian style: Work Sans, dark #1a1a1a page background, #2a2a2a card surfaces, subtle white borders, Tenable yellow #d4f000 for active states and CTAs, sticky top navigation with Tenable hex logo and lowercase wordmark, oversized hero headline with one yellow highlight, dense operational cards, status badges, metric panels, and prompt-library cards. Do not use gradients, beige palettes, decorative blobs, rounded marketing cards, or explanatory UI text.
```

## Source Files

```text
guardian-visual-reference.html
guardian-latam.html
docs/guardian-visual-reference.md
```
