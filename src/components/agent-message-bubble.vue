<template>
  <div :class="['message-bubble', `message-${normalizedRole}`]">
    <div v-if="normalizedRole === 'user'" class="message-content user-content">
      <p class="whitespace-pre-wrap">{{ message.content }}</p>
    </div>

    <div v-else-if="normalizedRole === 'assistant'" class="assistant-wrapper">
      <!-- Activity timeline: thinking + tool call/result pairs -->
      <div
        v-if="message.thinking || message.toolCalls?.length"
        class="activity-list"
      >
        <!-- Iteration header (only when there are tool calls → marks this as an agent loop step) -->
        <div v-if="iterationIndex !== undefined && message.toolCalls?.length" class="iteration-header">
          <span class="iteration-icon i-carbon-repeat" />
          <span class="iteration-label">{{ t('dataStudio.agent.message.iterationLabel', { n: iterationIndex + 1 }) }}</span>
        </div>

        <!-- Thinking node -->
        <details
          v-if="message.thinking"
          class="activity-item-details"
          :open="isStreaming && !message.content"
        >
          <summary class="activity-item">
            <span class="activity-bullet" :class="{ 'is-streaming': isStreaming && !message.toolCalls?.length }" />
            <span class="activity-icon i-carbon-idea" />
            <span class="activity-label">
              <span v-if="isStreaming && !message.toolCalls?.length" class="activity-label-streaming">
                {{ t('dataStudio.agent.message.thinkingInProgress') }}
                <span class="inline-dots">
                  <span class="dot" />
                  <span class="dot" />
                  <span class="dot" />
                </span>
              </span>
              <span v-else class="thinking-done-label">
                {{ t('dataStudio.agent.message.thinkingDone') }}
                <span v-if="message.thinkingDuration" class="duration-badge">
                  {{ t('dataStudio.agent.message.thinkingDuration', { s: message.thinkingDuration }) }}
                </span>
              </span>
            </span>
            <span class="activity-chevron i-carbon-chevron-down" />
          </summary>
          <div class="activity-body thinking-body">
            <MarkdownRender :markdown="message.thinking" class="markdown-body prose prose-sm max-w-none" />
          </div>
        </details>

        <div v-if="message.content && message.toolCalls?.length" class="activity-inline-content">
          <MarkdownRender :markdown="message.content" class="markdown-body prose prose-sm max-w-none" />
        </div>

        <template v-for="tc in message.toolCalls" :key="tc.id">
          <!-- Tool call node (planned action) -->
          <details class="activity-item-details">
            <summary class="activity-item">
              <span
                class="activity-bullet"
                :class="{
                  'is-executing': tc.status === 'executing',
                  'is-pending': tc.status === 'pending',
                }"
              />
              <span class="activity-icon" :class="toolIcon(tc.toolName)" />
              <span class="activity-label">{{ toolLabel(tc.toolName, tc) }}</span>
              <span v-if="tc.status === 'executing'" class="i-carbon-renew animate-spin activity-status-icon executing" />
              <span v-else-if="tc.status === 'pending'" class="i-carbon-time activity-status-icon pending" />
              <span v-else-if="tc.status === 'error'" class="i-carbon-warning activity-status-icon error" />
              <span v-else-if="tc.status === 'denied'" class="i-carbon-subtract activity-status-icon denied" />
              <span class="activity-chevron i-carbon-chevron-down" />
            </summary>
            <pre class="activity-body tool-body">{{ formatToolArgs(tc) }}</pre>
          </details>

          <!-- Result node (execute result) — sibling in timeline -->
          <details
            v-if="tc.result || tc.status === 'error' || tc.status === 'denied'"
            class="activity-item-details result-item-details"
          >
            <summary class="activity-item result-item" :class="`result-${resultStatus(tc)}`">
              <span class="activity-bullet result-bullet" :class="`result-bullet-${resultStatus(tc)}`" />
              <span
                class="activity-icon"
                :class="{
                  'i-carbon-checkmark-outline': resultStatus(tc) === 'success',
                  'i-carbon-warning': resultStatus(tc) === 'error',
                  'i-carbon-subtract': resultStatus(tc) === 'denied',
                }"
              />
              <span class="activity-label result-label" :class="`result-text-${resultStatus(tc)}`">
                <span v-if="resultStatus(tc) === 'success'">{{ t('dataStudio.agent.message.toolResultSuccess') }}</span>
                <span v-else-if="resultStatus(tc) === 'error'">{{ t('dataStudio.agent.message.toolResultError') }}</span>
                <span v-else>{{ t('dataStudio.agent.message.toolDenied') }}</span>
                <span v-if="tc.result" class="result-preview">{{ resultPreview(tc.result) }}</span>
              </span>
              <span class="activity-chevron i-carbon-chevron-down" />
            </summary>
            <pre v-if="tc.result" class="activity-body tool-body result-body">{{ tc.result }}</pre>
            <div v-else class="activity-body tool-body result-body muted-body">
              {{ tc.status === 'denied' ? t('dataStudio.agent.message.toolDenied') : t('dataStudio.agent.message.toolError') }}
            </div>
          </details>
        </template>
      </div>

      <!-- Main response content -->
      <div
        v-if="message.content || (!message.thinking && !message.toolCalls?.length && isStreaming)"
        class="message-content assistant-content"
      >
        <MarkdownRender
          v-if="message.content"
          :markdown="message.content"
          class="markdown-body prose prose-sm max-w-none"
        />
        <div v-if="isStreaming && !message.content && !message.thinking" class="typing-indicator">
          <span class="dot" />
          <span class="dot" />
          <span class="dot" />
        </div>
      </div>
    </div>

    <!-- Tool role messages are surfaced via tc.result in the assistant activity list -->
    <template v-else-if="normalizedRole === 'tool'" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import MarkdownRender from '@/components/markdown-render.vue';
