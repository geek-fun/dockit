<template>
  <div
    v-if="normalizedRole !== 'tool'"
    :class="[
      'message-bubble',
      `message-${normalizedRole}`,
      normalizedRole === 'system' ? 'message-system' : '',
      message.status === 'error' ? 'message-error' : '',
    ]"
  >
    <div v-if="normalizedRole === 'user'" class="message-content user-content">
      <p class="whitespace-pre-wrap">{{ message.content }}</p>
    </div>

    <div
      v-else-if="normalizedRole === 'system' && message.compactionInProgress"
      class="compaction-marker compaction-marker--in-progress"
    >
      <div class="compaction-row">
        <span class="compaction-icon i-carbon-archive compaction-icon-pulsing" />
        <span class="compaction-label">
          {{ t('dataStudio.agent.message.compactionInProgress') }}
          <span class="inline-dots">
            <span class="dot" />
            <span class="dot" />
            <span class="dot" />
          </span>
        </span>
      </div>
    </div>
    <div
      v-else-if="normalizedRole === 'system' && message.preparingInProgress"
      class="compaction-marker compaction-marker--in-progress"
    >
      <div class="compaction-row">
        <span class="compaction-icon i-carbon-circle-dash compaction-icon-pulsing" />
        <span class="compaction-label">
          {{ t('dataStudio.agent.message.preparingInProgress') }}
          <span class="inline-dots">
            <span class="dot" />
            <span class="dot" />
            <span class="dot" />
          </span>
        </span>
      </div>
    </div>
    <div v-else-if="normalizedRole === 'system' && message.compaction" class="compaction-marker">
      <div class="compaction-row">
        <span class="compaction-icon i-carbon-archive" />
        <span class="compaction-label">
          {{
            t('dataStudio.agent.message.compactionLabel', {
              trigger: t(
                `dataStudio.agent.message.compactionTrigger.${message.compaction.trigger}`,
              ),
            })
          }}
        </span>
        <span class="compaction-delta">
          {{ formatTokens(message.compaction.preTokens) }}
          <span class="i-carbon-arrow-right delta-arrow" />
          {{ formatTokens(message.compaction.postTokens) }}
          <span class="delta-saved">
            -{{
              formatTokens(
                Math.max(0, message.compaction.preTokens - message.compaction.postTokens),
              )
            }}
          </span>
        </span>
        <button
          v-if="message.compaction.summary"
          class="compaction-toggle"
          @click="summaryOpen = !summaryOpen"
        >
          <span class="i-carbon-chevron-down compaction-chevron" :class="{ open: summaryOpen }" />
          {{ t('dataStudio.agent.message.compactionSummary') }}
        </button>
      </div>
      <div v-if="message.compaction.summary" v-show="summaryOpen" class="compaction-summary-body">
        <MarkdownRender :markdown="message.compaction.summary" class="markdown-body" />
      </div>
    </div>
    <div v-else-if="normalizedRole === 'assistant'" class="assistant-wrapper">
      <!-- Activity timeline: thinking + tool call/result pairs -->
      <div
        v-if="message.thinking || message.toolCalls?.length || isStreaming"
        class="activity-list"
      >
        <!-- Iteration header (only when there are tool calls → marks this as an agent loop step) -->
        <div
          v-if="iterationIndex !== undefined && message.toolCalls?.length"
          class="iteration-header"
        >
          <span class="iteration-icon i-carbon-repeat" />
          <span class="iteration-label">
            {{ t('dataStudio.agent.message.iterationLabel', { n: iterationIndex + 1 }) }}
          </span>
        </div>

        <!-- Thinking node -->
        <details
          v-if="message.thinking || isStreaming"
          class="activity-item-details"
          :open="isStreaming && !message.content && !!message.thinking"
        >
          <summary class="activity-item">
            <span
              class="activity-icon i-carbon-idea"
              :class="{ 'activity-icon-pulsing': activeState === 'waiting' }"
            />
            <span class="activity-label">
              <span v-if="activeState === 'waiting'" class="activity-label-streaming">
                {{ t('dataStudio.agent.message.waitingForModel') }}
                <span class="inline-dots">
                  <span class="dot" />
                  <span class="dot" />
                  <span class="dot" />
                </span>
              </span>
              <span v-else-if="activeState === 'thinking'" class="activity-label-streaming">
                {{ t('dataStudio.agent.message.thinkingInProgress') }}
                <span class="inline-dots">
                  <span class="dot" />
                  <span class="dot" />
                  <span class="dot" />
                </span>
              </span>
              <span v-else-if="activeState === 'generating'" class="activity-label-streaming">
                {{ t('dataStudio.agent.message.generating') }}
                <span class="inline-dots">
                  <span class="dot" />
                  <span class="dot" />
                  <span class="dot" />
                </span>
              </span>
              <span v-else-if="activeState === 'awaitingConfirm'" class="activity-label-streaming">
                {{ t('dataStudio.agent.message.awaitingConfirm', { tool: activeToolName }) }}
              </span>
              <span v-else-if="activeState === 'executing'" class="activity-label-streaming">
                {{ t('dataStudio.agent.message.executingTool', { tool: activeToolName }) }}
                <span class="inline-dots">
                  <span class="dot" />
                  <span class="dot" />
                  <span class="dot" />
                </span>
              </span>
              <span v-else class="thinking-done-label">
                {{ t('dataStudio.agent.message.thinkingDone') }}
                <span v-if="message.thinkingDuration" class="duration-badge">
                  {{
                    t('dataStudio.agent.message.thinkingDuration', { s: message.thinkingDuration })
                  }}
                </span>
              </span>
            </span>
            <span v-if="message.thinking" class="activity-chevron i-carbon-chevron-down" />
          </summary>
          <div v-if="message.thinking" v-auto-stick class="activity-body thinking-body">
            <MarkdownRender :markdown="message.thinking" class="markdown-body" />
          </div>
        </details>

        <div v-if="message.content && message.toolCalls?.length" class="activity-inline-content">
          <MarkdownRender :markdown="message.content" class="markdown-body" />
        </div>

        <template v-for="tc in message.toolCalls" :key="tc.id">
          <!-- Tool call row: icon | tool-name | verb+target | status | duration? | preview | chevron -->
          <details class="activity-item-details">
            <summary class="activity-item">
              <span class="activity-icon" :class="toolIcon(tc.toolName)" />
              <span class="tool-name-badge">{{ tc.toolName }}</span>
              <span class="activity-label tool-verb-label">{{ toolVerb(tc.toolName, tc) }}</span>
              <span
                v-if="tc.status === 'executing'"
                class="i-carbon-renew animate-spin activity-status-icon executing"
              />
              <span
                v-else-if="tc.status === 'pending'"
                class="i-carbon-time activity-status-icon pending"
              />
              <span
                v-else-if="tc.status === 'done'"
                class="i-carbon-checkmark activity-status-icon done"
              />
              <span
                v-else-if="tc.status === 'error'"
                class="i-carbon-warning activity-status-icon error"
              />
              <span
                v-else-if="tc.status === 'denied'"
                class="i-carbon-subtract activity-status-icon denied"
              />
              <span
                v-if="tc.durationMs !== undefined && tc.status === 'done'"
                class="duration-badge"
              >
                {{ formatDuration(tc.durationMs) }}
              </span>
              <span
                v-if="
                  tc.status !== 'denied' &&
                  toolResultText(tc) &&
                  (tc.status === 'done' || tc.status === 'error' || tc.status === 'denied')
                "
                class="result-preview"
                :class="`result-preview-${resultStatus(tc)}`"
              >
                {{ resultPreview(toolResultText(tc)!) }}
              </span>
              <span class="activity-chevron i-carbon-chevron-down" />
            </summary>
            <div v-auto-stick class="activity-body tool-body-wrapper">
              <pre class="tool-args-pre">{{ formatToolArgs(tc) }}</pre>
              <pre
                v-if="toolResultText(tc)"
                class="tool-result-pre"
                :class="[
                  `result-body-${resultStatus(tc)}`,
                  tc.status !== 'done' ? 'muted-body' : '',
                ]"
                >{{ toolResultText(tc) }}</pre
              >
            </div>
          </details>
          <div
            v-if="tc.status === 'denied' || tc.status === 'error' || tc.status === 'interrupted'"
            class="tool-outcome-notice"
            :class="{
              'tool-outcome-notice--rejected':
                tc.denial?.kind === 'user' || tc.status === 'interrupted',
            }"
            :role="historical ? 'status' : 'alert'"
            :aria-live="historical ? 'off' : 'assertive'"
          >
            <span aria-hidden="true" class="i-carbon-warning shrink-0 h-4 w-4" />
            <div class="min-w-0 space-y-2">
              <p class="leading-relaxed font-medium">
                {{ outcomeTitle(tc) }}
              </p>
              <p v-if="connectionLabel(tc)" class="text-xs text-foreground break-words">
                {{ t('dataStudio.agent.message.connectionLabel', { name: connectionLabel(tc) }) }}
                <span v-if="tc.denial?.action">
                  ·
                  {{
                    t('dataStudio.agent.message.requiredAction', {
                      action: t(`aiPermissions.${tc.denial.action}`),
                    })
                  }}
                </span>
              </p>
              <p
                v-if="
                  tc.status === 'denied' &&
                  tc.denial?.kind !== 'user' &&
                  tc.denial?.kind !== 'unavailable'
                "
                class="text-xs text-foreground leading-relaxed"
              >
                {{ t(`dataStudio.agent.message.denialSource.${tc.denial?.source ?? 'unknown'}`) }}
              </p>
              <p
                v-if="tc.denial?.kind === 'unavailable'"
                class="text-xs text-foreground leading-relaxed"
              >
                {{ tc.denial.message }}
              </p>
              <div
                v-if="tc.status === 'denied' || tc.denial?.kind === 'unavailable'"
                class="flex flex-wrap gap-2"
              >
                <Button
                  v-if="!tc.denial || ['permission', 'rule'].includes(tc.denial.kind)"
                  type="button"
                  variant="outline"
                  size="sm"
                  class="text-foreground"
                  :disabled="!canRetry"
                  @click="emit('reviewPermissions', tc)"
                >
                  {{ t('dataStudio.agent.message.reviewPermissions') }}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  class="text-foreground"
                  :disabled="!canRetry"
                  @click="emit('retryToolCall', tc)"
                >
                  {{ t('dataStudio.agent.message.retryRequest') }}
                </Button>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Main response content (only when not part of an activity timeline) -->
      <div
        v-if="message.content && !message.toolCalls?.length"
        class="message-content assistant-content"
      >
        <MarkdownRender :markdown="message.content" class="markdown-body" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, type Directive } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/components/ui/button';
