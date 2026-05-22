<template>
  <div :class="['message-bubble', `message-${normalizedRole}`]">
    <div v-if="normalizedRole === 'user'" class="message-content user-content">
      <p class="whitespace-pre-wrap">{{ message.content }}</p>
    </div>

    <div v-else-if="normalizedRole === 'assistant'" class="assistant-wrapper">
      <!-- Activity timeline: thinking + tool call/result pairs -->
      <div v-if="message.thinking || message.toolCalls?.length" class="activity-list">
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
          v-if="message.thinking"
          class="activity-item-details"
          :open="isStreaming && !message.content"
        >
          <summary class="activity-item">
            <span class="activity-icon i-carbon-idea" />
            <span class="activity-label">
              <span
                v-if="isStreaming && !message.toolCalls?.length"
                class="activity-label-streaming"
              >
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
                  {{
                    t('dataStudio.agent.message.thinkingDuration', { s: message.thinkingDuration })
                  }}
                </span>
              </span>
            </span>
            <span class="activity-chevron i-carbon-chevron-down" />
          </summary>
          <div class="activity-body thinking-body">
            <MarkdownRender
              :markdown="message.thinking"
              class="markdown-body prose prose-sm max-w-none"
            />
          </div>
        </details>

        <div v-if="message.content && message.toolCalls?.length" class="activity-inline-content">
          <MarkdownRender
            :markdown="message.content"
            class="markdown-body prose prose-sm max-w-none"
          />
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
            <div class="activity-body tool-body-wrapper">
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
        </template>
      </div>

      <!-- Main response content (only when not part of an activity timeline) -->
      <div
        v-if="(message.content || isStreaming) && !message.toolCalls?.length"
        class="message-content assistant-content"
      >
        <MarkdownRender
          v-if="message.content"
          :markdown="message.content"
          class="markdown-body prose prose-sm max-w-none"
        />
        <div v-if="isStreaming && !message.content" class="typing-indicator">
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

const toolResultText = (tc: AgentToolCall): string | undefined => {
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

/* ── Tool name badge ── */
.tool-name-badge {
  font-size: 11.5px;
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
  font-size: 12px;
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

.activity-status-icon.denied {
  color: hsl(var(--muted-foreground) / 0.5);
}

/* ── Inline result preview ── */
.result-preview {
  font-size: 11.5px;
  color: hsl(var(--muted-foreground) / 0.55);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
  flex-shrink: 1;
  min-width: 0;
}

.result-preview-error {
  color: hsl(var(--destructive) / 0.7);
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
  font-size: 11px;
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

.result-body-error {
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
  font-size: 11px;
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
  padding: 4px 0 4px 20px;
  font-size: 13.5px;
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
