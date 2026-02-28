# Naive UI and SASS Usage Audit

This document provides a comprehensive audit of Naive UI components, composables, and SASS usage across the DocKit codebase.

## Migration Status

### Batch 1: Atomic Components & Compatibility Layer (Complete)

The shadcn-vue compatibility layer has been created at `src/components/ui/`. The following atomic components are now available:

| Naive UI Component | shadcn-vue Replacement | Status | Documentation |
|--------------------|------------------------|--------|---------------|
| `n-button` | `Button` | ✅ Available | [Migration Guide](./naive-ui-migration-guide.md) |
| `n-input` | `Input` | ✅ Available | [Migration Guide](./naive-ui-migration-guide.md) |
| `n-card` | `Card`, `CardHeader`, `CardTitle`, etc. | ✅ Available | [Migration Guide](./naive-ui-migration-guide.md) |
| `n-alert` | `Alert`, `AlertTitle`, `AlertDescription` | ✅ Available | [Migration Guide](./naive-ui-migration-guide.md) |
| `n-tag` | `Badge` | ✅ Available | [Migration Guide](./naive-ui-migration-guide.md) |

### Batch 2: Complex Components (In Progress)

| Naive UI Component | shadcn-vue Replacement | Status | Documentation |
|--------------------|------------------------|--------|---------------|
| `n-modal` | `Dialog`, `DialogContent`, `DialogHeader`, etc. | ✅ Available | [Migration Guide](./naive-ui-migration-guide.md) |
| `useDialog()` | `AlertDialog`, `AlertDialogContent`, etc. | ✅ Available | [Migration Guide](./naive-ui-migration-guide.md) |
| `n-tabs`, `n-tab-pane` | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | ✅ Available | [Migration Guide](./naive-ui-migration-guide.md) |
| `n-select` | `Select`, `SelectTrigger`, `SelectContent`, `SelectItem` | ✅ Available | [Migration Guide](./naive-ui-migration-guide.md) |
| `n-switch` | `Switch` | ✅ Available | [Migration Guide](./naive-ui-migration-guide.md) |
| `n-dropdown` | `DropdownMenu`, `DropdownMenuItem`, etc. | ✅ Available | [Migration Guide](./naive-ui-migration-guide.md) |
| `n-tooltip` | `Tooltip`, `TooltipTrigger`, `TooltipContent` | ✅ Available | [Migration Guide](./naive-ui-migration-guide.md) |
| `n-popover` | `Popover`, `PopoverTrigger`, `PopoverContent` | ✅ Available | [Migration Guide](./naive-ui-migration-guide.md) |
| `n-scrollbar` | `ScrollArea`, `ScrollBar` | ✅ Available | [Migration Guide](./naive-ui-migration-guide.md) |
| `n-input-number` | `InputNumber` | ✅ Available | [Migration Guide](./naive-ui-migration-guide.md) |
| `n-divider` | `Separator` | ✅ Available | [Migration Guide](./naive-ui-migration-guide.md) |
| `n-data-table` (basic) | `Table`, `TableHeader`, `TableRow`, `TableCell` | ✅ Available | [Migration Guide](./naive-ui-migration-guide.md) |
| - | `Label` | ✅ Available | [Migration Guide](./naive-ui-migration-guide.md) |

### Components Scheduled for Future Batches

| Component | Batch | Notes |
|-----------|-------|-------|
| `n-form`, `n-form-item` | Batch 2 (remaining) | Complex form validation with vee-validate |
| `n-data-table` (advanced) | Batch 3 | Sorting, filtering, pagination |
| Provider components | Batch 4 | `n-config-provider`, `n-message-provider`, etc. |

---

## Summary

### Naive UI Components Used (Auto-Imported via NaiveUiResolver)

