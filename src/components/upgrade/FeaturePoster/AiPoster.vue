<template>
  <div class="poster" aria-hidden="true">
    <div class="poster__bar">
      <span class="poster__dot" />
      <span class="poster__dot" />
      <span class="poster__dot" />
      <span class="poster__tab">{{ $t('dataStudio.title') }}</span>
      <span class="poster__chip">gpt-5-mini</span>
    </div>

    <div class="poster__body">
      <div class="poster__bubble">
        <p>{{ $t('plan.poster.ai.question') }}</p>
      </div>

      <div class="poster__agent">
        <div class="poster__tool">
          <Terminal class="poster__tool-icon" />
          <span>search_index · payment_orders</span>
          <ChevronDown class="poster__tool-chevron" />
        </div>
        <pre class="poster__code">
GET /payment_orders/_search
{
  "query": { "bool": { "filter": [
    { "range": { "paid_at": { "gte": "now-7d" } } },
    { "term":   { "status": "failed" } }
  ] } }
}</pre
        >
        <div class="poster__table">
          <div class="poster__tr poster__tr--head">
            <span>_id</span>
            <span>amount</span>
            <span>paid_at</span>
          </div>
          <div class="poster__tr">
            <span>ORD-88231</span>
            <span>$129.00</span>
            <span>2026-09-21</span>
          </div>
          <div class="poster__tr">
            <span>ORD-88197</span>
            <span>$49.50</span>
            <span>2026-09-22</span>
          </div>
          <div class="poster__tr">
            <span>ORD-88064</span>
            <span>$312.25</span>
            <span>2026-09-25</span>
          </div>
        </div>
        <p class="poster__meta">{{ $t('plan.poster.ai.summary') }}</p>
      </div>
    </div>

    <ProgressiveBlur />
    <div class="poster__lock">
      <Lock class="poster__lock-icon" />
      {{ $t('plan.gate.lockedChip') }}
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ChevronDown, Lock, Terminal } from 'lucide-vue-next';
import { ProgressiveBlur } from '../effects';
</script>

<style scoped>
.poster {
  position: relative;
  overflow: hidden;
  border-radius: 14px;
  border: 1px solid hsl(var(--border));
  background-color: hsl(var(--card));
  box-shadow: 0 10px 34px -12px rgba(0, 0, 0, 0.18);
}

.poster__bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 12px;
  border-bottom: 1px solid hsl(var(--border));
  background-color: hsl(var(--muted) / 0.5);
}

.poster__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: hsl(var(--border));
}

.poster__tab {
  margin-left: 8px;
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid hsl(var(--border));
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: hsl(var(--muted-foreground));
}

.poster__chip {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid hsl(var(--primary) / 0.35);
  color: hsl(var(--primary));
  font-size: 10px;
  font-weight: 600;
}

.poster__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
}

.poster__bubble {
  align-self: flex-end;
  max-width: 78%;
  padding: 8px 12px;
  border-radius: 12px 12px 3px 12px;
  background-color: hsl(var(--primary) / 0.12);
  border: 1px solid hsl(var(--primary) / 0.22);
  font-size: 12px;
  color: hsl(var(--foreground));
}

.poster__agent {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 92%;
}

.poster__tool {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  border-radius: 8px;
  border: 1px solid hsl(var(--border));
  background-color: hsl(var(--muted) / 0.4);
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.poster__tool-icon,
.poster__tool-chevron {
  width: 12px;
  height: 12px;
}

.poster__tool-chevron {
  margin-left: auto;
}

.poster__code {
  margin: 0;
  padding: 9px 11px;
  border-radius: 8px;
  border: 1px solid hsl(var(--border));
  background-color: hsl(var(--muted) / 0.55);
  font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
  line-height: 1.55;
  color: hsl(var(--foreground));
  overflow: hidden;
}

.poster__table {
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  overflow: hidden;
  font-size: 11px;
}

.poster__tr {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr 1fr;
}

.poster__tr > span {
  padding: 5px 9px;
  color: hsl(var(--muted-foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.poster__tr--head > span {
  background-color: hsl(var(--muted) / 0.6);
  font-weight: 600;
  color: hsl(var(--foreground));
}

.poster__tr + .poster__tr > span {
  border-top: 1px solid hsl(var(--border));
}

.poster__meta {
  font-size: 10.5px;
  color: hsl(var(--muted-foreground));
}

.poster__lock {
  position: absolute;
  left: 50%;
  bottom: 60px;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 13px;
  border-radius: 999px;
  border: 1px solid hsl(var(--primary) / 0.4);
  background-color: hsl(var(--background) / 0.75);
  backdrop-filter: blur(8px);
  font-size: 11.5px;
  font-weight: 600;
  color: hsl(var(--primary));
}

.poster__lock-icon {
  width: 12px;
  height: 12px;
}

/* UpgradeDialog sets data-poster-context='dialog' and shows the poster in a
   narrow decorative column — hide the detail rows and lock chip there. */
[data-poster-context='dialog'] .poster__table,
[data-poster-context='dialog'] .poster__meta,
[data-poster-context='dialog'] .poster__lock {
  display: none;
}
</style>