import { useConnectionStore } from '@/store';
import MarkdownRender from '@/components/markdown-render.vue';
import { useDataStudioStore } from '@/store/dataStudioStore';
import type { AgentToolCall } from '@/store/dataStudioStore';

const { t } = useI18n();
const dataStudioStore = useDataStudioStore();

const emit = defineEmits<{
  reviewPermissions: [toolCall: AgentToolCall];
  retryToolCall: [toolCall: AgentToolCall];
}>();
const connectionStore = useConnectionStore();
const connectionLabel = (call: AgentToolCall) => {
  const id = call.denial?.connectionId;
  if (id)
    return connectionStore.connections.find(connection => String(connection.id) === id)?.name ?? id;
  const argument = call.args?.connection_id;
  return typeof argument === 'string' || typeof argument === 'number' ? String(argument) : '';
};
const outcomeTitle = (call: AgentToolCall) => {
  const key =
    call.status === 'denied'
      ? call.denial?.kind === 'user'
        ? 'rejectedNotice'
        : call.denial?.kind === 'unavailable'
          ? 'unavailableNotice'
          : props.historical
            ? 'historicalBlockedNotice'
            : 'blockedNotice'
      : call.status === 'interrupted'
        ? 'interruptedNotice'
        : 'toolError';
  return t(`dataStudio.agent.message.${key}`);
};

