<template>
  <div class="poster" aria-hidden="true">
    <div class="poster__bar">
      <span class="poster__dot" />
      <span class="poster__dot" />
      <span class="poster__dot" />
      <span class="poster__pill">{{ $t('manage.cluster') }}</span>
      <span class="p-health">
        <span class="p-health-dot" />
        {{ $t('plan.poster.cluster.healthy') }}
      </span>
    </div>

    <div class="poster__body">
      <div class="p-metrics">
        <div class="p-metric p-metric--cluster">
          <span class="p-metric-label">{{ $t('manage.cluster') }}</span>
          <span class="p-status">
            <i class="p-status-dot" />
            {{ $t('plan.poster.cluster.healthy') }}
          </span>
          <div class="p-info">
            <div class="p-info-row">
              <span>NAME</span>
              <b>docker-es</b>
            </div>
            <div class="p-info-row">
              <span>VERSION</span>
              <b>8.15.3</b>
            </div>
          </div>
        </div>
        <div class="p-metric">
          <span class="p-metric-label">{{ $t('manage.nodes') }}</span>
          <span class="p-metric-value">5</span>
        </div>
        <div class="p-metric">
          <span class="p-metric-label">{{ $t('manage.indices') }}</span>
          <span class="p-metric-value">42</span>
        </div>
        <div class="p-metric p-metric--quad">
          <span class="p-metric-label">{{ $t('manage.shards') }}</span>
          <div class="p-quad">
            <div class="p-quad-item">
              <span>TOTAL</span>
              <b>105</b>
            </div>
            <div class="p-quad-item">
              <span>PRIMARY</span>
              <b>52</b>
            </div>
            <div class="p-quad-item">
              <span>REPLICA</span>
              <b>53</b>
            </div>
            <div class="p-quad-item">
              <span>UNASSIGNED</span>
              <b class="p-ok">0</b>
            </div>
          </div>
        </div>
        <div class="p-metric p-metric--quad">
          <span class="p-metric-label">DOCS</span>
          <div class="p-quad">
            <div class="p-quad-item">
              <span>COUNT</span>
              <b>1.2M</b>
            </div>
            <div class="p-quad-item">
              <span>SIZE</span>
              <b>2.4 GB</b>
            </div>
          </div>
        </div>
      </div>

      <div class="p-nodes">
        <div class="p-nodes-header">
          <Database class="p-ic" />
          <span class="p-nodes-title">{{ $t('manage.nodes') }}</span>
          <span class="p-nodes-count">5 nodes</span>
        </div>
        <div class="p-node-grid">
          <div v-for="node in nodes" :key="node.name" class="p-node">
            <div class="p-node-header">
              <span class="p-node-roles">
                <Star v-if="node.master" class="p-ic p-ic--master" />
                <HardDrive class="p-ic" />
              </span>
              <span class="p-node-name">{{ node.name }}</span>
            </div>
            <div class="p-node-stats">
              <div class="p-node-stat">
                <span>{{ $t('manage.node.ip') }}</span>
                <b>{{ node.ip }}</b>
              </div>
              <div class="p-node-stat">
                <span>{{ $t('manage.node.shards') }}</span>
                <b>{{ node.shards }}</b>
              </div>
              <div class="p-node-stat">
                <span>{{ $t('manage.node.mappings') }}</span>
                <b>{{ node.mappings }}</b>
              </div>
            </div>
            <div class="p-gauges">
              <div v-for="g in node.gauges" :key="g.label" class="p-gauge">
                <svg viewBox="0 0 36 36" class="p-ring">
                  <circle cx="18" cy="18" r="15.9" class="p-ring-bg" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    class="p-ring-fill"
                    :class="g.percent >= 70 ? 'p-ring-fill--warn' : 'p-ring-fill--ok'"
                    :stroke-dashoffset="100 - g.percent"
                    :style="{ '--off': 100 - g.percent, '--d': g.delay }"
                  />
                </svg>
                <span class="p-gauge-value" :class="g.percent >= 70 ? 'p-warn-text' : 'p-ok-text'">
                  {{ g.percent }}%
                </span>
                <span class="p-gauge-label">{{ g.label }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="p-indices">
        <div class="p-nodes-header">
          <Table2 class="p-ic" />
          <span class="p-nodes-title">{{ $t('manage.indices') }}</span>
          <span class="p-nodes-count">42</span>
        </div>
        <div class="p-table">
          <div class="p-tr p-tr--head">
            <span>INDEX</span>
            <span>HEALTH</span>
            <span>DOCS</span>
            <span>SIZE</span>
          </div>
          <div v-for="idx in indices" :key="idx.name" class="p-tr">
            <span class="p-tr-name">{{ idx.name }}</span>
            <span class="p-tr-health">
              <i />
              green
            </span>
            <span>{{ idx.docs }}</span>
            <span>{{ idx.size }}</span>
          </div>
        </div>
      </div>

      <div class="p-templates">
        <FileStack class="p-ic" />
        <span>{{ $t('plan.poster.cluster.templates') }}</span>
        <span class="p-templates-count">6</span>
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
import { Database, FileStack, HardDrive, Lock, Star, Table2 } from 'lucide-vue-next';
import { ProgressiveBlur } from '../effects';

const nodes = [
  {
    name: 'node-1.elasticsearch',
    ip: '172.18.0.2',
    shards: 24,
    mappings: 41,
    master: true,
    data: true,
    gauges: [
      { label: 'HEAP', percent: 43, delay: '0.5s' },
      { label: 'RAM', percent: 61, delay: '0.62s' },
      { label: 'DISK', percent: 38, delay: '0.74s' },
    ],
  },
  {
    name: 'node-2.elasticsearch',
    ip: '172.18.0.3',
    shards: 19,
    mappings: 38,
    master: false,
    data: true,
    gauges: [
      { label: 'HEAP', percent: 58, delay: '0.62s' },
      { label: 'RAM', percent: 71, delay: '0.74s' },
      { label: 'DISK', percent: 82, delay: '0.86s' },
    ],
  },
  {
    name: 'node-3.elasticsearch',
    ip: '172.18.0.4',
    shards: 21,
    mappings: 40,
    master: false,
    data: true,
    gauges: [
      { label: 'HEAP', percent: 39, delay: '0.74s' },
      { label: 'RAM', percent: 55, delay: '0.86s' },
      { label: 'DISK', percent: 47, delay: '0.98s' },
    ],
  },
] as const;

const indices = [
  { name: 'payment_orders', docs: '48.1k', size: '312 MB' },
  { name: 'users', docs: '12.4k', size: '86 MB' },
  { name: 'orders_2026', docs: '203k', size: '1.1 GB' },
] as const;
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
}