| Component | Usage Count | Notes |
|-----------|-------------|-------|
| n-icon | 82 | Icon display |
| n-form-item | 80 | Form field wrapper |
| n-button | 77 | Button elements |
| n-grid-item | 65 | Grid layout item |
| n-input | 55 | Text input fields |
| n-card | 46 | Card containers |
| n-select | 21 | Dropdown select |
| n-input-number | 21 | Numeric input |
| n-grid | 21 | Grid layout container |
| n-tab-pane | 20 | Tab content panel |
| n-form | 20 | Form container |
| n-modal | 16 | Modal dialogs |
| n-alert | 15 | Alert messages |
| n-switch | 13 | Toggle switch |
| n-tag | 8 | Tag labels |
| n-popover | 8 | Popover tooltips |
| n-form-item-row | 8 | Form row wrapper |
| n-tabs | 7 | Tab container |
| n-divider | 7 | Section divider |
| n-radio | 6 | Radio buttons |
| n-infinite-scroll | 6 | Infinite scrolling |
| n-gi | 6 | Grid item shorthand |
| n-data-table | 6 | Data table |
| n-progress | 5 | Progress bar |
| n-empty | 5 | Empty state |
| n-scrollbar | 4 | Custom scrollbar |
| n-text | 3 | Text element |
| n-split | 3 | Split pane |
| n-spin | 3 | Loading spinner |
| n-result | 3 | Result page |
| n-float-button | 3 | Floating action button |
| n-dropdown | 3 | Dropdown menu |
| n-collapse-item | 3 | Collapse panel item |
| n-collapse | 3 | Collapse container |
| n-checkbox | 3 | Checkbox input |
| n-tooltip | 2 | Tooltip |
| n-space | 2 | Space layout |
| n-radio-group | 2 | Radio button group |
| n-input-group | 2 | Input grouping |
| n-breadcrumb-item | 2 | Breadcrumb item |
| n-notification-provider | 1 | Notification context |
| n-message-provider | 1 | Message context |
| n-loading-bar-provider | 1 | Loading bar context |
| n-input-group-label | 1 | Input group label |
| n-dynamic-tags | 1 | Dynamic tag input |
| n-dialog-provider | 1 | Dialog context |
| n-config-provider | 1 | Theme/config provider |
| n-button-group | 1 | Button grouping |
| n-breadcrumb | 1 | Breadcrumb navigation |

### Naive UI Composables (Auto-Imported)

| Composable | Files Using | Usage Type |
|------------|-------------|------------|
| useDialog | 12 files | Confirmation/warning dialogs |
| useMessage | 26 files | Success/error/warning messages |
| useLoadingBar | 2 files | Page loading indicator |
| useNotification | 0 files (configured but unused) | N/A |

### Naive UI Direct Imports

| Import | File | Purpose |
|--------|------|---------|
| `darkTheme, dateEnUS, dateZhCN, enUS, zhCN` | AppProvider.vue | Theme and locale configuration |
| `FormRules, FormValidationError, FormItemRule` | Multiple form components | Form validation types |
| `FormInst` | create-index-modal.vue, modify-index-modal.vue | Form instance type |
| `DataTableColumn, PaginationProps` | result-panel.vue | Table column/pagination types |
| `NButton, NIcon, NTag, NInput, NDropdown` | Various components | Render function usage |

---

## Detailed File-by-File Audit

### Global Configuration

#### src/components/AppProvider.vue
- **Naive UI Components**: `n-config-provider`, `n-loading-bar-provider`, `n-dialog-provider`, `n-notification-provider`, `n-message-provider`
- **Direct Imports**: `darkTheme, dateEnUS, dateZhCN, enUS, zhCN` from `naive-ui`
- **Custom Theme**: Uses `naiveThemeOverrides` from `../assets/theme/naive-theme-overrides`
- **Purpose**: Root provider for Naive UI theming and global services

### Components

#### src/components/tool-bar.vue
- **Composables**: `useDialog`, `useMessage`
- **SCSS**: Scoped styles
- **Components**: `n-button`, `n-dropdown`, `n-popover`, `n-select`, `n-icon`

#### src/components/path-breadcrumb.vue
- **Composables**: `useMessage`
- **SCSS**: Scoped styles
- **Components**: `n-breadcrumb`, `n-breadcrumb-item`, `n-icon`, `n-button`

#### src/components/VersionDetect.vue
- **SCSS**: Scoped styles
- **Components**: `n-modal`, `n-card`, `n-button`