const summaryOpen = ref(false);

const STICK_THRESHOLD_PX = 24;
const stickState = new WeakMap<HTMLElement, { stick: boolean; handler: () => void }>();

const isNearBottom = (el: HTMLElement) =>
  el.scrollHeight - (el.scrollTop + el.clientHeight) <= STICK_THRESHOLD_PX;

const vAutoStick: Directive<HTMLElement> = {
  mounted(el) {
    const handler = () => {
      const state = stickState.get(el);
      if (state) state.stick = isNearBottom(el);
    };
    stickState.set(el, { stick: true, handler });
    el.addEventListener('scroll', handler, { passive: true });
    el.scrollTop = el.scrollHeight;
  },
  updated(el) {
    const state = stickState.get(el);
    if (state?.stick) el.scrollTop = el.scrollHeight;
  },
  unmounted(el) {
    const state = stickState.get(el);
    if (state) el.removeEventListener('scroll', state.handler);
    stickState.delete(el);
  },
};

const props = defineProps<{
  message: any;
  iterationIndex?: number;
  canRetry?: boolean;
  historical?: boolean;
}>();

const normalizedRole = computed(() => {
  const r = props.message.role;
  if (r === 'BOT' || r === 'assistant') return 'assistant';
  if (r === 'USER' || r === 'user') return 'user';
  if (r === 'tool') return 'tool';
  if (r === 'system') return 'system';
  return 'user';
});

