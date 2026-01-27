<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { cn } from '@/lib/utils';

interface SplitPaneProps {
  direction?: 'horizontal' | 'vertical';
  size?: number;
  min?: number;
  max?: number;
  class?: string;
}

const props = withDefaults(defineProps<SplitPaneProps>(), {
  direction: 'horizontal',
  size: 0.5,
  min: 0.1,
  max: 0.9,
});

const emit = defineEmits<{
  'update:size': [value: number];
}>();

const containerRef = ref<HTMLElement>();
const isDragging = ref(false);
const currentSize = ref(props.size);

const isHorizontal = computed(() => props.direction === 'horizontal');

const pane1Style = computed(() => {
  const sizePercent = currentSize.value * 100;
  return isHorizontal.value ? { width: `${sizePercent}%` } : { height: `${sizePercent}%` };
});

const pane2Style = computed(() => {
  const sizePercent = (1 - currentSize.value) * 100;
  return isHorizontal.value ? { width: `${sizePercent}%` } : { height: `${sizePercent}%` };
});

const handleMouseDown = () => {
  isDragging.value = true;
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
};

const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging.value || !containerRef.value) return;

  const rect = containerRef.value.getBoundingClientRect();
  let newSize: number;

  if (isHorizontal.value) {
    newSize = (e.clientX - rect.left) / rect.width;
  } else {
    newSize = (e.clientY - rect.top) / rect.height;
  }

  newSize = Math.max(props.min, Math.min(props.max, newSize));
  currentSize.value = newSize;
  emit('update:size', newSize);
};

const handleMouseUp = () => {
  isDragging.value = false;
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
};

onMounted(() => {
  currentSize.value = props.size;
});

onUnmounted(() => {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
});
</script>

<template>
  <div
    ref="containerRef"
    :class="cn('flex h-full w-full', isHorizontal ? 'flex-row' : 'flex-col', props.class)"
  >
    <div :style="pane1Style" class="overflow-auto">
      <slot name="1" />
    </div>
    <div
      :class="
        cn(
          'flex-shrink-0 bg-border hover:bg-primary/20 transition-colors cursor-col-resize',
          isHorizontal ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize',
        )
      "
      @mousedown="handleMouseDown"
    />
    <div :style="pane2Style" class="overflow-auto">
      <slot name="2" />
    </div>
  </div>
</template>
