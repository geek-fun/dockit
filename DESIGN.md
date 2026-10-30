---
name: DocKit
description: A restrained, dense, cross-platform document database workspace centered on connections and documents
colors:
  primary-light: "hsl(144 52% 45%)"
  primary-dark: "hsl(144 52% 45%)"
  background-light: "hsl(0 0% 100%)"
  background-dark: "hsl(222 14% 10%)"
---

# DocKit Design Specification

## Overview

**Design direction: a quiet document database workspace.** Connections, collections, and documents come first; actions second; brand expression last. DocKit keeps its green primary (`144 52% 45%`), light / dark themes, and full-width settings pages (`max-w-3xl` forms are DocKit's identity — do not import SQLKit's narrower `max-w-lg` dialog layout). The runtime source of all values is `src/assets/styles/index.css`; see [docs/theme-system.md](docs/theme-system.md) for the token architecture.

This file defines the density and typography constraints for new and modified client UI. It shares its scale with SQLKit so both clients stay consistent.

### Design principles

- Establish hierarchy through typography, spacing, and surface level first; accents stay scarce.
- Give remaining space to data. The shell (navigation, connection list) is calmer and more compact than the content it frames — never the reverse.
- Use shared tokens for light / dark themes; do not hardcode hex colors or font sizes in components.

## Typography

### Type scale

`index.css` defines the scale as CSS variables; `uno.config.ts` maps the two sizes missing from the default scale. Business components must use these utilities or variables — **bare px/rem `font-size` declarations in scoped styles are not allowed**. (Icon glyph sizing and the empty-state illustration remain the only exceptions.)

| Role | Token / utility | Value | Usage |
| --- | --- | --- | --- |
| Page title | `text-xl` | 20px / 600 | Standalone pages (Connect, History, Settings headers) |
| Dialog / panel / card title | `text-base` | 16px / 600 | Dialog titles, side-panel headers (chat, tasks), section titles |
| Body / form | `text-sm` | 14px / 400 | Descriptions, inputs, buttons, markdown body |
| Sidebar lists and menus | `text-body` | 13px / 400–500 | Connection card names, list items, menu items, chat input |
| Dense data / supporting labels | `text-xs` | 12px / 400–500 | Collection trees, result tables, toolbars, tabs, status text |
| Captions and badges | `text-caption` | 11px / 500 | Badges, timestamps, counters, column-type labels; the readable lower bound — 9–10px text is forbidden |

Markdown content inside chat uses an ordered heading scale: h1 20 → h2 16 → h3 14 → h4 13 → h5 12 → h6 11px.

### Line height

Use roughly 1.4–1.6 for ordinary text; code follows editor settings. Fixed-height rows must not clip text.

## Layout

### Baseline dimensions

| Element | Value | Source |
| --- | --- | --- |
| Window (initial) | 1600 × 1000 | `src-tauri/tauri.conf.json` |
| Main navigation rail | 56px wide, 36px entries (8px vertical rhythm), 20px icons, 3px active bar | `the-aside.vue` |
| Right utility rail | 40px wide, 40px entries, 20px icons | `tool-bar-right.vue` |
| Editor toolbar | 36px (`--tool-bar-height`), controls 28px | `tool-bar.vue` |
| Connect page tabs | ~32px triggers: `6px 16px 6px 10px` padding, 13px labels | `connect/index.vue` |
| Connection cards | 240px columns, min-height 140px, 12px padding, 8px radius, 28px icon wrapper, 16px vendor logo | `connect-list.vue` |
| Result tables | 28px headers, 12px cell text | `ui/table`, `ResultPanel` |
| Standard buttons / inputs | 32px default; 24 / 28 / 36px via `xs` / `sm` / `lg` | `ui/button`, `ui/input` |

### Spacing

- Primarily a 4px rhythm: 4 / 8 / 12 / 16 / 24 / 32px.
- Typical gaps: 4–8px between icons and text, 12–16px inside sections, 24px between major groups.
- Toolbars are single fixed-height rows (36px); do not stack card chrome around editors or grids.

## Icons

- Icon scale: 12px inline glyphs (chevrons, close buttons, badge icons), 14px tree / tab / compact toolbar icons, 16px standard buttons, menu items, and card action icons, 20px main navigation.
- Vendor logos use 16px inside cards, lists, and forms; 14px inside tabs.
- Panel icon buttons: 28 × 28px in side panels, 24 × 24px only inside dense rows.
- Do not mix 14px and 16px icons within one action row; do not add new icon libraries.

## Components

### Buttons, inputs, badges

- Button heights: `xs` 24px, `sm` 28px (sidebar / toolbar rows), default 32px (forms), `lg` 36px (dialog primary actions); `icon` / `icon-sm` / `icon-xs` mirror them. Prefer the size variants over per-component height overrides.
- Inputs and selects are 32px in forms, 28px inside toolbars and sidebars.
- Badges default to `text-caption` (11px / 500); status colors require real state plus text or icons.

### Dialogs and panels

- Dialog titles are 16px / 600 (`DialogTitle`). Dialog widths should be picked from a small set (400 / 520 / 640 / 800px); avoid one-off widths per dialog.
- Side-panel headers (chat, task manager, session history) all use the 16px title token; uppercase group labels inside panels use 12px.

### Recognition colors

Preserve the existing functional colors: HTTP method colors, boolean / key / constraint cues, transfer step colors, and vendor logo colors. New hardcoded colors are not allowed — add a token with light / dark definitions in `index.css` instead (see `--warning` as the pattern).

## Do's and Don'ts

### Do

- Reuse tokens, shared components, and the type scale; keep semantics consistent across light and dark themes.
- Keep connection context, collections, and documents dominant; collapse advanced options progressively.

### Don't

- Do not use bare `font-size` px/rem values, hardcoded hex colors, or ad-hoc icon sizes in components.
- Do not import SQLKit's dialog widths or blue theme; DocKit keeps its green primary and full-width settings layout.
- Do not let the shell grow denser-looking than the workspace: navigation and connection list stay more compact than trees, tables, and editors.

### Change acceptance checklist

- [ ] Every font size uses a scale utility or `var(--font-size-*)`; no new bare px/rem font sizes.
- [ ] Icon sizes match the 12 / 14 / 16 / 20px scale; vendor logos use 14 / 16px.
- [ ] Light / dark themes verified together; no undefined token references (e.g. using a variable that `index.css` never defines).
- [ ] Keyboard access, localized copy (English / Chinese), and empty / loading / error states preserved.
- [ ] `npm run lint:check` and `npm run build` pass; layout changes include screenshots in both themes.
