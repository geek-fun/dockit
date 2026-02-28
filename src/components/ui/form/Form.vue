<script setup lang="ts">
import { provide, reactive } from 'vue';
import { cn } from '@/lib/utils';

interface FormProps {
  class?: string;
}

defineProps<FormProps>();

const formState = reactive({
  isSubmitting: false,
});

provide('form-state', formState);
</script>

<template>
  <form :class="cn('space-y-4', $props.class)">
    <slot />
  </form>
</template>