.p-health {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 600;
  color: hsl(var(--method-post));
}

.p-health-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: hsl(var(--method-post));
  animation: p-pulse 2.2s ease-in-out infinite;
}

.poster__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: hidden;
  padding: 14px;
  background-color: hsl(var(--background));
}

/* ── metrics row — mirrors the real metrics-grid cards ── */
.p-metrics {
  display: grid;
  grid-template-columns: 1.35fr 0.7fr 0.7fr 1.1fr 0.95fr;
  gap: 8px;
}

.p-metric {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid hsl(var(--border));
  background-color: hsl(var(--card));
  min-width: 0;
}

.p-metric-label {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.07em;
  color: hsl(var(--muted-foreground));
}

.p-metric-value {
  font-size: 20px;
  font-weight: 700;
  color: hsl(var(--foreground));
  font-variant-numeric: tabular-nums;
}

.p-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 600;
  color: hsl(var(--method-post));
}

.p-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: hsl(var(--method-post));
}

.p-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 2px;
}

.p-info-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 9.5px;
}

.p-info-row span {
  color: hsl(var(--muted-foreground));
  letter-spacing: 0.05em;
}

.p-info-row b {
  color: hsl(var(--foreground));
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.p-quad {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px 10px;
}

.p-quad-item {
  display: flex;
  flex-direction: column;
}

.p-quad-item span {
  font-size: 8.5px;
  letter-spacing: 0.05em;
  color: hsl(var(--muted-foreground));
}

.p-quad-item b {
  font-size: 11.5px;
  font-weight: 700;
  color: hsl(var(--foreground));
  font-variant-numeric: tabular-nums;
}

.p-ok {
  color: hsl(var(--method-post));
}

/* ── nodes section — mirrors the real nodes-card with ring gauges ── */
.p-nodes {
  display: flex;
  flex: 0 0 42%;
  min-height: 0;
  flex-direction: column;
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  background-color: hsl(var(--card));
  padding: 11px 13px;
}

.p-indices {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  background-color: hsl(var(--card));
  padding: 11px 13px;
}

.p-table {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  border: 1px solid hsl(var(--border) / 0.6);
  border-radius: 8px;
  overflow: hidden;
  font-size: 10.5px;
}

.p-tr {
  display: grid;
  grid-template-columns: 1.6fr 0.7fr 0.6fr 0.6fr;
  flex: 1;
  align-items: center;
}

.p-tr > span {
  padding: 4px 10px;
  color: hsl(var(--muted-foreground));
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.p-tr--head > span {
  background-color: hsl(var(--muted) / 0.6);
  font-weight: 700;
  font-size: 9px;
  letter-spacing: 0.06em;
  color: hsl(var(--foreground));
}

.p-tr + .p-tr > span {
  border-top: 1px solid hsl(var(--border) / 0.5);
}

.p-tr-name {
  color: hsl(var(--foreground)) !important;
  font-weight: 600;
}

.p-tr-health {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.p-tr-health i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: hsl(var(--method-post));
}

.p-templates {
  display: flex;
  align-items: center;
  gap: 7px;
  border: 1px solid hsl(var(--border) / 0.7);
  border-radius: 10px;
  background-color: hsl(var(--card));
  padding: 8px 13px;
  font-size: 10.5px;
  color: hsl(var(--muted-foreground));
}

.p-templates-count {
  margin-left: auto;
  font-weight: 700;
  color: hsl(var(--foreground));
  font-variant-numeric: tabular-nums;
}

.p-nodes-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 8px;
}

.p-nodes-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: hsl(var(--foreground));
}