const isStreaming = computed(
  () => props.message.status === 'streaming' || props.message.status === 'SENDING',
);

const activeState = computed<
  'waiting' | 'thinking' | 'generating' | 'awaitingConfirm' | 'executing' | 'done'
>(() => {
  if (!isStreaming.value) return 'done';
  const toolCalls: AgentToolCall[] = props.message.toolCalls ?? [];
  if (toolCalls.some(tc => tc.status === 'executing')) return 'executing';
  if (toolCalls.some(tc => tc.status === 'pending')) return 'awaitingConfirm';
  if ((props.message.content ?? '').length > 0) return 'generating';
  if ((props.message.thinking ?? '').length > 0) return 'thinking';
  return 'waiting';
});

const activeToolName = computed(() => {
  const toolCalls: AgentToolCall[] = props.message.toolCalls ?? [];
  return (
    toolCalls.find(tc => tc.status === 'executing')?.toolName ??
    toolCalls.find(tc => tc.status === 'pending')?.toolName ??
    ''
  );
});

const resultStatus = (tc: AgentToolCall): 'success' | 'error' | 'denied' => {
  if (tc.status === 'denied') return 'denied';
  if (tc.status === 'error' || tc.status === 'interrupted') return 'error';
  return 'success';
};

const toolResultText = (tc: AgentToolCall): string | undefined => {
  if (tc.resultTruncated) {
    const full = dataStudioStore.getToolResultFullBody(tc.id);
    if (full) return full;
  }
  if (tc.result) return tc.result;
  if (tc.status === 'denied') return t('dataStudio.agent.message.toolDenied');
  if (tc.status === 'error') return t('dataStudio.agent.message.toolError');
  return undefined;
};

const resultPreview = (text: string): string => {
  const first = text.split('\n')[0].trim();
  return first.length > 60 ? first.slice(0, 60) + '…' : first;
};

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const formatTokens = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
};

const formatToolArgs = (tc: AgentToolCall): string => {
  if (!tc.args || !Object.keys(tc.args).length) return tc.toolName;
  try {
    return JSON.stringify(tc.args, null, 2);
  } catch {
    return String(tc.args);
  }
};

