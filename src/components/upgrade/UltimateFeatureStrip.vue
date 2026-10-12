<template>
  <div
    class="ultimate-strip"
    role="button"
    tabindex="0"
    @click="open(UPGRADE_URL)"
    @keydown.enter="open(UPGRADE_URL)"
  >
    <ProBadge size="xs" />
    <span class="text-sm text-muted-foreground">{{ label }}</span>
    <span class="text-sm text-primary font-medium shrink-0">{{ $t('plan.upgrade.cta') }}</span>
  </div>
</template>

<script setup lang="ts">
import { open } from '@tauri-apps/plugin-shell';
import { UPGRADE_URL } from '../../common';
import ProBadge from './ProBadge.vue';

defineProps<{ label: string }>();
</script>

<style scoped>
.ultimate-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px dashed var(--border);
  border-radius: 8px;
  cursor: pointer;
}
.ultimate-strip:hover {
  background: var(--accent);
}
</style>