.p-nodes-count {
  margin-left: auto;
  font-size: 10px;
  color: hsl(var(--muted-foreground));
  font-variant-numeric: tabular-nums;
}

.p-ic {
  width: 13px;
  height: 13px;
  color: hsl(var(--muted-foreground));
}

.p-ic--master {
  color: hsl(var(--method-put));
}

.p-node-grid {
  display: grid;
  flex: 1;
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-rows: minmax(0, 1fr);
  gap: 9px;
}

.p-node {
  display: flex;
  min-height: 0;
  flex-direction: column;
  border: 1px solid hsl(var(--border) / 0.7);
  border-radius: 8px;
  padding: 9px 11px;
  gap: 7px;
}

.p-node-roles {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.p-node .p-gauges {
  margin-top: auto;
  padding-top: 6px;
}

.p-node-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.p-node-name {
  font-size: 11px;
  font-weight: 600;
  color: hsl(var(--foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.p-node-stats {
  display: flex;
  gap: 12px;
}

.p-node-stat {
  display: flex;
  flex-direction: column;
}

.p-node-stat span {
  font-size: 8.5px;
  letter-spacing: 0.05em;
  color: hsl(var(--muted-foreground));
}

.p-node-stat b {
  font-size: 10.5px;
  font-weight: 600;
  color: hsl(var(--foreground));
  font-variant-numeric: tabular-nums;
}

.p-gauges {
  display: flex;
  justify-content: space-around;
  gap: 6px;
  padding-top: 2px;
}

.p-gauge {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.p-ring {
  width: 40px;
  height: 40px;
  transform: rotate(-90deg);
}

.p-ring circle {
  fill: none;
  stroke-width: 3.6;
  stroke-dasharray: 100;
}

.p-ring-bg {
  stroke: hsl(var(--muted));
}

.p-ring-fill {
  stroke: hsl(var(--method-post));
  animation: p-gauge-fill 1.3s cubic-bezier(0.33, 1, 0.68, 1) both;
  animation-delay: var(--d);
}

.p-ring-fill--warn {
  stroke: hsl(var(--method-put));
}

.p-gauge-value {
  position: absolute;
  top: 13px;
  font-size: 9px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.p-ok-text {
  color: hsl(var(--method-post));
}

.p-warn-text {
  color: hsl(var(--method-put));
}

.p-gauge-label {
  font-size: 8px;
  letter-spacing: 0.07em;
  color: hsl(var(--muted-foreground));
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

@keyframes p-gauge-fill {
  from {
    stroke-dashoffset: 100;
  }
  to {
    stroke-dashoffset: var(--off);
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

@media (prefers-reduced-motion: reduce) {
  .p-ring-fill,
  .p-health-dot {
    animation: none;
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
/* compact dialog context: metrics only */
</style>
