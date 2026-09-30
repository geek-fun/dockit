<template>
  <button class="shimmer-btn" :class="`shimmer-btn--${size}`" type="button">
    <span class="shimmer-btn__sheen" aria-hidden="true" />
    <span class="shimmer-btn__label">
      <slot />
    </span>
  </button>
</template>

<script lang="ts" setup>
withDefaults(defineProps<{ size?: 'sm' | 'lg' }>(), { size: 'lg' });
</script>

<style scoped>
.shimmer-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: none;
  border-radius: calc(var(--radius) + 2px);
  background-color: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  font-weight: 600;
  cursor: pointer;
  transition:
    filter 0.2s ease,
    transform 0.2s ease;
}

.shimmer-btn:hover {
  filter: brightness(1.08);
}

.shimmer-btn:active {
  transform: translateY(1px);
}

.shimmer-btn:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}

.shimmer-btn:disabled {
  filter: grayscale(0.4) brightness(0.85);
  cursor: not-allowed;
}

.shimmer-btn--lg {
  height: 42px;
  padding: 0 26px;
  font-size: 14px;
}

.shimmer-btn--sm {
  height: 34px;
  padding: 0 18px;
  font-size: 13px;
}

.shimmer-btn__label {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.shimmer-btn__sheen {
  position: absolute;
  inset: -40%;
  pointer-events: none;
  background: linear-gradient(
    105deg,
    transparent 42%,
    rgba(255, 255, 255, 0.32) 50%,
    transparent 58%
  );
  transform: translateX(-70%) rotate(0.001deg);
  animation: shimmer-slide 3.4s ease-in-out infinite;
}

:global([theme='dark']) .shimmer-btn__sheen {
  background: linear-gradient(
    105deg,
    transparent 42%,
    rgba(255, 255, 255, 0.22) 50%,
    transparent 58%
  );
}

@keyframes shimmer-slide {
  0%,
  55% {
    transform: translateX(-70%);
  }
  85%,
  100% {
    transform: translateX(70%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .shimmer-btn__sheen {
    animation: none;
    opacity: 0;
  }
}
</style>