const toolIcon = (toolName: string): string => {
  const name = toolName.toLowerCase();
  if (name.includes('delete') || name.includes('remove')) return 'i-carbon-trash-can';
  if (
    name.includes('index_document') ||
    name.includes('insert') ||
    name.includes('put') ||
    name.includes('create') ||
    name.includes('write') ||
    name.includes('save')
  )
    return 'i-carbon-edit';
  if (name.includes('update') || name.includes('edit') || name.includes('modify'))
    return 'i-carbon-pen';
  if (name.includes('search') || name.includes('query') || name.includes('find'))
    return 'i-carbon-search';
  if (name.includes('read') || name.includes('open') || name.includes('view'))
    return 'i-carbon-document-view';
  if (
    name.includes('list') ||
    name.includes('indices') ||
    name.includes('index') ||
    name.includes('describe')
  )
    return 'i-carbon-list';
  if (
    name.includes('execute') ||
    name.includes('run') ||
    name.includes('bash') ||
    name.includes('command') ||
    name.includes('shell')
  )
    return 'i-carbon-terminal';
  if (
    name.includes('fetch') ||
    name.includes('http') ||
    name.includes('request') ||
    name.includes('web')
  )
    return 'i-carbon-cloud';
  if (name.includes('get')) return 'i-carbon-document-view';
  return 'i-carbon-data-base';
};

const toolVerb = (toolName: string, tc: AgentToolCall): string => {
  if (tc.status === 'denied')
    return t(
      `dataStudio.agent.message.${tc.denial?.kind === 'user' ? 'toolRejected' : 'toolBlocked'}`,
    );
  if (tc.status === 'error') return t('dataStudio.agent.message.toolError');
  if (tc.status === 'interrupted') return t('dataStudio.agent.message.interruptedNotice');
  if (tc.status !== 'done')
    return t(
      `dataStudio.agent.message.${tc.status === 'pending' ? 'awaitingConfirm' : 'executingTool'}`,
      { tool: toolName },
    );
  const name = toolName.toLowerCase();
  const args = tc.args ?? {};
  const displayArg =
    Object.entries(args)
      .filter(([k]) => k !== 'connection_id')
      .map(([, v]) => (typeof v === 'string' ? v : undefined))
      .find(v => v !== undefined) ?? '';
  const truncated = displayArg.length > 40 ? displayArg.slice(0, 40) + '...' : displayArg;

  const verb = (() => {
    if (
      name.includes('index_document') ||
      name.includes('create') ||
      name.includes('write') ||
      name.includes('insert') ||
      name.includes('put')
    )
      return t('dataStudio.agent.message.toolWrote');
    if (name.includes('delete') || name.includes('remove'))
      return t('dataStudio.agent.message.toolDeleted');
    if (name.includes('update') || name.includes('edit') || name.includes('modify'))
      return t('dataStudio.agent.message.toolUpdated');
    if (
      name.includes('search') ||
      name.includes('query') ||
      name.includes('find') ||
      name.includes('get')
    )
      return t('dataStudio.agent.message.toolSearched');
    if (
      name.includes('read') ||
      name.includes('open') ||
      name.includes('view') ||
      name.includes('list') ||
      name.includes('indices') ||
      name.includes('index') ||
      name.includes('describe')
    )
      return t('dataStudio.agent.message.toolRead');
    if (
      name.includes('execute') ||
      name.includes('run') ||
      name.includes('bash') ||
      name.includes('command')
    )
      return t('dataStudio.agent.message.toolExecuted');
    return null;
  })();

  if (!verb && !truncated) return '';
  if (!verb) return truncated;
  return truncated ? `${verb} ${truncated}` : verb;
};
</script>

<style scoped>
.message-bubble {
  display: flex;
  margin-bottom: 16px;
}

.message-bubble.message-user {
  justify-content: flex-end;
}

.message-bubble.message-assistant,
.message-bubble.message-tool {
  justify-content: flex-start;
}

.assistant-wrapper {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.message-content {
  max-width: 85%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: var(--font-size-form);
  line-height: 1.5;
}

.user-content {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border-bottom-right-radius: 4px;
}

.assistant-content {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
  border-bottom-left-radius: 4px;
  max-width: 100%;
}

.message-error .assistant-content {
  background: hsl(var(--destructive) / 0.08);
  border: 1px solid hsl(var(--destructive) / 0.3);
  color: hsl(var(--destructive));
}

/* ── Activity timeline ── */
.activity-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 2px 0 6px 0;
  width: 100%;
  position: relative;
}