import type { AgentToolCall } from '@/store/dataStudioStore';

const { t } = useI18n();

const props = defineProps<{
  message: any;
  iterationIndex?: number;
}>();

const normalizedRole = computed(() => {
  const r = props.message.role;
  if (r === 'BOT' || r === 'assistant') return 'assistant';
  if (r === 'USER' || r === 'user') return 'user';
  if (r === 'tool') return 'tool';
  return 'user';
});

const isStreaming = computed(
  () => props.message.status === 'streaming' || props.message.status === 'SENDING',
);

const resultStatus = (tc: AgentToolCall): 'success' | 'error' | 'denied' => {
  if (tc.status === 'denied') return 'denied';
  if (tc.status === 'error') return 'error';
  return 'success';
};

const resultPreview = (result: string): string => {
  const first = result.split('\n')[0].trim();
  return first.length > 60 ? first.slice(0, 60) + '…' : first;
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
  if (name.includes('write') || name.includes('create') || name.includes('save')) return 'i-carbon-edit';
  if (name.includes('read') || name.includes('open') || name.includes('view')) return 'i-carbon-document-view';
  if (name.includes('search') || name.includes('find') || name.includes('query')) return 'i-carbon-search';
  if (name.includes('delete') || name.includes('remove')) return 'i-carbon-trash-can';
  if (name.includes('execute') || name.includes('run') || name.includes('bash') || name.includes('command') || name.includes('shell')) return 'i-carbon-terminal';
  if (name.includes('list') || name.includes('index') || name.includes('indices')) return 'i-carbon-list';
  if (name.includes('update') || name.includes('edit') || name.includes('modify')) return 'i-carbon-pen';
  if (name.includes('fetch') || name.includes('http') || name.includes('request') || name.includes('web')) return 'i-carbon-cloud';
  if (name.includes('think') || name.includes('reason') || name.includes('analyze')) return 'i-carbon-idea';
  return 'i-carbon-settings';
};

const toolLabel = (toolName: string, tc: AgentToolCall): string => {
  const name = toolName.toLowerCase();
  const args = tc.args ?? {};
  const firstArg = Object.values(args)[0];
  const argStr = typeof firstArg === 'string' ? firstArg : '';
  const truncated = argStr.length > 48 ? argStr.slice(0, 48) + '...' : argStr;

  const prefix = (() => {
    if (name.includes('write') || name.includes('create')) return t('dataStudio.agent.message.toolWrote');
    if (name.includes('read') || name.includes('open')) return t('dataStudio.agent.message.toolRead');
    if (name.includes('execute') || name.includes('run') || name.includes('bash') || name.includes('command')) return t('dataStudio.agent.message.toolExecuted');
    if (name.includes('search') || name.includes('find')) return t('dataStudio.agent.message.toolSearched');
    if (name.includes('delete') || name.includes('remove')) return t('dataStudio.agent.message.toolDeleted');
    if (name.includes('update') || name.includes('edit')) return t('dataStudio.agent.message.toolUpdated');
    return null;
  })();

  if (prefix) return truncated ? `${prefix} ${truncated}` : (prefix === t('dataStudio.agent.message.toolExecuted') ? `${prefix} ${toolName}` : toolName);
  return truncated ? `${toolName} ${truncated}` : toolName;
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
  font-size: 14px;
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
  left: 7px;
  top: 12px;
  bottom: 12px;
  width: 1px;
  background: hsl(var(--border));
}

