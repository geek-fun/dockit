<template>
  <div class="poster" aria-hidden="true">
    <div class="poster__bar">
      <span class="poster__dot" />
      <span class="poster__dot" />
      <span class="poster__dot" />
      <span class="poster__tab">{{ $t('importExport.import') }}</span>
      <span class="poster__chip">NDJSON · CSV</span>
    </div>

    <div class="poster__body">
      <div v-for="file in files" :key="file.name" class="poster__file">
        <component :is="file.icon" class="poster__file-icon" />
        <div class="poster__file-main">
          <div class="poster__file-row">
            <span class="poster__file-name">{{ file.name }}</span>
            <span v-if="file.status === 'done'" class="poster__file-done">
              <Check class="poster__file-check" />
              48,102 docs
            </span>
            <span v-else-if="file.status === 'running'" class="poster__file-count">64%</span>
            <span v-else class="poster__file-count">·</span>
          </div>
          <div class="poster__file-track">
            <i
              :class="`poster__file-fill poster__file-fill--${file.status}`"
              :style="{ width: file.progress + '%' }"
            />
          </div>
        </div>
      </div>

      <p class="poster__meta">{{ $t('plan.poster.importExport.summary') }}</p>
    </div>

    <ProgressiveBlur />
    <div class="poster__lock">
      <Lock class="poster__lock-icon" />
      {{ $t('plan.gate.lockedChip') }}
    </div>
  </div>
</template>

<script lang="ts" setup>
import { Check, FileJson, FileSpreadsheet, FileText, Lock } from 'lucide-vue-next';
import { ProgressiveBlur } from '../effects';

const files = [
  { name: 'users-2026.ndjson', icon: FileJson, status: 'done', progress: 100 },
  { name: 'orders-batch.ndjson', icon: FileJson, status: 'running', progress: 64 },
  { name: 'inventory.csv', icon: FileSpreadsheet, status: 'running', progress: 31 },
  { name: 'invoices-sept.csv', icon: FileText, status: 'queued', progress: 0 },
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
  gap: 12px;
  padding: 14px;
}

.poster__file {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.poster__file-icon {
  width: 17px;
  height: 17px;
  margin-top: 2px;
  color: hsl(var(--muted-foreground));
  flex-shrink: 0;
}

.poster__file-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.poster__file-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.poster__file-name {
  font-size: 12px;
  color: hsl(var(--foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.poster__file-count {
  margin-left: auto;
  font-size: 10.5px;
  color: hsl(var(--muted-foreground));
  font-variant-numeric: tabular-nums;
}

.poster__file-done {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  font-weight: 600;
  color: hsl(var(--primary));
  font-variant-numeric: tabular-nums;
}

.poster__file-check {
  width: 11px;
  height: 11px;
}

.poster__file-track {
  height: 6px;
  border-radius: 999px;
  background-color: hsl(var(--muted));
  overflow: hidden;
}

.poster__file-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.poster__file-fill--done {
  background-color: hsl(var(--primary) / 0.85);
}

.poster__file-fill--running {
  background-color: hsl(var(--primary) / 0.65);
}

.poster__file-fill--queued {
  background-color: hsl(var(--border));
}

.poster__meta {
  font-size: 10.5px;
  color: hsl(var(--muted-foreground));
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
</style>

:global([data-poster-context='dialog']) .poster__meta, :global([data-poster-context='dialog'])
.poster__lock { display: none; }