#### src/components/markdown-render.vue
- **SCSS**: Scoped styles (no Naive UI components)

### Views

#### src/views/connect/index.vue
- **Composables**: `useDialog`, `useMessage`
- **SCSS**: Scoped styles with `:deep()` targeting Naive UI components
- **Components**: `n-tabs`, `n-tab-pane`

#### src/views/connect/components/connect-list.vue
- **Direct Imports**: `NDropdown, NIcon, useDialog, useMessage` from `naive-ui`
- **SCSS**: Scoped styles
- **Components**: `n-scrollbar`, `n-empty`, `n-infinite-scroll`, `n-dropdown`, `n-icon`

#### src/views/connect/components/es-connect-dialog.vue
- **Direct Imports**: `FormItemRule, FormRules, FormValidationError` from `naive-ui`
- **SCSS**: Scoped styles with `:deep()`
- **Components**: `n-modal`, `n-card`, `n-form`, `n-form-item`, `n-input`, `n-button`, `n-switch`, `n-select`, `n-divider`, `n-collapse`, `n-collapse-item`

#### src/views/connect/components/dynamodb-connect-dialog.vue
- **Components**: `n-modal`, `n-card`, `n-form`, `n-form-item`, `n-input`, `n-button`, `n-select`

#### src/views/connect/components/floating-menu.vue
- **SCSS**: Scoped styles
- **Components**: `n-float-button`, `n-icon`

#### src/views/connect/components/connecting-modal.vue
- **SCSS**: Scoped styles
- **Components**: `n-modal`, `n-spin`

#### src/views/manage/index.vue
- **Composables**: `useMessage`
- **SCSS**: Scoped styles
- **Components**: `n-empty`

#### src/views/manage/components/index-manage.vue
- **Direct Imports**: `NButton, NDropdown, NIcon, NTag, NInput` (for render functions)
- **Composables**: `useDialog`, `useMessage`
- **SCSS**: Scoped styles with `:deep()`
- **Components**: `n-data-table`, `n-scrollbar`

#### src/views/manage/components/dynamo-table-manage.vue
- **Direct Imports**: `NTag, NButton, NIcon` (for render functions)
- **Composables**: `useDialog`, `useMessage`
- **SCSS**: Scoped styles with `:deep()`
- **Components**: `n-data-table`, `n-scrollbar`

#### src/views/manage/components/shard-manage.vue
- **Direct Imports**: `NButton, NIcon, NInput, NTag` (for render functions)
- **Composables**: `useDialog`, `useMessage`
- **SCSS**: Scoped styles with `:deep()`
- **Components**: `n-data-table`, `n-scrollbar`

#### src/views/manage/components/node-state.vue
- **Composables**: `useMessage`
- **SCSS**: Scoped styles with `:deep()`
- **Components**: `n-data-table`, `n-scrollbar`

#### src/views/manage/components/cluster-state.vue
- **SCSS**: Scoped styles with `:deep()`
- **Components**: `n-grid`, `n-grid-item`, `n-card`, `n-scrollbar`, `n-progress`

#### src/views/manage/components/index-dialog.vue
- **Direct Imports**: `FormRules, FormValidationError, NButton, NIcon, FormItemRule`
- **SCSS**: Scoped styles
- **Components**: `n-modal`, `n-card`, `n-form`, `n-form-item`, `n-input`, `n-input-number`, `n-button`, `n-grid`, `n-grid-item`, `n-divider`

#### src/views/manage/components/alias-dialog.vue
- **Direct Imports**: `FormRules, FormValidationError, NButton, NIcon, FormItemRule`
- **Composables**: `useDialog`, `useMessage`
- **SCSS**: Scoped styles
- **Components**: `n-modal`, `n-card`, `n-form`, `n-form-item`, `n-input`, `n-button`, `n-grid`, `n-grid-item`, `n-dynamic-tags`

#### src/views/manage/components/switch-alias-dialog.vue
- **Direct Imports**: `FormRules, FormValidationError, NButton, NIcon`
- **Composables**: `useDialog`, `useMessage`
- **SCSS**: Scoped styles
- **Components**: `n-modal`, `n-card`, `n-form`, `n-form-item`, `n-select`, `n-button`