/* Vertical spine connecting all items */
.activity-list::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 8px;
  bottom: 8px;
  width: 1px;
  background: hsl(var(--border));
}

/* ── Iteration header ── */
.iteration-header {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 0 4px 20px;
  margin-bottom: 1px;
}

.iteration-icon {
  width: 10px;
  height: 10px;
  color: hsl(var(--muted-foreground) / 0.5);
  flex-shrink: 0;
  /* Align with the spine */
  margin-left: 2px;
  position: relative;
  z-index: 1;
}

.iteration-label {
  font-size: var(--font-size-caption);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground) / 0.45);
  user-select: none;
}

/* ── Activity items ── */
.activity-item-details {
  width: 100%;
  min-width: 0;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0 4px 20px;
  cursor: pointer;
  user-select: none;
  list-style: none;
  position: relative;
}

.activity-item::-webkit-details-marker {
  display: none;
}

/* ── Activity icons ── */
.activity-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: hsl(var(--muted-foreground));
}

/* ── Activity label ── */
.activity-label {
  font-size: var(--font-size-body);
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0;
}

.activity-label-streaming {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.thinking-done-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* ── Duration badge ── */
.duration-badge {
  font-size: var(--font-size-caption);
  font-weight: 500;
  color: hsl(var(--muted-foreground) / 0.55);
  background: hsl(var(--muted));
  padding: 1px 6px;
  border-radius: 9px;
  letter-spacing: 0.02em;
  flex-shrink: 0;
}

/* ── Inline dots (streaming) ── */
.inline-dots {
  display: inline-flex;
  gap: 3px;
  align-items: center;
}

/* ── Tool name badge ── */
.tool-name-badge {
  font-size: var(--font-size-dense);
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Monaco, monospace;
  color: hsl(var(--foreground) / 0.75);
  background: hsl(var(--muted));
  border: 1px solid hsl(var(--border) / 0.6);
  padding: 1px 5px;
  border-radius: 4px;
  flex-shrink: 0;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Tool verb label (secondary) ── */
.tool-verb-label {
  font-size: var(--font-size-dense);
  color: hsl(var(--muted-foreground) / 0.7);
}

/* ── Status icons ── */
.activity-status-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.activity-status-icon.executing {
  color: hsl(var(--primary));
}

.activity-status-icon.done {
  color: hsl(142 72% 45%);
}

.activity-status-icon.pending {
  color: hsl(var(--muted-foreground) / 0.6);
}

.activity-status-icon.error {
  color: hsl(var(--destructive));
}

/* ── Inline result preview ── */
.result-preview {
  font-size: var(--font-size-dense);
  color: hsl(var(--muted-foreground) / 0.55);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
  flex-shrink: 1;
  min-width: 0;
}

/* ── Tool body (expanded) ── */
.tool-body-wrapper {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tool-args-pre,
.tool-result-pre {
  margin: 0;
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Monaco, monospace;
  font-size: var(--font-size-dense);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-wrap: anywhere;
}

.tool-result-pre {
  color: hsl(var(--foreground) / 0.8);
  background: hsl(var(--muted) / 0.35);
  padding: 4px 8px;
  border-radius: 4px;
}

.result-body-error,
.result-body-denied {
  color: hsl(var(--destructive) / 0.8);
}

/* ── Chevrons ── */
.activity-chevron {
  width: 11px;
  height: 11px;
  color: hsl(var(--muted-foreground) / 0.4);
  flex-shrink: 0;
  transition: transform 0.18s ease;
}

details[open] .activity-chevron {
  transform: rotate(180deg);
}

/* ── Activity bodies ── */
.activity-body {
  margin: 0 0 4px 42px;
  padding: 6px 10px;
  font-size: var(--font-size-dense);
  line-height: 1.6;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted) / 0.5);
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-wrap: anywhere;
  max-height: 260px;
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
}

.activity-body.thinking-body {
  font-style: italic;
  opacity: 0.85;
  line-height: 1.45;
  padding: 4px 8px;
}

/* Collapse prose paragraph margins inside the compact thinking block */
.activity-body.thinking-body :deep(p) {
  margin-top: 0.15em;
  margin-bottom: 0.15em;
}

.activity-body.thinking-body :deep(p:first-child) {
  margin-top: 0;
}

.activity-body.thinking-body :deep(p:last-child) {
  margin-bottom: 0;
}

.activity-body.tool-body {
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Monaco, monospace;
  font-size: var(--font-size-dense);
}

.muted-body {
  font-style: italic;
  color: hsl(var(--muted-foreground) / 0.6);
}

/* ── Typing indicator dots ── */
.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: hsl(var(--muted-foreground));
  animation: typing-bounce 1.4s infinite ease-in-out both;
}

