<script setup lang="ts">
import { CircleCheck, Loader2 } from 'lucide-vue-next';

withDefaults(
  defineProps<{
    message?: string;
    success?: boolean;
  }>(),
  { message: undefined, success: false },
);
</script>

<template>
  <div
    role="status"
    aria-atomic="true"
    class="feedback-overlay"
    :class="{ 'feedback-overlay-active': message }"
  >
    <div v-if="message" class="feedback-message">
      <CircleCheck v-if="success" class="h-5 w-5 shrink-0 text-primary-action" aria-hidden="true" />
      <Loader2
        v-else
        class="h-5 w-5 shrink-0 text-primary-action motion-safe:animate-spin"
        aria-hidden="true"
      />
      <span>{{ message }}</span>
    </div>
  </div>
</template>

<style scoped>
.feedback-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 0.5rem;
  pointer-events: none;
}

.feedback-overlay-active {
  pointer-events: auto;
  background: hsl(var(--background) / 0.65);
}

.feedback-message {
  display: flex;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.75rem;
  overflow-wrap: anywhere;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  background: hsl(var(--popover));
  color: hsl(var(--popover-foreground));
  font-size: var(--font-size-form);
  font-weight: 500;
}
</style>