#### src/views/manage/components/template-dialog.vue
- **Direct Imports**: `FormRules, FormValidationError, NButton, NIcon, FormItemRule`
- **Composables**: `useDialog`, `useMessage`
- **SCSS**: Scoped styles
- **Components**: `n-modal`, `n-card`, `n-form`, `n-form-item`, `n-input`, `n-input-number`, `n-button`, `n-grid`, `n-grid-item`, `n-divider`

#### src/views/manage/components/create-index-modal.vue
- **Direct Imports**: `type FormInst, FormRules`
- **Components**: `n-modal`, `n-card`, `n-form`, `n-form-item`, `n-input`, `n-input-number`, `n-button`, `n-grid`, `n-grid-item`

#### src/views/manage/components/modify-index-modal.vue
- **Direct Imports**: `type FormInst, FormRules`
- **Components**: `n-modal`, `n-card`, `n-form`, `n-form-item`, `n-input`, `n-input-number`, `n-button`, `n-grid`, `n-grid-item`

#### src/views/manage/components/table-settings-modal.vue
- **Components**: `n-modal`, `n-card`, `n-form`, `n-form-item`, `n-input-number`, `n-button`, `n-select`

#### src/views/editor/es-editor/index.vue
- **Direct Imports**: `useMessage, useLoadingBar`
- **SCSS**: Scoped styles
- **Components**: `n-split`, `n-tabs`, `n-tab-pane`, `n-scrollbar`

#### src/views/editor/dynamo-editor/index.vue
- **SCSS**: Scoped styles
- **Components**: `n-tabs`, `n-tab-pane`

#### src/views/editor/dynamo-editor/components/sql-editor.vue
- **Direct Imports**: `useMessage, useLoadingBar`
- **SCSS**: Scoped styles
- **Components**: `n-split`, `n-scrollbar`, `n-tabs`, `n-tab-pane`

#### src/views/editor/dynamo-editor/components/ui-editor.vue
- **Direct Imports**: `FormItemRule, FormRules, FormValidationError`
- **Composables**: `useMessage`, `useLoadingBar`
- **SCSS**: Scoped styles with `:deep()`
- **Components**: `n-scrollbar`, `n-form`, `n-form-item`, `n-grid`, `n-grid-item`, `n-input`, `n-input-number`, `n-select`, `n-button`, `n-tabs`, `n-tab-pane`, `n-card`, `n-icon`

#### src/views/editor/dynamo-editor/components/result-panel.vue
- **Direct Imports**: `NButton, NIcon`, `type DataTableColumn, PaginationProps`
- **SCSS**: Scoped styles with `:deep()`
- **Components**: `n-data-table`, `n-icon`

#### src/views/editor/dynamo-editor/components/create-item.vue
- **Direct Imports**: `FormValidationError`
- **Composables**: `useMessage`, `useDialog`
- **SCSS**: Scoped styles
- **Components**: `n-modal`, `n-form`, `n-form-item`, `n-form-item-row`, `n-input`, `n-input-number`, `n-select`, `n-button`, `n-card`, `n-icon`, `n-divider`, `n-grid`, `n-grid-item`, `n-checkbox`, `n-alert`

#### src/views/editor/dynamo-editor/components/edit-item.vue
- **Direct Imports**: `FormValidationError`
- **SCSS**: Scoped styles
- **Components**: `n-modal`, `n-form`, `n-form-item`, `n-form-item-row`, `n-input`, `n-input-number`, `n-select`, `n-button`, `n-card`, `n-icon`, `n-divider`, `n-grid`, `n-grid-item`, `n-checkbox`, `n-alert`

#### src/views/file/index.vue
- **SCSS**: Scoped styles
- **Components**: (child components)

#### src/views/file/components/tool-bar.vue
- **SCSS**: Scoped styles
- **Components**: `n-button`, `n-icon`, `n-popover`

