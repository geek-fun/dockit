<template>
  <div class="tree-node" :style="{ paddingLeft: `${depth * 16}px` }">
    <div class="tree-node-row" :class="{ 'tree-node-row--expanded': expanded }" @click="toggle">
      <span v-if="isExpandable" class="tree-toggle">
        <span class="i-carbon-chevron-right h-3 w-3" :class="{ rotated: expanded }" />
      </span>
      <span v-else class="tree-toggle tree-toggle--spacer" />
      <span class="tree-key">{{ label }}:</span>
      <span v-if="!expanded" class="tree-preview">{{ preview }}</span>
    </div>
    <div v-if="expanded && children.length > 0" class="tree-children">
      <TreeNode
        v-for="(child, index) in children"
        :key="index"
        :value="child.value"
        :label="child.label"
        :depth="depth + 1"
      />
    </div>
    <div v-else-if="expanded && !isExpandable" class="tree-leaf-value">
      {{ displayValue }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{
  value: unknown;
  label: string;
  depth: number;
}>();

const expanded = ref(false);

const isExpandable = computed(() => {
  if (props.value === null || props.value === undefined) return false;
  return typeof props.value === 'object';
});

const preview = computed(() => {
  if (Array.isArray(props.value)) return `Array(${props.value.length})`;
  if (typeof props.value === 'object' && props.value !== null) {
    const keys = Object.keys(props.value);
    return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', …' : ''}}`;
  }
  return formatPrimitive(props.value);
});

const displayValue = computed(() => formatPrimitive(props.value));

const children = computed<Array<{ label: string; value: unknown }>>(() => {
  if (Array.isArray(props.value)) {
    return props.value.map((item, index) => ({ label: String(index), value: item }));
  }
  if (typeof props.value === 'object' && props.value !== null) {
    return Object.entries(props.value as Record<string, unknown>).map(([key, val]) => ({
      label: key,
      value: val,
    }));
  }
  return [];
});

const formatPrimitive = (val: unknown): string => {
  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (typeof val === 'string') return `"${val}"`;
  return String(val);
};

const toggle = () => {
  if (isExpandable.value) expanded.value = !expanded.value;
};
</script>

<style scoped>
.tree-node-row {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0;
  cursor: default;
  border-radius: 0.125rem;
}

.tree-node-row:hover {
  background: hsl(var(--muted) / 0.5);
}

.tree-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  flex-shrink: 0;
}

.tree-toggle--spacer {
  visibility: hidden;
}

.tree-toggle .rotated {
  transform: rotate(90deg);
  transition: transform 0.15s;
}

.tree-key {
  color: hsl(var(--primary));
  font-weight: 500;
  flex-shrink: 0;
}

.tree-preview {
  color: hsl(var(--muted-foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-leaf-value {
  padding-left: 1.25rem;
  color: hsl(var(--foreground));
  word-break: break-all;
}

.tree-children {
  border-left: 1px solid hsl(var(--border));
  margin-left: 0.5rem;
}
</style>
