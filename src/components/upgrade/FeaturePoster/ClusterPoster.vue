<template>
  <div class="poster" aria-hidden="true">
    <div class="poster__bar">
      <span class="poster__dot" />
      <span class="poster__dot" />
      <span class="poster__dot" />
      <span class="poster__tab">Cluster</span>
      <span class="poster__health">
        <span class="poster__health-dot" />
        {{ $t('plan.poster.cluster.healthy') }}
      </span>
    </div>

    <div class="poster__body">
      <div class="poster__stats">
        <div class="poster__stat">
          <span class="poster__stat-value">5</span>
          <span class="poster__stat-label">{{ $t('plan.poster.cluster.nodes') }}</span>
        </div>
        <div class="poster__stat">
          <span class="poster__stat-value">128</span>
          <span class="poster__stat-label">{{ $t('plan.poster.cluster.shards') }}</span>
        </div>
        <div class="poster__stat">
          <span class="poster__stat-value">42</span>
          <span class="poster__stat-label">{{ $t('plan.poster.cluster.indices') }}</span>
        </div>
      </div>

      <div class="poster__chart">
        <div class="poster__chart-bar">
          <span class="poster__seg poster__seg--started" style="width: 82%" />
          <span class="poster__seg poster__seg--relocating" style="width: 6%" />
          <span class="poster__seg poster__seg--unassigned" style="width: 12%" />
        </div>
        <div class="poster__legend">
          <span>
            <i class="poster__key poster__seg--started" />
            STARTED 105
          </span>
          <span>
            <i class="poster__key poster__seg--relocating" />
            RELOCATING 8
          </span>
          <span>
            <i class="poster__key poster__seg--unassigned" />
            UNASSIGNED 15
          </span>
        </div>
      </div>

      <div class="poster__nodes">
        <div v-for="node in nodes" :key="node.name" class="poster__node">
          <span class="poster__node-name">{{ node.name }}</span>
          <span class="poster__node-bar">
            <i :style="{ width: node.cpu + '%' }" />
          </span>
          <span class="poster__node-value">{{ node.cpu }}%</span>
        </div>
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
import { Lock } from 'lucide-vue-next';
import { ProgressiveBlur } from '../effects';

const nodes = [
  { name: 'node-1.easysearch', cpu: 34 },
  { name: 'node-2.easysearch', cpu: 61 },
  { name: 'node-3.easysearch', cpu: 48 },
  { name: 'node-4.easysearch', cpu: 77 },
] as const;
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

.poster__health {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 600;
  color: hsl(var(--method-post));
}

.poster__health-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: hsl(var(--method-post));
}

.poster__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
}

.poster__stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.poster__stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid hsl(var(--border));
  background-color: hsl(var(--muted) / 0.35);
}

.poster__stat-value {
  font-size: 17px;
  font-weight: 700;
  color: hsl(var(--foreground));
  font-variant-numeric: tabular-nums;
}

.poster__stat-label {
  font-size: 10.5px;
  color: hsl(var(--muted-foreground));
}

.poster__chart {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.poster__chart-bar {
  display: flex;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  border: 1px solid hsl(var(--border));
}

.poster__seg {
  display: block;
  height: 100%;
}

.poster__seg--started {
  background-color: hsl(var(--primary) / 0.75);
}

.poster__seg--relocating {
  background-color: hsl(var(--method-put) / 0.85);
}

.poster__seg--unassigned {
  background-color: hsl(var(--border));
}

.poster__legend {
  display: flex;
  gap: 14px;
  font-size: 9.5px;
  letter-spacing: 0.03em;
  color: hsl(var(--muted-foreground));
}

.poster__legend > span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.poster__key {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

.poster__nodes {
  display: flex;
  flex-direction: column;
}

.poster__node {
  display: grid;
  grid-template-columns: 1.1fr 1fr 44px;
  align-items: center;
  gap: 10px;
  padding: 6px 2px;
}

.poster__node + .poster__node {
  border-top: 1px solid hsl(var(--border) / 0.6);
}

.poster__node-name {
  font-size: 11px;
  color: hsl(var(--foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.poster__node-bar {
  height: 6px;
  border-radius: 999px;
  background-color: hsl(var(--muted));
  overflow: hidden;
}

.poster__node-bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background-color: hsl(var(--primary) / 0.8);
}

.poster__node-value {
  font-size: 10.5px;
  color: hsl(var(--muted-foreground));
  text-align: right;
  font-variant-numeric: tabular-nums;
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
   narrow decorative column — hide the node list and lock chip there. */
[data-poster-context='dialog'] .poster__nodes,
[data-poster-context='dialog'] .poster__lock {
  display: none;
}
</style>
