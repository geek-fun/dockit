<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { highlightCodeHtml, presentToolCall, type ArgBlock, type ImpactHint } from '@/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useHighlightTheme } from '@/composables';
import { useLang } from '@/lang';
import type { AgentToolCall, RiskLevel } from '@/store/dataStudioStore';

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

const lang = useLang();
useHighlightTheme();

const EXPAND_LINE_THRESHOLD = 10;
const EXPAND_CHAR_THRESHOLD = 480;

const presentation = computed(() => presentToolCall(props.toolCall.toolName, props.toolCall.args));

const fieldBlocks = computed(() =>
  presentation.value.blocks.filter(
    (block): block is Extract<ArgBlock, { kind: 'field' }> => block.kind === 'field',
  ),
);

const codeBlocks = computed(() =>
  presentation.value.blocks.filter(
    (block): block is Extract<ArgBlock, { kind: 'code' }> => block.kind === 'code',
  ),
);

const hasMetadata = computed(() =>
  Boolean(presentation.value.target || presentation.value.operation || fieldBlocks.value.length),
);

const expandedKeys = ref<Record<string, boolean>>({});
const copiedKey = ref<string | null>(null);
let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

onBeforeUnmount(() => {
  if (copyResetTimer) clearTimeout(copyResetTimer);
});

const isExpandable = (text: string): boolean =>
  text.length > EXPAND_CHAR_THRESHOLD || text.split('\n').length > EXPAND_LINE_THRESHOLD;

const toggleExpand = (key: string) => {
  expandedKeys.value = {
    ...expandedKeys.value,
    [key]: !expandedKeys.value[key],
  };
};

const copyBlock = async (block: Extract<ArgBlock, { kind: 'code' }>) => {
  try {
    await navigator.clipboard.writeText(block.text);
    copiedKey.value = block.key;
    if (copyResetTimer) clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => {
      copiedKey.value = null;
    }, 1800);
  } catch {
    // Clipboard unavailable
  }
};

const highlightedBlock = (block: Extract<ArgBlock, { kind: 'code' }>): string =>
  highlightCodeHtml(block.text, block.language);

const blockLabel = (block: Extract<ArgBlock, { kind: 'code' }>): string => {
  const langTag = block.language === 'text' ? '' : block.language.toUpperCase();
  const keyLabel = block.key.toLowerCase() === block.language ? '' : block.key;
  if (keyLabel && langTag) return `${keyLabel} · ${langTag}`;
  return langTag || keyLabel || block.key;
};

const riskIconClass = computed(() => {
  switch (props.toolCall.riskLevel) {
    case 'destructive':
      return 'i-carbon-warning-filled risk-icon-destructive';
    case 'elevated':
      return 'i-carbon-warning-alt risk-icon-elevated';
    default:
      return 'i-carbon-view risk-icon-safe';
  }
});

const riskDescription = (risk: RiskLevel): string => {
  switch (risk) {
    case 'destructive':
      return lang.t('dataStudio.agent.toolConfirmation.riskDescription.destructive');
    case 'elevated':
      return lang.t('dataStudio.agent.toolConfirmation.riskDescription.elevated');
    default:
      return lang.t('dataStudio.agent.toolConfirmation.riskDescription.safe');
  }
};

const hintMessage = (hint: ImpactHint): string => {
  switch (hint) {
    case 'noWhereClause':
      return lang.t('dataStudio.agent.toolConfirmation.hints.noWhereClause');
    case 'dropsObject':
      return lang.t('dataStudio.agent.toolConfirmation.hints.dropsObject');
    case 'truncates':
      return lang.t('dataStudio.agent.toolConfirmation.hints.truncates');
    case 'multipleStatements':
      return lang.t('dataStudio.agent.toolConfirmation.hints.multipleStatements');
  }
};

const isSevereHintBanner = computed(
  () =>
    props.toolCall.riskLevel === 'destructive' ||
    presentation.value.hints.some(hint => hint === 'dropsObject' || hint === 'truncates'),
);

const stateLabel = computed(() => {
  switch (props.toolCall.status) {
    case 'pending':
      return null;
    case 'executing':
      return {
        icon: 'i-carbon-renew animate-spin',
        text: lang.t('dataStudio.agent.toolConfirmation.status.executing'),
      };
    case 'denied':
      return {
        icon: 'i-carbon-subtract',
        text: lang.t('dataStudio.agent.toolConfirmation.status.denied'),
      };
    case 'done':
      return {
        icon: 'i-carbon-checkmark',
        text: lang.t('dataStudio.agent.toolConfirmation.status.allowed'),
      };
    case 'error':
      return {
        icon: 'i-carbon-warning',
        text: lang.t('dataStudio.agent.toolConfirmation.status.error'),
      };
    default:
      return null;
  }
});
</script>

