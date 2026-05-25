<script setup lang="ts">
import { computed } from 'vue';
import { Button } from '@/components/ui/button';
import type { AgentToolCall } from '@/store/dataStudioStore';

export type ConfirmationAction = {
  toolCallId: string;
  action: 'allow_once' | 'allow_always' | 'deny' | 'deny_always' | 'cancel';
};

const props = defineProps<{
  toolCall: AgentToolCall;
}>();

const emit = defineEmits<{
  confirm: [event: ConfirmationAction];
}>();

const targetSource = computed(() => {
  const raw = (props.toolCall.args as Record<string, unknown>)?.connection_id;
  return typeof raw === 'string' && raw ? raw : null;
});

const formattedArgs = computed(() => {
  try {
    const { connection_id: _omit, ...rest } = props.toolCall.args as Record<string, unknown>;
    return JSON.stringify(rest, null, 2);
  } catch {
    return String(props.toolCall.args);
  }
});

const stateLabel = computed(() => {
  switch (props.toolCall.status) {
    case 'pending':
      return null;
    case 'executing':
      return { icon: 'i-carbon-renew animate-spin', text: 'Executing…' };
    case 'denied':
      return { icon: 'i-carbon-subtract', text: 'Denied' };
    case 'done':
      return { icon: 'i-carbon-checkmark', text: 'Allowed' };
    case 'error':
      return { icon: 'i-carbon-warning', text: 'Error' };
    default:
      return null;
  }
});
</script>

<template>
  <div :class="['confirmation-card', `risk-${toolCall.riskLevel}`]">
    <div class="confirmation-header">
      <div class="flex items-center gap-2">
        <span class="i-carbon-warning-alt h-4 w-4" />
        <span class="text-sm font-medium">{{ toolCall.toolName }}</span>
      </div>
      <div class="flex items-center gap-2">
        <span :class="['risk-badge', `risk-badge-${toolCall.riskLevel}`]">
          {{ $t(`dataStudio.agent.riskLevel.${toolCall.riskLevel}`) }}
        </span>
        <span v-if="stateLabel" :class="['status-badge', `status-badge-${toolCall.status}`]">
          <span :class="stateLabel.icon" />
          {{ stateLabel.text }}
        </span>
      </div>
    </div>
    <div v-if="targetSource" class="target-source-row">
      <span class="i-carbon-data-base h-3.5 w-3.5 opacity-60" />
      <span class="target-source-label">
        {{ $t('dataStudio.agent.toolConfirmation.targetSource') }}
      </span>
      <span class="target-source-value">{{ targetSource }}</span>
    </div>
    <pre class="confirmation-args">{{ formattedArgs }}</pre>
    <div v-if="toolCall.status === 'pending'" class="confirmation-actions">
      <Button
        size="sm"
        variant="outline"
        @click="emit('confirm', { toolCallId: toolCall.id, action: 'allow_once' })"
      >
        {{ $t('dataStudio.agent.toolConfirmation.allowOnce') }}
      </Button>
      <Button
        size="sm"
        variant="outline"
        @click="emit('confirm', { toolCallId: toolCall.id, action: 'allow_always' })"
      >
        {{ $t('dataStudio.agent.toolConfirmation.allowAlways') }}
      </Button>
      <Button
        size="sm"
        variant="outline"
        @click="emit('confirm', { toolCallId: toolCall.id, action: 'deny' })"
      >
        {{ $t('dataStudio.agent.toolConfirmation.deny') }}
      </Button>
      <Button
        size="sm"
        variant="destructive"
        @click="emit('confirm', { toolCallId: toolCall.id, action: 'deny_always' })"
      >
        {{ $t('dataStudio.agent.toolConfirmation.denyAlways') }}
      </Button>
      <span class="confirm-spacer" />
      <Button
        size="sm"
        variant="ghost"
        @click="emit('confirm', { toolCallId: toolCall.id, action: 'cancel' })"
      >
        {{ $t('dataStudio.agent.toolConfirmation.cancel') }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
.confirmation-card {
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  padding: 12px;
  margin: 8px 0;
  background: hsl(var(--background));
}

.confirmation-card.risk-elevated {
  border-color: hsl(var(--chart-4) / 0.4);
}

.confirmation-card.risk-destructive {
  border-color: hsl(var(--destructive) / 0.4);
}

.confirmation-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.target-source-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  padding: 4px 8px;
  background: hsl(var(--muted));
  border-radius: 6px;
  font-size: 12px;
}

.target-source-label {
  color: hsl(var(--muted-foreground));
}

.target-source-value {
  font-family: monospace;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.risk-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 500;
}

.risk-badge-safe {
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
}

.risk-badge-elevated {
  background: hsl(var(--chart-4) / 0.1);
  color: hsl(var(--chart-4));
}

.risk-badge-destructive {
  background: hsl(var(--destructive) / 0.1);
  color: hsl(var(--destructive));
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 500;
}

.status-badge-executing {
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
}

.status-badge-denied {
  background: hsl(var(--destructive) / 0.1);
  color: hsl(var(--destructive));
}

.status-badge-done {
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
}

.status-badge-error {
  background: hsl(var(--destructive) / 0.1);
  color: hsl(var(--destructive));
}

.confirmation-args {
  margin: 8px 0;
  padding: 8px;
  background: hsl(var(--muted));
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.4;
  overflow-x: auto;
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.confirmation-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.confirm-spacer {
  flex: 1;
  min-width: 20px;
}
</style>
