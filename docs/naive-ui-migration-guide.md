# Naive UI to shadcn-vue Migration Guide

This document describes the compatibility layer and migration patterns for transitioning from Naive UI components to shadcn-vue components.

## Overview

The DocKit application is undergoing a phased migration from Naive UI to shadcn-vue. This document covers Batch 1, which focuses on atomic/simple components.

## Compatibility Layer

The compatibility layer is located at `src/components/ui/` and contains shadcn-vue components that can be used alongside existing Naive UI components during the migration period.

### Directory Structure

```
src/components/ui/
├── index.ts           # Main export file for all UI components
├── button/
│   ├── Button.vue     # shadcn-vue Button component
│   └── index.ts       # Button variants and exports
├── input/
│   ├── Input.vue      # shadcn-vue Input component
│   └── index.ts       # Input exports
├── card/
│   ├── Card.vue       # shadcn-vue Card component
│   ├── CardHeader.vue
│   ├── CardTitle.vue
│   ├── CardDescription.vue
│   ├── CardContent.vue
│   ├── CardFooter.vue
│   └── index.ts       # Card component exports
├── alert/
│   ├── Alert.vue      # shadcn-vue Alert component
│   ├── AlertTitle.vue
│   ├── AlertDescription.vue
│   └── index.ts       # Alert variants and exports
└── badge/
    ├── Badge.vue      # shadcn-vue Badge component
    └── index.ts       # Badge variants and exports
```

## Usage Patterns

### Button Component

**Before (Naive UI):**
```vue
<n-button type="primary" @click="handleClick">Click me</n-button>
<n-button type="error" secondary>Danger</n-button>
<n-button quaternary size="small">Ghost</n-button>
```

**After (shadcn-vue):**
```vue
<script setup>
import { Button } from '@/components/ui/button';
</script>

<template>
  <Button @click="handleClick">Click me</Button>
  <Button variant="destructive">Danger</Button>
  <Button variant="ghost" size="sm">Ghost</Button>
</template>
```

**Variant Mapping:**
| Naive UI | shadcn-vue |
|----------|------------|
| `type="primary"` | `variant="default"` (primary) |
| `type="error"` | `variant="destructive"` |
| `secondary` | `variant="secondary"` |
| `tertiary` / `quaternary` | `variant="ghost"` |
| `text` | `variant="link"` |
| `dashed` | `variant="outline"` |

**Size Mapping:**
| Naive UI | shadcn-vue |
|----------|------------|
| `size="tiny"` | `size="xs"` |
| `size="small"` | `size="sm"` |
| `size="medium"` | `size="default"` |
| `size="large"` | `size="lg"` |

### Input Component

**Before (Naive UI):**
```vue
<n-input v-model:value="inputValue" placeholder="Enter text" />
<n-input v-model:value="password" type="password" show-password-on="click" />
```

**After (shadcn-vue):**
```vue
<script setup>
import { Input } from '@/components/ui/input';
</script>

<template>
  <Input v-model="inputValue" placeholder="Enter text" />
  <Input v-model="password" type="password" />
</template>
```

**Note:** For password visibility toggle, you may need to implement a custom wrapper or use a different pattern.

### Card Component

**Before (Naive UI):**
```vue
<n-card title="Card Title" :bordered="true">
  <template #header-extra>Extra content</template>
  Card content here
  <template #footer>Footer content</template>
</n-card>
```

**After (shadcn-vue):**
```vue
<script setup>
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Card Title</CardTitle>
      <CardDescription>Extra content</CardDescription>
    </CardHeader>
    <CardContent>
      Card content here
    </CardContent>
    <CardFooter>
      Footer content
    </CardFooter>
  </Card>
</template>
```

### Alert Component

**Before (Naive UI):**
```vue
<n-alert type="success" title="Success">
  Operation completed successfully.
</n-alert>
<n-alert type="error" title="Error">
  Something went wrong.
</n-alert>
<n-alert type="warning" title="Warning">
  Please be careful.
</n-alert>
<n-alert type="info" title="Info">
  Here's some information.
</n-alert>
```

