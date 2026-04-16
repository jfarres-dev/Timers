# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A static HTML5 **Kanban-style timer board** (UI in Spanish) for tracking time on tasks/projects. No build step, no dependencies — pure vanilla JS/CSS/HTML.

Deployed to GitHub Pages via `.github/workflows/static.yml` on push to `master`.

## Running Locally

Open `index.html` directly in a browser, or serve with any static file server:
```bash
python -m http.server
```

There are no build, lint, or test commands.

## Architecture

All logic lives in [`js/app.js`](js/app.js) (~670 lines). There are no modules or imports.

### State

```js
state = { columns: [{ id, title, archived, cards: [{ id, title, elapsed, running, notes, tags, collapsed }] }] }
startedAt = { [cardId]: timestamp }  // wall-clock start times for running timers
```

State is persisted to `localStorage` on every meaningful mutation and on every tick while a timer is running.

### Data flow

1. `load()` → hydrates `state` from localStorage on startup
2. User actions → mutate `state` directly → call `render()`
3. `render()` → full re-render of `#board` (with focus/scroll preservation)
4. `tick()` → 1-second interval → updates elapsed for running timers → saves → updates DOM in-place (no full re-render to avoid flicker)

### Key sections in app.js

| Lines | Concern |
|-------|---------|
| 14–21 | State declarations |
| 23–58 | Utilities: `fmt()` (HH:MM:SS), `esc()`, `elapsedFor()` |
| 60–78 | Theme (dark/light toggle via localStorage) |
| 80–114 | `save()` / `load()` |
| 116–145 | `tick()` — timer interval |
| 186–315 | Board mutations: add/delete/archive columns & cards, toggle timers |
| 317–341 | Tag filtering (`applyFilters`) |
| 343–432 | Drag & drop (columns and cards) |
| 434–514 | HTML template functions (`cardHtml`, `columnHtml`, archived section) |
| 516–554 | `render()` |
| 562–668 | `DOMContentLoaded` init and event delegation |

### CSS

[`css/style.css`](css/style.css) uses CSS custom properties (`--var`) for theming. Dark/light mode is toggled by adding/removing a class on `<body>`.

### Tags

Cards support these tag values: `bug`, `feature`, `meeting`, `review`, `test`, `fix`. Tag filtering uses `data-tags` attributes on rendered card elements.