#### src/views/file/components/new-file-dialog.vue
- **Direct Imports**: `FormRules, FormValidationError`
- **Composables**: `useMessage`
- **SCSS**: Scoped styles
- **Components**: `n-modal`, `n-card`, `n-form`, `n-form-item`, `n-input`, `n-button`

#### src/views/file/components/file-list.vue
- **Composables**: `useDialog`, `useMessage`
- **SCSS**: Scoped styles with `:deep()`
- **Components**: `n-scrollbar`, `n-empty`, `n-infinite-scroll`, `n-icon`

#### src/views/setting/index.vue
- **SCSS**: Scoped styles with `:deep()`
- **Components**: `n-tabs`, `n-tab-pane`

#### src/views/setting/components/basic.vue
- **SCSS**: Scoped styles
- **Components**: `n-form`, `n-form-item`, `n-select`, `n-radio-group`, `n-radio`

#### src/views/setting/components/editor.vue
- **SCSS**: Scoped styles
- **Components**: `n-form`, `n-form-item`, `n-input-number`

#### src/views/setting/components/aigc.vue
- **Direct Imports**: `useMessage`
- **SCSS**: Scoped styles
- **Components**: `n-alert`, `n-form`, `n-form-item`, `n-input`, `n-input-number`, `n-select`, `n-button`, `n-grid`, `n-grid-item`, `n-switch`, `n-text`

#### src/views/setting/components/about-us.vue
- **SCSS**: Scoped styles
- **Components**: (minimal, mainly content display)

#### src/views/import-export/index.vue
- **SCSS**: Scoped styles
- **Components**: `n-tabs`, `n-tab-pane`

#### src/views/import-export/components/import-source-scope.vue
- **Composables**: `useDialog`, `useMessage`
- **SCSS**: Scoped styles
- **Components**: `n-card`, `n-form`, `n-form-item`, `n-input`, `n-button`, `n-select`, `n-icon`, `n-switch`

#### src/views/import-export/components/export-source-scope.vue
- **Composables**: `useDialog`, `useMessage`
- **SCSS**: Scoped styles
- **Components**: `n-card`, `n-form`, `n-form-item`, `n-input`, `n-button`, `n-select`, `n-icon`, `n-switch`

#### src/views/import-export/components/import-target-output.vue
- **Composables**: `useMessage`
- **SCSS**: Scoped styles
- **Components**: `n-card`, `n-form`, `n-form-item`, `n-input`, `n-input-number`, `n-select`, `n-switch`, `n-button`, `n-icon`, `n-grid`, `n-grid-item`, `n-alert`

#### src/views/import-export/components/export-target-output.vue
- **Composables**: `useMessage`
- **SCSS**: Scoped styles
- **Components**: `n-card`, `n-form`, `n-form-item`, `n-button`, `n-icon`, `n-input`

#### src/views/import-export/components/import-execution-panel.vue
- **Composables**: `useDialog`, `useMessage`
- **SCSS**: Scoped styles
- **Components**: `n-card`, `n-button`, `n-icon`, `n-progress`, `n-alert`

#### src/views/import-export/components/export-execution-panel.vue
- **Composables**: `useDialog`, `useMessage`
- **SCSS**: Scoped styles
- **Components**: `n-card`, `n-button`, `n-icon`, `n-progress`, `n-alert`

#### src/views/import-export/components/import-schema-structure.vue
- **SCSS**: Scoped styles
- **Components**: `n-card`, `n-form`, `n-form-item`, `n-input`, `n-input-number`, `n-grid`, `n-grid-item`, `n-divider`, `n-alert`

#### src/views/import-export/components/export-schema-structure.vue
- **Composables**: `useMessage`
- **SCSS**: Scoped styles
- **Components**: `n-card`, `n-form`, `n-form-item`, `n-input-number`, `n-grid`, `n-grid-item`, `n-divider`, `n-alert`

#### src/views/login/index.vue
- **SCSS**: Scoped styles
- **Components**: `n-card`, `n-form`, `n-form-item`, `n-input`, `n-button`

#### src/views/history/index.vue
- **SCSS**: Scoped styles
- **Components**: `n-tabs`, `n-tab-pane`

