<script setup lang="ts">
import { computed } from 'vue'

/**
 * Deterministic default avatar for accounts without a custom one.
 * The username's first letter maps to one of five designed gradient
 * themes (A–E, F–J, K–O, P–T, U–Z), so the same letter always renders
 * the same avatar — no backend storage involved.
 */
const props = withDefaults(defineProps<{ seed?: string }>(), { seed: '' })

// Letter index inside a-z → bucket table (5 buckets). Non-letters keep
// their char code % — still deterministic, mapped through the same table
// via modulo so any seed gets a valid bucket.
const BUCKETS = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4]

const initial = computed(() => {
  const first = (props.seed || '?').trim().charAt(0)
  return first.toUpperCase() === first ? first : first.toUpperCase()
})

const lowerCode = computed(() => {
  const c = (props.seed || '?').trim().charAt(0).toLowerCase()
  return c.charCodeAt(0)
})

const bucket = computed(() => {
  const i = lowerCode.value - 97
  return i >= 0 && i < 26 ? BUCKETS[i] : lowerCode.value % 5
})

const THEMES = [
  { from: 'hsl(30 93% 55%)', to: 'hsl(15 90% 40%)' }, // ember orange (brand)
  { from: 'hsl(258 60% 60%)', to: 'hsl(258 55% 38%)' }, // violet
  { from: 'hsl(172 55% 42%)', to: 'hsl(184 60% 28%)' }, // teal
  { from: 'hsl(340 70% 56%)', to: 'hsl(340 65% 38%)' }, // rose
  { from: 'hsl(215 45% 52%)', to: 'hsl(215 45% 32%)' }, // slate blue
] as const

const theme = computed(() => THEMES[bucket.value])
const gradientId = `dfg-${Math.random().toString(36).slice(2, 8)}-${bucket.value}`
</script>

<template>
  <svg
    viewBox="0 0 64 64"
    class="block h-full w-full"
    role="img"
    :aria-label="initial"
  >
    <defs>
      <linearGradient :id="gradientId" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" :stop-color="theme.from" />
        <stop offset="100%" :stop-color="theme.to" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" :fill="`url(#${gradientId})`" />
    <circle cx="52" cy="10" r="22" fill="rgba(255, 255, 255, 0.14)" />
    <circle cx="6" cy="58" r="14" fill="rgba(255, 255, 255, 0.1)" />
    <text
      x="32"
      y="32"
      text-anchor="middle"
      dominant-baseline="central"
      fill="#ffffff"
      font-weight="700"
      font-size="26"
      font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
      style="paint-order: stroke"
    >
      {{ initial }}
    </text>
  </svg>
</template>
