<template>
  <div class="poster" aria-hidden="true">
    <div class="poster__bar">
      <span class="poster__dot" />
      <span class="poster__dot" />
      <span class="poster__dot" />
      <span class="poster__pill">{{ $t('dataStudio.title') }}</span>
      <span class="poster__model">gpt-5-mini</span>
    </div>

    <div class="poster__chat">
      <div class="p-user">
        <p>{{ $t('plan.poster.ai.question') }}</p>
      </div>

      <div class="p-timeline">
        <div class="p-iter">
          <Repeat class="p-ic" />
          <span>{{ $t('dataStudio.agent.message.iterationLabel', { n: 1 }) }}</span>
        </div>
        <div class="p-row p-row--think">
          <Lightbulb class="p-ic p-ic--pulse" />
          <span class="p-row-label">{{ $t('dataStudio.agent.message.thinking') }}</span>
          <span class="p-dots">
            <i />
            <i />
            <i />
          </span>
          <span class="p-badge">
            {{ $t('dataStudio.agent.message.thinkingDuration', { s: '2.1' }) }}
          </span>
        </div>
        <div class="p-row p-row--tool">
          <Terminal class="p-ic" />
          <span class="p-tool-name">search_index</span>
          <span class="p-row-label">{{ $t('plan.poster.ai.toolVerb') }}</span>
          <RefreshCw class="p-spin" />
          <Check class="p-check" />
          <span class="p-chip">3 hits · 12 ms</span>
        </div>
      </div>

      <div class="p-answer">
        <p class="p-answer-text">{{ $t('plan.poster.ai.answer') }}</p>
        <pre class="p-code">
GET /payment_orders/_search
{
  "query": { "bool": { "filter": [
    { "range": { "paid_at": { "gte": "now-7d" } } },
    { "term":   { "status": "failed" } }
  ] } }
}</pre
        >
        <div class="p-table">
          <div class="p-tr p-tr--head">
            <span>_id</span>
            <span>amount</span>
            <span>paid_at</span>
          </div>
          <div class="p-tr">
            <span>ORD-88231</span>
            <span>$129.00</span>
            <span>2026-09-21</span>
          </div>
          <div class="p-tr">
            <span>ORD-88197</span>
            <span>$49.50</span>
            <span>2026-09-22</span>
          </div>
          <div class="p-tr">
            <span>ORD-88064</span>
            <span>$312.25</span>
            <span>2026-09-25</span>
          </div>
        </div>
      </div>
    </div>

    <div class="poster__cta">
      <slot name="cta" />
    </div>

    <ProgressiveBlur />
    <div class="poster__lock">
      <Lock class="poster__lock-icon" />
      {{ $t('plan.state.ultimate') }}
    </div>
  </div>
</template>

<script lang="ts" setup>
import { Check, Lightbulb, Lock, RefreshCw, Repeat, Terminal } from 'lucide-vue-next';
import { ProgressiveBlur } from '../effects';
</script>

<style scoped>
.poster {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  border-radius: 14px;
  border: 1px solid hsl(var(--border));
  background-color: hsl(var(--card));
  box-shadow: 0 24px 64px -20px rgba(0, 0, 0, 0.28);
}

.poster__bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border-bottom: 1px solid hsl(var(--border));
  background-color: hsl(var(--muted) / 0.5);
}

.poster__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: hsl(var(--border));
}

.poster__pill {
  margin-left: 8px;
  padding: 2px 11px;
  border-radius: 999px;
  border: 1px solid hsl(var(--border));
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.poster__model {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid hsl(var(--primary) / 0.35);
  color: hsl(var(--primary));
  font-size: 10px;
  font-weight: 600;
}

.poster__chat {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  gap: 12px;
  padding: 16px;
  background-color: hsl(var(--background));
}

/* ── user turn — solid primary bubble, matches .user-content ── */
.p-user {
  align-self: flex-end;
  max-width: 76%;
  padding: 8px 13px;
  border-radius: 12px 12px 4px 12px;
  background-color: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  font-size: 12px;
  animation: p-user-flow 12s linear both;
}

/* ── assistant activity timeline — vertical line, matches .activity-list ── */
.p-timeline {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding-left: 16px;
  max-width: 94%;
}

.p-timeline::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 5px;
  bottom: 5px;
  width: 1px;
  background-color: hsl(var(--border));
}

.p-iter {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: hsl(var(--muted-foreground));
  animation: p-step-1 12s linear both;
}

.p-ic {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  color: hsl(var(--muted-foreground));
}

.p-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 20px;
}

.p-row--think {
  animation: p-step-1 12s linear both;
}

.p-row--tool {
  animation: p-step-2 12s linear both;
}

.p-row-label {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.p-ic--pulse {
  color: hsl(var(--primary));
  animation: p-pulse 1.6s ease-in-out infinite;
}

.p-dots {
  display: inline-flex;
  gap: 3px;
  animation: p-visible-1 12s linear both;
}

.p-dots i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: hsl(var(--muted-foreground));
  animation: p-dot-pulse 1.1s ease-in-out infinite;
}

.p-dots i:nth-child(2) {
  animation-delay: 0.15s;
}