.dot:nth-child(1) {
  animation-delay: -0.32s;
}

.dot:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes typing-bounce {
  0%,
  80%,
  100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}

.activity-inline-content {
  padding: 4px 0 4px 20px;
  font-size: var(--font-size-body);
  line-height: 1.55;
  color: hsl(var(--foreground));
}

.markdown-body .markdown-body :deep(p) {
  margin: 0 0 8px;
}

.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(pre) {
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  margin: 8px 0;
  overflow: hidden;
}

.markdown-body :deep(pre code) {
  font-size: var(--font-size-dense);
  background: none;
  padding: 0;
  border: none;
  font-weight: 400;
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
  font-size: var(--font-size-dense);
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid hsl(var(--border));
  padding: 5px 10px;
  text-align: left;
}

.markdown-body :deep(th) {
  background: hsl(var(--muted));
  font-weight: 600;
  color: hsl(var(--foreground));
}

.markdown-body :deep(tr:nth-child(even) td) {
  background: hsl(var(--muted) / 0.4);
}

/* ── Markdown typography (GitHub-like) ──────────────────────────── */

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  margin-top: 16px;
  margin-bottom: 8px;
  font-weight: 600;
  line-height: 1.3;
  color: hsl(var(--foreground));
}

.markdown-body :deep(h1) {
  font-size: var(--font-size-page-title);
  margin-top: 24px;
  margin-bottom: 12px;
  border-bottom: 1px solid hsl(var(--border));
  padding-bottom: 6px;
}
.markdown-body :deep(h2) {
  font-size: var(--font-size-title);
  margin-top: 20px;
  margin-bottom: 10px;
  border-bottom: 1px solid hsl(var(--border));
  padding-bottom: 4px;
}
.markdown-body :deep(h3) {
  font-size: var(--font-size-form);
  margin-top: 18px;
}
.markdown-body :deep(h4) {
  font-size: var(--font-size-body);
  margin-top: 16px;
}
.markdown-body :deep(h5) {
  font-size: var(--font-size-dense);
  margin-top: 14px;
}
.markdown-body :deep(h6) {
  font-size: var(--font-size-caption);
  margin-top: 14px;
  color: hsl(var(--muted-foreground));
}

.markdown-body :deep(strong) {
  font-weight: 600;
  color: hsl(var(--foreground));
}

.markdown-body :deep(em) {
  font-style: italic;
}

.markdown-body :deep(a) {
  color: hsl(var(--primary));
  text-decoration: underline;
  text-underline-offset: 2px;
}

.markdown-body :deep(blockquote) {
  margin: 8px 0;
  padding: 4px 14px;
  border-left: 3px solid hsl(var(--border));
  color: hsl(var(--muted-foreground) / 0.85);
}

.markdown-body :deep(blockquote p) {
  margin: 4px 0;
}

.markdown-body :deep(hr) {
  height: 1px;
  padding: 0;
  margin: 16px 0;
  background-color: hsl(var(--border));
  border: 0;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 20px;
  margin: 4px 0;
}

.markdown-body :deep(li) {
  margin: 2px 0;
}