#### src/views/history/components/history-empty.vue
- **SCSS**: Scoped styles
- **Components**: `n-result`, `n-icon`

### Layout

#### src/layout/index.vue
- **SCSS**: Scoped styles
- **Components**: (wrapper layout)

#### src/layout/components/the-aside.vue
- **SCSS**: Scoped styles
- **Components**: `n-icon`, `n-button`, `n-popover`, `n-tooltip`

#### src/layout/components/chatbot-box.vue
- **SCSS**: Scoped styles with `:deep()`
- **Components**: `n-scrollbar`, `n-spin`, `n-input`, `n-button`, `n-icon`

#### src/layout/components/tool-bar-right.vue
- **Components**: `n-float-button`, `n-icon`, `n-button`

---

## SASS/SCSS Usage

### Global SASS Files

| File | Purpose |
|------|---------|
| `src/assets/styles/theme.scss` | Global CSS variables, theme colors, base styles |
| `src/assets/styles/normalize.css` | CSS reset/normalize |

### Theme Variables (from theme.scss)

```scss
:root {
  --theme-color: #36ad6a;
  --theme-color-hover: #19934e;
  --dange-color: #cd2158;
  --tool-bar-height: 40px;
}

:root[theme='light'] {
  --bg-color: #f5f7f9;
  --bg-color-secondary: #fFfFfF;
  --text-color: #333;
  --border-color: #d1d1d1;
  --gray-color: #999;
  --connect-list-hover-bg: rgba(0, 0, 0, 0.05);
  --card-bg-color: #FFF;
}

:root[theme='dark'] {
  --bg-color: #101014;
  --bg-color-secondary: #1b1b1f;
  --text-color: #f1f1f1;
  --border-color: #363b41;
  --gray-color: #c1c1c1;
  --connect-list-hover-bg: rgba(255, 255, 255, 0.05);
  --card-bg-color: rgb(38, 38, 42);
}
```

### Naive UI Theme Overrides (from naive-theme-overrides.ts)

```ts
export const naiveThemeOverrides = {
  common: {
    primaryColor: '#36ad6a',
    primaryColorHover: '#19934e',
  },
};
```

### Files with Scoped SCSS (50 files)

All Vue components listed in the detailed audit section use scoped SCSS for component-specific styling.

Common patterns in scoped SCSS:
- Use of CSS variables (--bg-color, --text-color, etc.)
- `:deep()` selector for styling Naive UI internal elements
- Flexbox layouts
- Responsive designs

---

## Vite Configuration

### Current Setup (vite.config.ts)

```ts
AutoImport({
  imports: [
    'vue',
    'vue-router',
    {
      'naive-ui': ['useDialog', 'useMessage', 'useNotification', 'useLoadingBar'],
    },
  ],
}),
Components({
  resolvers: [NaiveUiResolver()],
}),
```

### Current Dependencies

**Production:**
- No direct naive-ui runtime dependency (auto-imported)

**Development:**
- `naive-ui: ^2.43.2`
- `sass: ^1.97.1`
- `unplugin-auto-import`
- `unplugin-vue-components` (with NaiveUiResolver)

---

## Migration Notes

### High Priority (Breaking Changes)
1. All provider components (`n-config-provider`, `n-message-provider`, etc.) in `AppProvider.vue`
2. Form validation types (`FormRules`, `FormValidationError`, `FormInst`, `FormItemRule`)
3. Composables (`useDialog`, `useMessage`, `useLoadingBar`)
4. Render function component usage (`NButton`, `NIcon`, `NTag`, `NDropdown`, `NInput`)

### Medium Priority
1. All auto-imported components (47 unique Naive UI components)
2. Theme overrides configuration
3. Locale/i18n configuration

### Lower Priority
1. Scoped SCSS styles (50 files) - mostly CSS variables, will continue to work
2. CSS variables - already compatible with any styling solution

### Unusual Usages
1. **Render function imports**: Several components import Naive UI components for use in render functions (data table columns, custom cell rendering)
2. **Type imports**: Form-related types are imported directly from naive-ui
3. **Theme/locale configuration**: Direct imports for theming system
