<template>
  <div class="context-indicator" :class="severityClass">
    <button
      type="button"
      class="context-indicator__trigger"
      :title="tooltip"
      @click="togglePopover"
    >
      <span class="context-indicator__dot" />
      <span class="context-indicator__label">{{ percentText }}</span>
      <span
        v-if="autoCompactOff"
        class="context-indicator__off-badge"
        :title="t('dataStudio.contextIndicator.offBadgeTitle')"
      >
        OFF
      </span>
      <span class="context-indicator__bar" aria-hidden="true">
        <span class="context-indicator__bar-fill" :style="{ width: `${clampedPercent}%` }" />
      </span>
    </button>

    <div v-if="open" class="context-indicator__popover" @click.stop>
      <header class="context-indicator__popover-header">
        <span class="context-indicator__popover-title">
          {{ t('dataStudio.contextIndicator.popoverTitle') }}
        </span>
        <span class="context-indicator__popover-model">{{ usage?.model ?? '—' }}</span>
      </header>

      <div v-if="autoCompactOff && usage?.should_compact" class="context-indicator__warning">
        <span class="i-carbon-warning-alt h-3.5 w-3.5" />
        <span>{{ t('dataStudio.contextIndicator.warningText') }}</span>
      </div>

      <dl class="context-indicator__grid">
        <div>
          <dt>{{ t('dataStudio.contextIndicator.labelUsed') }}</dt>
          <dd>{{ formatTokens(usage?.used_tokens ?? 0) }}</dd>
        </div>
        <div>
          <dt>{{ t('dataStudio.contextIndicator.labelCapacity') }}</dt>
          <dd>{{ formatTokens(usage?.capacity ?? 0) }}</dd>
        </div>
        <div>
          <dt>{{ t('dataStudio.contextIndicator.labelWindow') }}</dt>
          <dd>{{ formatTokens(usage?.context_window ?? 0) }}</dd>
        </div>
        <div>
          <dt>{{ t('dataStudio.contextIndicator.labelReservedOut') }}</dt>
          <dd>{{ formatTokens(usage?.output_reserve ?? 0) }}</dd>
        </div>
        <div>
          <dt>{{ t('dataStudio.contextIndicator.labelAutoCompactAt') }}</dt>
          <dd>{{ formatTokens(usage?.trigger_at ?? 0) }}</dd>
        </div>
        <div>
          <dt>{{ t('dataStudio.contextIndicator.labelStatus') }}</dt>
          <dd>{{ statusText }}</dd>
        </div>
      </dl>

      <footer class="context-indicator__popover-footer">
        <button
          type="button"
          class="context-indicator__action"
          :disabled="compacting"
          @click="onCompact"
        >
          <Spinner v-if="compacting" size="sm" />
          <span v-else class="i-carbon-collapse-all h-3.5 w-3.5" />
          <span>
            {{
              compacting
                ? t('dataStudio.contextIndicator.compacting')
                : t('dataStudio.contextIndicator.compactNow')
            }}
          </span>
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import {
  compactAgentSession,
  getAgentContextUsage,
  onAgentContextUsage,
  type ContextUsage,
} from '@/datasources/agentApi';
import { Spinner } from './ui/spinner';
import { useMessageService } from '@/composables';

const props = defineProps<{
  sessionId: string | null;
  settings: unknown | null;
}>();

const emit = defineEmits<{ compacted: [usage: ContextUsage] }>();

const { t } = useI18n();
const message = useMessageService();

const usage = ref<ContextUsage | null>(null);
const open = ref(false);
const compacting = ref(false);
let unlisten: (() => void) | null = null;
let isDisposed = false;

const percent = computed(() => {
  if (!usage.value || usage.value.capacity === 0) return 0;
  return (usage.value.used_tokens / usage.value.capacity) * 100;
});

const clampedPercent = computed(() => Math.max(0, Math.min(100, percent.value)));
const percentText = computed(() => `${Math.round(clampedPercent.value)}%`);

const severityClass = computed(() => {
  const p = clampedPercent.value;
  if (p >= 80) return 'context-indicator--critical';
  if (p >= 60) return 'context-indicator--warning';
  return 'context-indicator--ok';
});

const autoCompactOff = computed(() => {
  const s = props.settings as { autoCompact?: boolean } | null;
  return s?.autoCompact === false;
});

const statusText = computed(() => {
  if (!usage.value) return t('dataStudio.contextIndicator.statusIdle');
  if (autoCompactOff.value) {
    return usage.value.should_compact
      ? t('dataStudio.contextIndicator.statusOverThresholdOff')
      : t('dataStudio.contextIndicator.statusAutoCompactOff');
  }
  if (usage.value.should_compact) return t('dataStudio.contextIndicator.statusWillAutoCompact');
  return t('dataStudio.contextIndicator.statusHealthy');
});

const tooltip = computed(() => {
  if (!usage.value) return t('dataStudio.contextIndicator.tooltipIdle');
  const base = `Context ${percentText.value} · ${formatTokens(usage.value.used_tokens)} / ${formatTokens(
    usage.value.capacity,
  )}`;
  return autoCompactOff.value
    ? `${base} · ${t('dataStudio.contextIndicator.tooltipAutoCompactOff')}`
    : base;
});