.markdown-body :deep(li > ul),
.markdown-body :deep(li > ol) {
  margin: 0;
}

.markdown-body :deep(del) {
  text-decoration: line-through;
  opacity: 0.6;
}

/* ── Task list checkboxes ── */
.markdown-body :deep(.task-list-item) {
  list-style: none;
  margin-left: -20px;
}

.markdown-body :deep(.task-list-item input[type='checkbox']) {
  margin: 0 6px 0 0;
  accent-color: hsl(var(--primary));
  width: 14px;
  height: 14px;
  vertical-align: middle;
  cursor: default;
}

/* ── Link hover ── */
.markdown-body :deep(a:hover) {
  text-decoration: underline;
  opacity: 0.85;
}
.message-bubble.message-system {
  justify-content: stretch;
  margin-bottom: 12px;
}

.compaction-marker {
  display: block;
  margin: 4px 0;
}

.compaction-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: hsl(var(--muted) / 0.4);
  border: 1px solid hsl(var(--border) / 0.5);
  border-radius: 8px;
  max-width: fit-content;
  font-size: var(--font-size-dense);
  color: hsl(var(--muted-foreground));
}

.compaction-icon {
  width: 12px;
  height: 12px;
  color: hsl(var(--muted-foreground) / 0.7);
  flex-shrink: 0;
}

.compaction-label {
  font-weight: 500;
  letter-spacing: 0.01em;
}

.compaction-delta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Monaco, monospace;
  font-size: var(--font-size-dense);
  color: hsl(var(--foreground) / 0.75);
  padding: 1px 8px;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border) / 0.5);
  border-radius: 8px;
}

.delta-arrow {
  width: 10px;
  height: 10px;
  color: hsl(var(--muted-foreground) / 0.6);
}

.delta-saved {
  margin-left: 4px;
  padding-left: 6px;
  border-left: 1px solid hsl(var(--border) / 0.6);
  color: hsl(142 72% 38%);
  font-weight: 600;
}

.compaction-toggle {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--font-size-dense);
  color: hsl(var(--muted-foreground) / 0.8);
  padding: 0;
  margin-left: 4px;
}

.compaction-chevron {
  width: 10px;
  height: 10px;
  transition: transform 0.18s ease;
}

.compaction-chevron.open {
  transform: rotate(180deg);
}

.compaction-summary-body {
  margin-top: 6px;
  padding: 8px 12px;
  background: hsl(var(--muted) / 0.4);
  border-radius: 8px;
  font-size: var(--font-size-dense);
  line-height: 1.55;
  color: hsl(var(--foreground) / 0.85);
  max-height: 240px;
  overflow-y: auto;
  max-width: 600px;
}

.activity-icon-pulsing {
  animation: subtle-pulse 1.8s ease-in-out infinite;
}
@keyframes subtle-pulse {
  0%,
  100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}
.compaction-icon-pulsing {
  animation: compaction-pulse 1.4s ease-in-out infinite;
}
@keyframes compaction-pulse {
  0%,
  100% {
    opacity: 0.5;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
  }
}
.compaction-marker--in-progress .compaction-row {
  background: hsl(var(--muted) / 0.55);
  border-color: hsl(var(--primary) / 0.3);
}
.activity-status-icon.denied,
.result-preview-denied,
.result-preview-error,
.tool-result-pre.result-body-denied,
.tool-result-pre.result-body-error {
  color: color-mix(in srgb, hsl(var(--destructive)) 65%, hsl(var(--foreground)));
}

.tool-outcome-notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 4px 0 12px 20px;
  padding: 10px 12px;
  border: 1px solid hsl(var(--destructive) / 0.35);
  border-radius: 6px;
  background: hsl(var(--destructive) / 0.06);
  color: color-mix(in srgb, hsl(var(--destructive)) 65%, hsl(var(--foreground)));
  font-size: var(--font-size-body);
  overflow-wrap: anywhere;
}

.tool-outcome-notice--rejected {
  border-color: hsl(var(--border));
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}
</style>