/* ── Iteration header ── */
.iteration-header {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 0 4px 0;
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
  font-size: 10px;
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
  padding: 5px 0;
  cursor: pointer;
  user-select: none;
  list-style: none;
  position: relative;
}

.activity-item::-webkit-details-marker {
  display: none;
}

.activity-bullet {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid hsl(var(--muted-foreground) / 0.35);
  background: hsl(var(--background));
  flex-shrink: 0;
  position: relative;
  z-index: 1;
  transition: border-color 0.2s, background 0.2s;
}

.activity-bullet.is-streaming,
.activity-bullet.is-executing {
  border-color: hsl(var(--primary) / 0.7);
  box-shadow: 0 0 0 2px hsl(var(--primary) / 0.12);
}

.activity-bullet.is-pending {
  border-color: hsl(var(--muted-foreground) / 0.5);
  border-style: dashed;
}

/* ── Result bullet variants ── */
.result-bullet {
  border-style: solid;
}

.result-bullet-success {
  background: hsl(var(--primary) / 0.15);
  border-color: hsl(var(--primary) / 0.5);
}

.result-bullet-error {
  background: hsl(var(--destructive) / 0.15);
  border-color: hsl(var(--destructive) / 0.5);
}

.result-bullet-denied {
  background: hsl(var(--muted-foreground) / 0.1);
  border-color: hsl(var(--muted-foreground) / 0.35);
}

/* ── Result item label colors ── */
.result-text-success {
  color: hsl(var(--primary) / 0.85) !important;
}

.result-text-error {
  color: hsl(var(--destructive) / 0.85) !important;
}

.result-text-denied {
  color: hsl(var(--muted-foreground) / 0.7) !important;
}

/* ── Result preview (inline snippet after label) ── */
.result-preview {
  margin-left: 6px;
  font-size: 11.5px;
  color: hsl(var(--muted-foreground) / 0.6);
  font-style: italic;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
  display: inline-block;
  vertical-align: middle;
}

/* ── Activity icons ── */
.activity-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: hsl(var(--muted-foreground));
}

.result-item .activity-icon {
  width: 13px;
  height: 13px;
}

.result-text-success ~ .activity-icon,
.result-item.result-success .activity-icon {
  color: hsl(var(--primary) / 0.7);
}

.result-text-error ~ .activity-icon,
.result-item.result-error .activity-icon {
  color: hsl(var(--destructive) / 0.7);
}

/* ── Activity label ── */
.activity-label {
  font-size: 13px;
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
  font-size: 10.5px;
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

/* ── Status icons ── */
.activity-status-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.activity-status-icon.executing {
  color: hsl(var(--primary));
}

.activity-status-icon.pending {
  color: hsl(var(--muted-foreground) / 0.6);
}

.activity-status-icon.error {
  color: hsl(var(--destructive));
}

.activity-status-icon.denied {
  color: hsl(var(--muted-foreground) / 0.5);
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
  margin: 0 0 4px 34px;
  padding: 6px 10px;
  font-size: 11.5px;
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
}

.activity-body.tool-body {
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Monaco, monospace;
  font-size: 11px;
}

.activity-body.result-body {
  color: hsl(var(--foreground) / 0.8);
  background: hsl(var(--muted) / 0.35);
}

.muted-body {
  font-style: italic;
  color: hsl(var(--muted-foreground) / 0.6);
}

/* ── Typing indicator ── */
.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 4px 0;
  align-items: center;
}

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
  padding: 4px 0 4px 24px;
  font-size: 13.5px;
  line-height: 1.55;
  color: hsl(var(--foreground));
}

.markdown-body
.markdown-body :deep(p) {
  margin: 0 0 8px;
}

.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(pre) {
  background: hsl(var(--background));
  border-radius: 6px;
  padding: 8px 12px;
  overflow-x: auto;
  font-size: 12px;
  margin: 8px 0;
}

.markdown-body :deep(code) {
  font-size: 12px;
  background: hsl(var(--background));
  padding: 1px 4px;
  border-radius: 3px;
}

.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 20px;
  margin: 4px 0;
}
</style>