<template>
  <div :class="['confirmation-card', `risk-${toolCall.riskLevel}`]">
    <div :class="['confirmation-header', `header-${toolCall.riskLevel}`]">
      <div class="header-main">
        <span :class="['h-4 w-4 shrink-0 mt-0.5', riskIconClass]" aria-hidden="true" />
        <div class="min-w-0 flex-1">
          <div class="header-title-row">
            <span :class="['risk-badge', `risk-badge-${toolCall.riskLevel}`]">
              {{ $t(`dataStudio.agent.riskLevel.${toolCall.riskLevel}`) }}
            </span>
            <span class="tool-name">{{ toolCall.toolName }}</span>
          </div>
          <p class="risk-description">{{ riskDescription(toolCall.riskLevel) }}</p>
        </div>
      </div>
      <span v-if="stateLabel" :class="['status-badge', `status-badge-${toolCall.status}`]">
        <span :class="['h-3 w-3', stateLabel.icon]" aria-hidden="true" />
        {{ stateLabel.text }}
      </span>
    </div>

    <div v-if="hasMetadata" class="metadata-row">
      <div v-if="presentation.target" class="metadata-item">
        <span
          class="i-carbon-data-base h-3.5 w-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <span class="metadata-label">
          {{ $t('dataStudio.agent.toolConfirmation.targetSource') }}
        </span>
        <span class="metadata-value font-semibold">{{ presentation.target }}</span>
      </div>

      <div v-if="presentation.operation" class="metadata-item">
        <span class="metadata-label">
          {{ $t('dataStudio.agent.toolConfirmation.operation') }}
        </span>
        <Badge variant="outline" class="text-caption font-mono px-1.5 py-0">
          {{ presentation.operation.verb }}
        </Badge>
        <span v-if="presentation.operation.object" class="metadata-value font-semibold">
          → {{ presentation.operation.object }}
        </span>
      </div>

      <div v-for="field in fieldBlocks" :key="field.key" class="metadata-item">
        <span class="metadata-label font-mono">{{ field.key }}</span>
        <span class="metadata-value">{{ field.value }}</span>
      </div>
    </div>

    <div class="confirmation-body">
      <div v-for="block in codeBlocks" :key="block.key" class="code-container">
        <div class="code-header">
          <span class="code-label">{{ blockLabel(block) }}</span>
          <div class="code-actions">
            <button
              v-if="isExpandable(block.text)"
              type="button"
              class="code-action-btn"
              @click="toggleExpand(block.key)"
            >
              <span
                :class="[
                  'h-3 w-3',
                  expandedKeys[block.key] ? 'i-carbon-chevron-up' : 'i-carbon-chevron-down',
                ]"
                aria-hidden="true"
              />
              <span>
                {{
                  expandedKeys[block.key]
                    ? $t('dataStudio.agent.toolConfirmation.showLess')
                    : $t('dataStudio.agent.toolConfirmation.showAll')
                }}
              </span>
            </button>
            <button
              type="button"
              class="code-action-btn"
              :aria-label="$t('dataStudio.agent.toolConfirmation.copy')"
              @click="copyBlock(block)"
            >
              <span
                :class="[
                  'h-3 w-3',
                  copiedKey === block.key ? 'i-carbon-checkmark text-primary' : 'i-carbon-copy',
                ]"
                aria-hidden="true"
              />
              <span>
                {{
                  copiedKey === block.key
                    ? $t('dataStudio.agent.toolConfirmation.copied')
                    : $t('dataStudio.agent.toolConfirmation.copy')
                }}
              </span>
            </button>
          </div>
        </div>
        <!-- eslint-disable vue/no-v-html -->
        <pre
          :class="['confirmation-args', expandedKeys[block.key] ? 'is-expanded' : '']"
        ><code v-if="block.language === 'text'">{{ block.text }}</code><code v-else class="hljs tool-code-content" v-html="highlightedBlock(block)" /></pre>
        <!-- eslint-enable vue/no-v-html -->
      </div>

      <div
        v-if="presentation.hints.length > 0"
        :class="[
          'hint-banner',
          isSevereHintBanner ? 'hint-banner-destructive' : 'hint-banner-warning',
        ]"
        role="note"
      >
        <div v-for="hint in presentation.hints" :key="hint" class="hint-row">
          <span class="i-carbon-warning h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{{ hintMessage(hint) }}</span>
        </div>
      </div>

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
          variant="ghost"
          class="text-foreground"
          @click="emit('confirm', { toolCallId: toolCall.id, action: 'allow_always' })"
        >
          {{ $t('dataStudio.agent.toolConfirmation.allowAlways') }}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          class="text-muted-foreground hover:text-foreground"
          @click="emit('confirm', { toolCallId: toolCall.id, action: 'deny' })"
        >
          {{ $t('dataStudio.agent.toolConfirmation.deny') }}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          class="text-muted-foreground hover:text-destructive-text"
          @click="emit('confirm', { toolCallId: toolCall.id, action: 'deny_always' })"
        >
          {{ $t('dataStudio.agent.toolConfirmation.denyAlways') }}
        </Button>
        <span class="confirm-spacer" />
        <Button
          size="sm"
          variant="ghost"
          class="text-muted-foreground hover:text-foreground"
          @click="emit('confirm', { toolCallId: toolCall.id, action: 'cancel' })"
        >
          {{ $t('dataStudio.agent.toolConfirmation.cancel') }}
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.confirmation-card {
  border: 1px solid hsl(var(--border));
  border-left-width: 3px;
  border-radius: 8px;
  margin: 8px 0;
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  overflow: hidden;
}

