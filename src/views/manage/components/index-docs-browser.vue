<template>
  <Dialog v-if="!embedded" :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="docs-browser-dialog max-h-[90vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>
          {{ $t('manage.docs.title') }}
          <span v-if="indexName" class="docs-index-name">{{ indexName }}</span>
        </DialogTitle>
      </DialogHeader>
      <DocsBrowserBody :index-name="indexName" :connection="connection" :active="open" />
    </DialogContent>
  </Dialog>

  <div v-else class="docs-browser-embedded">
    <DocsBrowserBody
      :index-name="indexName"
      :connection="connection"
      :active="Boolean(connection && indexName)"
      :enable-search-filters="enableSearchFilters"
      embedded
    />
  </div>
</template>

<script setup lang="ts">
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import DocsBrowserBody from './index-docs-browser-body.vue';
import type { SearchConnection } from '@/store';

withDefaults(
  defineProps<{
    open?: boolean;
    connection: SearchConnection | undefined;
    indexName: string;
    embedded?: boolean;
    enableSearchFilters?: boolean;
  }>(),
  {
    open: false,
    embedded: false,
    enableSearchFilters: false,
  },
);

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();
</script>

<style scoped>
.docs-browser-dialog {
  width: min(96vw, 1100px);
  max-width: 1100px;
}

.docs-index-name {
  margin-left: 0.5rem;
  font-weight: 400;
  color: hsl(var(--muted-foreground));
  font-size: 0.875rem;
}

.docs-browser-embedded {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: 100%;
}
</style>
