# Hexa AI Prompt Cookbook Reference

Standalone reference copy of the IRIS page:

- Source page: `https://iris.tenablesecurity.com/pages/67883eec-764b-4704-958e-17e0766ec68f`
- Local page: `../hexa-prompt-cookbook.html`
- Excel source: `../data/hexa/hexa-prompt-cookbook.xlsx`
- HTML build tool: `../tools/build-hexa-cookbook.py`
- Public page: `https://www.mrovere.com/hexa-prompt-cookbook.html`

## Visual System

- Dark Tenable-style canvas using `#192124` and elevated cards using `#1E2426`.
- Top 3px gradient bar from Tenable highlight yellow to cyan to purple.
- Tenable white logo in the header with a small `Hexa AI` label.
- Primary font is Inter; prompt/code-style details use JetBrains Mono.
- Large editorial header followed by a compact stats strip, horizontal capability chips, optional category banner, and responsive cards.

## Content Model

The page is fully static. It stores all content in two JavaScript arrays:

- `CATEGORIES`: 8 capability groups with id, name, icon, accent color, and description.
- `UCS`: 38 use cases, each mapped to a category and containing example prompts.

The current content totals are:

- 38 use cases.
- 97 example prompts.
- 8 capabilities.

## Interaction Model

- `render()` rebuilds the whole interface based on `activeCategory`.
- `buildCategoriesBar()` creates the `All` chip plus one chip per capability.
- `buildStats()` recalculates use case and prompt totals for the current filter.
- `updateBanner()` shows the active capability description.
- `buildCards()` renders use case cards and their prompt drawers.
- `togglePrompts(cardId)` opens and closes each prompt drawer by animating `max-height`.

## Adaptation Notes

- Remove or avoid the IRIS `<base href>` tag when hosting outside IRIS.
- Keep the logo URL external unless a local Tenable logo asset is required later.
- To create a LATAM-specific version, update only the `CATEGORIES`, `UCS`, title, subtitle, and header copy; the rendering logic can remain unchanged.

## Excel-Driven Update Flow

The editable source of truth is now `data/hexa/hexa-prompt-cookbook.xlsx`.

Workbook tabs:

- `Page Settings`: optional page title, header title, and subtitle.
- `Capabilities`: filter chips, icons, colors, descriptions, sort order, and active flag.
- `Use Cases`: one card per row, linked to a capability by `category_id`.
- `Prompts`: one example prompt per row, linked to a card by `use_case_id`.

To update the HTML after editing the workbook:

```bash
python3 tools/build-hexa-cookbook.py
```

Then validate and publish as usual:

```bash
python3 -m http.server 8765
```

Open `http://127.0.0.1:8765/hexa-prompt-cookbook.html` and confirm the totals, filters, and prompt drawers.