.p-dots i:nth-child(3) {
  animation-delay: 0.3s;
}

.p-badge {
  padding: 1px 7px;
  border-radius: 999px;
  background-color: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
  font-size: 9.5px;
  font-variant-numeric: tabular-nums;
  animation: p-visible-2 12s linear both;
}

.p-tool-name {
  padding: 1px 7px;
  border-radius: 6px;
  border: 1px solid hsl(var(--border));
  background-color: hsl(var(--muted) / 0.5);
  font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  color: hsl(var(--foreground));
}

.p-spin {
  width: 12px;
  height: 12px;
  color: hsl(var(--primary));
  animation:
    p-visible-1 12s linear both,
    p-rotate 1.1s linear infinite;
}

.p-check {
  width: 12px;
  height: 12px;
  color: hsl(var(--method-post));
  animation: p-check-flow 12s linear both;
}

.p-chip {
  padding: 1px 8px;
  border-radius: 999px;
  background-color: hsl(var(--method-post) / 0.12);
  color: hsl(var(--method-post));
  font-size: 9.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  animation: p-visible-2 12s linear both;
}

/* ── final answer ── */
.p-answer {
  display: flex;
  flex-direction: column;
  gap: 9px;
  max-width: 94%;
  animation: p-answer-flow 12s linear both;
}

.p-answer-text {
  margin: 0;
  font-size: 12px;
  color: hsl(var(--foreground));
}

.p-code {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid hsl(var(--border));
  background-color: hsl(var(--muted) / 0.55);
  font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
  line-height: 1.55;
  color: hsl(var(--foreground));
  overflow: hidden;
  animation: p-code-flow 12s linear both;
}

.p-table {
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  overflow: hidden;
  font-size: 11px;
}

.p-tr {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr 1fr;
}

.p-tr > span {
  padding: 5px 10px;
  color: hsl(var(--muted-foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.p-tr--head > span {
  background-color: hsl(var(--muted) / 0.6);
  font-weight: 600;
  color: hsl(var(--foreground));
}

.p-tr + .p-tr > span {
  border-top: 1px solid hsl(var(--border));
}

.p-answer .p-tr {
  animation: p-code-flow 12s linear both;
}

.poster__lock {
  position: absolute;
  left: 24px;
  bottom: 24px;
  z-index: 2;
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

/* ── one-shot scenario build-up: ask → think → query → answer, then hold ── */
@keyframes p-user-flow {
  0% {
    opacity: 0;
    transform: translateY(8px);
  }
  3% {
    opacity: 1;
    transform: none;
  }
  100% {
    opacity: 1;
    transform: none;
  }
}

@keyframes p-step-1 {
  0%,
  6% {
    opacity: 0;
    transform: translateY(8px);
  }
  9% {
    opacity: 1;
    transform: none;
  }
  100% {
    opacity: 1;
    transform: none;
  }
}

@keyframes p-step-2 {
  0%,
  23% {
    opacity: 0;
    transform: translateY(8px);
  }
  26% {
    opacity: 1;
    transform: none;
  }
  100% {
    opacity: 1;
    transform: none;
  }
}

@keyframes p-answer-flow {
  0%,
  46% {
    opacity: 0;
    transform: translateY(8px);
  }
  50% {
    opacity: 1;
    transform: none;
  }
  100% {
    opacity: 1;
    transform: none;
  }
}

@keyframes p-code-flow {
  0%,
  53% {
    opacity: 0;
  }
  57% {
    opacity: 1;
  }
  100% {
    opacity: 1;
  }
}

/* dots pulse while thinking, then hand over to the duration badge */
@keyframes p-visible-1 {
  0%,
  6% {
    opacity: 0;
  }
  9% {
    opacity: 1;
  }
  20% {
    opacity: 1;
  }
  23%,
  100% {
    opacity: 0;
  }
}

@keyframes p-visible-2 {
  0%,
  19% {
    opacity: 0;
  }
  23% {
    opacity: 1;
  }
  100% {
    opacity: 1;
  }
}

@keyframes p-check-flow {
  0%,
  36% {
    opacity: 0;
    transform: scale(0.6);
  }
  40% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes p-dot-pulse {
  0%,
  100% {
    opacity: 0.35;
  }
  50% {
    opacity: 1;
  }
}

@keyframes p-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

@keyframes p-rotate {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .p-user,
  .p-iter,
  .p-row,
  .p-dots,
  .p-badge,
  .p-spin,
  .p-check,
  .p-chip,
  .p-answer,
  .p-code,
  .p-answer .p-tr,
  .p-ic--pulse {
    animation: none;
  }

  .p-dots,
  .p-spin {
    display: none;
  }
}

/* full-bleed variant: the poster fills the gated page edge to edge */
.poster--full {
  height: 100%;
  border-radius: 0;
  border: none;
  box-shadow: none;
  overflow-y: auto;
}

/* CTA slot: laid out inside the poster's own flex column so the button is
   structurally pinned to the window bottom — immune to containing-block
   resolution and content height changes. */
.poster__cta {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: center;
  padding: 18px 0 20px;
}
/* compact dialog context: drop the widest blocks */
</style>
