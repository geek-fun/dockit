<template>
  <span v-if="size === 'dot'" class="pro-badge pro-badge--dot" aria-hidden="true" />
  <span v-else class="pro-badge" :class="`pro-badge--${size}`">
    <Lock class="pro-badge__icon" />
    {{ $t('plan.state.ultimate') }}
  </span>
</template>

<script lang="ts" setup>
import { Lock } from 'lucide-vue-next';

withDefaults(defineProps<{ size?: 'dot' | 'xs' | 'sm' }>(), { size: 'sm' });
</script>

<style scoped>
.pro-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  border: 1px solid hsl(var(--primary) / 0.45);
  background-color: hsl(var(--primary) / 0.08);
  color: hsl(var(--primary));
  font-weight: 600;
  letter-spacing: 0.04em;
  white-space: nowrap;
  flex-shrink: 0;
}

.pro-badge__icon {
  width: 0.75em;
  height: 0.75em;
}

.pro-badge--dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: none;
  background-color: hsl(var(--primary));
  box-shadow: 0 0 0 2px hsl(var(--background));
}

.pro-badge--xs {
  padding: 1px 7px;
  font-size: 9px;
  text-transform: uppercase;
}

.pro-badge--sm {
  padding: 2px 9px;
  font-size: 10.5px;
}
</style>