**After (shadcn-vue):**
```vue
<script setup>
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
</script>

<template>
  <Alert variant="success">
    <AlertTitle>Success</AlertTitle>
    <AlertDescription>Operation completed successfully.</AlertDescription>
  </Alert>
  <Alert variant="destructive">
    <AlertTitle>Error</AlertTitle>
    <AlertDescription>Something went wrong.</AlertDescription>
  </Alert>
  <Alert variant="warning">
    <AlertTitle>Warning</AlertTitle>
    <AlertDescription>Please be careful.</AlertDescription>
  </Alert>
  <Alert variant="info">
    <AlertTitle>Info</AlertTitle>
    <AlertDescription>Here's some information.</AlertDescription>
  </Alert>
</template>
```

**Variant Mapping:**
| Naive UI | shadcn-vue |
|----------|------------|
| `type="success"` | `variant="success"` |
| `type="error"` | `variant="destructive"` |
| `type="warning"` | `variant="warning"` |
| `type="info"` | `variant="info"` |
| `type="default"` | `variant="default"` |

### Badge Component

**Before (Naive UI - NTag):**
```vue
<n-tag type="success">Success</n-tag>
<n-tag type="error">Error</n-tag>
<n-tag type="warning">Warning</n-tag>
<n-tag type="info">Info</n-tag>
```

**After (shadcn-vue):**
```vue
<script setup>
import { Badge } from '@/components/ui/badge';
</script>

<template>
  <Badge variant="success">Success</Badge>
  <Badge variant="destructive">Error</Badge>
  <Badge variant="warning">Warning</Badge>
  <Badge variant="info">Info</Badge>
</template>
```

## Migration Status

See `docs/naive-ui-sass-audit.md` for detailed migration status per component.

### Batch 1 Components (Atomic)

| Component | Naive UI | shadcn-vue | Status |
|-----------|----------|------------|--------|
| Button | `n-button` | `Button` | ✅ Available |
| Input | `n-input` | `Input` | ✅ Available |
| Card | `n-card` | `Card` | ✅ Available |
| Alert | `n-alert` | `Alert` | ✅ Available |
| Badge/Tag | `n-tag` | `Badge` | ✅ Available |

### Components Still Using Naive UI (Temporary Exceptions)

The following components are complex and will be migrated in later batches:

- `n-form` / `n-form-item` - Complex form validation (Batch 2)
- `n-select` - Complex dropdown with search (Batch 2)
- `n-modal` - Modal dialogs (Batch 2)
- `n-data-table` - Complex data table (Batch 3)
- `n-tabs` / `n-tab-pane` - Tab navigation (Batch 2)
- `n-dropdown` - Dropdown menus (Batch 2)
- Provider components (`n-config-provider`, etc.) - Infrastructure (Batch 4)

## Best Practices

1. **Explicit Imports**: Always use explicit imports for shadcn-vue components rather than relying on auto-import:
   ```typescript
   import { Button } from '@/components/ui/button';
   ```

2. **Gradual Migration**: Migrate one component at a time within a file. Test thoroughly after each change.

3. **Consistent Styling**: The shadcn-vue components use the same CSS variables as the DocKit theme, ensuring visual consistency.

4. **Type Safety**: All shadcn-vue components are fully typed. Use the exported variant types for type-safe props:
   ```typescript
   import { type ButtonVariants } from '@/components/ui/button';
   ```

5. **Testing**: After migrating a component, verify:
   - Visual appearance matches the original
   - All interactions work as expected
   - Accessibility features are preserved

## Utility Functions

The `cn()` utility function from `@/lib/utils` is used for merging Tailwind CSS classes:

```typescript
import { cn } from '@/lib/utils';

// Merge classes conditionally
const className = cn(
  'base-class',
  isActive && 'active-class',
  props.class
);
```