const formatTokens = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}k`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};

const refresh = async () => {
  if (!props.sessionId || !props.settings) return;
  try {
    usage.value = await getAgentContextUsage(props.sessionId, props.settings);
  } catch {
    // Silently ignore: backend may not be ready or session was just created.
  }
};

const togglePopover = async () => {
  open.value = !open.value;
  if (open.value) await refresh();
};

const onCompact = async () => {
  if (!props.sessionId || !props.settings || compacting.value) return;
  compacting.value = true;
  try {
    const next = await compactAgentSession(props.sessionId, props.settings);
    usage.value = next;
    emit('compacted', next);
    message.success(t('dataStudio.contextIndicator.compactSuccess'));
  } catch (err) {
    message.error(t('dataStudio.contextIndicator.compactFailed', { error: err }));
  } finally {
    compacting.value = false;
  }
};

const closeOnOutside = (e: MouseEvent) => {
  const el = (e.target as HTMLElement | null)?.closest('.context-indicator');
  if (!el) open.value = false;
};

onMounted(async () => {
  const fn = await onAgentContextUsage(payload => {
    if (payload.session_id === props.sessionId) usage.value = payload;
  });
  if (isDisposed) {
    fn();
    return;
  }
  unlisten = fn;
  document.addEventListener('click', closeOnOutside);
  await refresh();
});

onBeforeUnmount(() => {
  isDisposed = true;
  unlisten?.();
  document.removeEventListener('click', closeOnOutside);
});

watch(
  () => props.sessionId,
  async () => {
    open.value = false;
    usage.value = null;
    await refresh();
  },
);

// One-shot: when settings arrive after mount and usage hasn't been populated yet, fetch.
// Self-stops once usage is set to avoid permanent reactive overhead.
const stopSettingsWatch = watch(
  () => props.settings,
  async next => {
    if (!next || usage.value) return;
    await refresh();
    if (usage.value) stopSettingsWatch();
  },
);

defineExpose({ refresh });
</script>

<style scoped>
.context-indicator {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.context-indicator__trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border: 1px solid hsl(var(--border));
  border-radius: 999px;
  background: hsl(var(--background));
  color: hsl(var(--muted-foreground));
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  cursor: pointer;
  transition:
    border-color 120ms ease,
    color 120ms ease,
    background-color 120ms ease;
}

.context-indicator__trigger:hover {
  border-color: hsl(var(--foreground) / 0.25);
  color: hsl(var(--foreground));
}

.context-indicator__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.context-indicator__label {
  font-weight: 500;
}

.context-indicator__off-badge {
  padding: 1px 5px;
  border-radius: 4px;
  background: hsl(38 92% 48% / 0.18);
  color: hsl(38 92% 38%);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  line-height: 1.4;
}

.context-indicator__warning {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 10px;
  padding: 8px 10px;
  border: 1px solid hsl(38 92% 48% / 0.4);
  border-radius: 6px;
  background: hsl(38 92% 48% / 0.08);
  color: hsl(38 92% 30%);
  font-size: 11px;
  line-height: 1.4;
}

.context-indicator__bar {
  position: relative;
  width: 48px;
  height: 4px;
  border-radius: 2px;
  background: hsl(var(--muted));
  overflow: hidden;
}

.context-indicator__bar-fill {
  display: block;
  height: 100%;
  background: currentColor;
  transition: width 240ms ease;
}

.context-indicator--ok .context-indicator__trigger {
  color: hsl(142 70% 38%);
}

.context-indicator--warning .context-indicator__trigger {
  color: hsl(38 92% 48%);
}

.context-indicator--critical .context-indicator__trigger {
  color: hsl(0 78% 52%);
  animation: context-pulse 1.6s ease-in-out infinite;
}

@keyframes context-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 hsl(0 78% 52% / 0);
  }
  50% {
    box-shadow: 0 0 0 4px hsl(0 78% 52% / 0.12);
  }
}

.context-indicator__popover {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  z-index: 50;
  width: 260px;
  padding: 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--popover));
  color: hsl(var(--popover-foreground));
  box-shadow: 0 8px 24px hsl(0 0% 0% / 0.12);
  font-size: 12px;
}

.context-indicator__popover-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 10px;
}

.context-indicator__popover-title {
  font-weight: 600;
}

.context-indicator__popover-model {
  font-size: 10px;
  color: hsl(var(--muted-foreground));
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.context-indicator__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  margin: 0 0 12px;
}

.context-indicator__grid div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.context-indicator__grid dt {
  font-size: 10px;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.context-indicator__grid dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.context-indicator__popover-footer {
  display: flex;
  justify-content: flex-end;
}

.context-indicator__action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  font-size: 11px;
  cursor: pointer;
  transition:
    background-color 120ms ease,
    border-color 120ms ease;
}

.context-indicator__action:hover:not(:disabled) {
  background: hsl(var(--accent));
  border-color: hsl(var(--foreground) / 0.25);
}

.context-indicator__action:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