.confirmation-card.risk-safe {
  border-left-color: hsl(var(--muted-foreground) / 0.5);
}

.confirmation-card.risk-elevated {
  border-color: hsl(var(--warning) / 0.45);
  border-left-color: hsl(var(--warning));
}

.confirmation-card.risk-destructive {
  border-color: hsl(var(--destructive) / 0.4);
  border-left-color: hsl(var(--destructive));
}

.confirmation-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid hsl(var(--border));
}

.header-safe {
  background: hsl(var(--muted) / 0.45);
}

.header-elevated {
  background: hsl(var(--warning) / 0.12);
  border-bottom-color: hsl(var(--warning) / 0.3);
}

.header-destructive {
  background: hsl(var(--destructive) / 0.1);
  border-bottom-color: hsl(var(--destructive) / 0.25);
}

.header-main {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.header-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.tool-name {
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Monaco, monospace;
  font-size: var(--font-size-dense);
  color: hsl(var(--muted-foreground));
  word-break: break-all;
}

.risk-description {
  margin: 4px 0 0;
  font-size: var(--font-size-dense);
  line-height: 1.4;
  color: hsl(var(--foreground) / 0.85);
}

.risk-icon-safe {
  color: hsl(var(--muted-foreground));
}

.risk-icon-elevated {
  color: hsl(var(--warning-text));
}

.risk-icon-destructive {
  color: hsl(var(--destructive-text));
}

.risk-badge {
  font-size: var(--font-size-caption);
  padding: 1px 8px;
  border-radius: 999px;
  font-weight: 600;
  line-height: 1.5;
}

.risk-badge-safe {
  background: hsl(var(--secondary));
  color: hsl(var(--secondary-foreground));
  border: 1px solid hsl(var(--border));
}

.risk-badge-elevated {
  background: hsl(var(--warning) / 0.12);
  color: hsl(var(--warning-text));
  border: 1px solid hsl(var(--warning) / 0.35);
}

.risk-badge-destructive {
  background: hsl(var(--destructive) / 0.12);
  color: hsl(var(--destructive-text));
  border: 1px solid hsl(var(--destructive) / 0.35);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  font-size: var(--font-size-caption);
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 500;
}

.status-badge-executing {
  background: hsl(var(--primary) / 0.12);
  color: hsl(var(--primary));
}

.status-badge-denied {
  background: hsl(var(--destructive) / 0.12);
  color: hsl(var(--destructive-text));
}

.status-badge-done {
  background: hsl(var(--primary) / 0.12);
  color: hsl(var(--primary));
}

.status-badge-error {
  background: hsl(var(--destructive) / 0.12);
  color: hsl(var(--destructive-text));
}

.metadata-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 16px;
  padding: 8px 12px;
  background: hsl(var(--muted) / 0.3);
  border-bottom: 1px solid hsl(var(--border) / 0.7);
  font-size: var(--font-size-dense);
}

.metadata-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.metadata-label {
  color: hsl(var(--muted-foreground));
}

.metadata-value {
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Monaco, monospace;
  color: hsl(var(--foreground));
  word-break: break-all;
}

.confirmation-body {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.code-container {
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  background: hsl(var(--background));
  overflow: hidden;
}

.code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 10px;
  background: hsl(var(--muted) / 0.45);
  border-bottom: 1px solid hsl(var(--border) / 0.7);
}

.code-label {
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Monaco, monospace;
  font-size: var(--font-size-caption);
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.code-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.code-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: var(--font-size-caption);
  color: hsl(var(--muted-foreground));
  background: transparent;
  border: none;
  cursor: pointer;
  transition:
    color 0.12s ease,
    background-color 0.12s ease;
}

.code-action-btn:hover {
  color: hsl(var(--foreground));
  background: hsl(var(--accent));
}

.confirmation-args {
  margin: 0;
  padding: 10px;
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Monaco, monospace;
  font-size: var(--font-size-dense);
  line-height: 1.5;
  overflow-x: auto;
  max-height: 240px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.confirmation-args.is-expanded {
  max-height: 480px;
}

.tool-code-content {
  display: block;
  background: transparent;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
}

.hint-banner {
  border-radius: 6px;
  border: 1px solid transparent;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--font-size-dense);
  line-height: 1.4;
}

.hint-banner-warning {
  background: hsl(var(--warning) / 0.12);
  border-color: hsl(var(--warning) / 0.35);
  color: hsl(var(--warning-text));
}

.hint-banner-destructive {
  background: hsl(var(--destructive) / 0.1);
  border-color: hsl(var(--destructive) / 0.35);
  color: hsl(var(--destructive-text));
}

.hint-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.confirmation-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding-top: 2px;
}

.confirm-spacer {
  flex: 1;
  min-width: 12px;
}
</style>
