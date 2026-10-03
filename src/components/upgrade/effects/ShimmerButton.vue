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
  background-image: linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(0, 0, 0, 0.1));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    0 10px 24px -10px hsl(var(--primary) / 0.65);
  color: hsl(var(--primary-foreground));
  font-weight: 600;
  cursor: pointer;
  transition:
    filter 0.2s ease,
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.shimmer-btn:hover {
  filter: brightness(1.06) saturate(1.05);
  transform: translateY(-1px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    0 14px 30px -10px hsl(var(--primary) / 0.7);
}

.shimmer-btn:active {
  transform: translateY(1px);
  filter: brightness(0.97);
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

/* Idle = fully static (a repeating sweep on a prominent CTA reads as
   jitter); the sheen performs one sweep per hover instead. */
.shimmer-btn__sheen {
  position: absolute;
  inset: -40%;
  pointer-events: none;
  opacity: 0;
  background: linear-gradient(
    105deg,
    transparent 42%,
    rgba(255, 255, 255, 0.32) 50%,
    transparent 58%
  );
  transform: translateX(-100%);
}

.shimmer-btn:hover .shimmer-btn__sheen,
.shimmer-btn:focus-visible .shimmer-btn__sheen {
  animation: shimmer-slide 0.9s ease-out;
  opacity: 1;
}

[theme='dark'] .shimmer-btn__sheen {
  background: linear-gradient(
    105deg,
    transparent 42%,
    rgba(255, 255, 255, 0.22) 50%,
    transparent 58%
  );
}

@keyframes shimmer-slide {
  from {
    transform: translateX(-100%);
    opacity: 1;
  }
  85% {
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .shimmer-btn__sheen {
    display: none;
  }
}
</style>
