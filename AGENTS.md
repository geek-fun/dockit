# DocKit - AI Agent Guidelines

## Project Overview

DocKit is a Tauri v2 + Vue 3 + TypeScript desktop client for NoSQL databases (Elasticsearch, OpenSearch, DynamoDB).

**Tech Stack**: Tauri v2 (Rust backend), Vue 3 (Composition API), TypeScript, Monaco Editor, shadcn-vue + UnoCSS (styling).

**Key Directories**:

- `src/` - Vue frontend application
- `src-tauri/` - Rust backend (Tauri)
- `src/composables/` - Vue composables (reusable logic)
- `src/views/` - Page-level components
- `src/components/` - Shared UI components
- `src/components/ui/` - shadcn-vue components

---

## Coding/Architecture Guidelines

### Functional TypeScript

- Define functions as `const xxx = (...) => ...`. Prefer **functional decomposition** over OOP.
- **Avoid classes** unless strictly necessary.

### Declarative/Functional Collection Handling

- Replace `for`/`while` loops with `map`, `filter`, `find`, `some`, `every`, `reduce`, `flatMap` (and `sort` when appropriate).
- Favor pipeline-style transformations over step-by-step imperative logic.

### Immutability

- Avoid in-place mutation (`push`, `splice`, mutating objects/arrays, shared mutable state).
- Instead, return new arrays/objects and model changes as explicit state-transform functions (e.g., reducers).

### Pure Functions

- Keep functions small, composable, and side-effect-free where possible.
- If effects are required (I/O, logging), isolate them at the boundaries and keep core logic pure.

### Types

- Prefer `type`/`enum` over `interface` where possible.
- Use `type` when it can fully replace an `interface`.

### Module Boundaries

- Each module should export **only** via its `index.ts`.
- Avoid deep imports (e.g., import from `src/composables/useKeyboardShortcuts` → use `src/composables`).

### Export Discipline

- Only export functions/types/constants that are used outside the module.

### Provider-Agnostic Design

- Keep provider-agnostic abstractions and follow clean separation of concerns.

### Comments and Documentation

- Use as few inline comments as possible.
- Behavior should be clear from tests and naming.

---

## Styling Conventions

- **UnoCSS** for utility-first atomic CSS (loaded via `virtual:uno.css`)
- **shadcn-vue** for UI components (Radix Vue-based, headless)
- Theme tokens via CSS variables in `src/assets/styles/index.css`
- See `uno.config.ts` for UnoCSS presets and theme configuration

---

## Code Quality Tools

- **ESLint**: `npm run lint:check` (check violations), `npm run lint:fix` (auto-fix)
- **TypeScript**: Strict mode enabled (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`)
- **Prettier**: Single quotes, 100 char width, 2-space indent, semicolons, arrow parens `avoid`

---

## Build Commands

```bash
npm install        # Install dependencies
npm run tauri dev  # Compile and run (development)
npm run lint:check # Check ESLint violations
npm run lint:fix   # Auto-fix ESLint issues
npx tsc --noEmit   # TypeScript type check
```
