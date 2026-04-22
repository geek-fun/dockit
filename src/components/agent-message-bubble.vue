<template>
  <div :class="['message-bubble', `message-${normalizedRole}`]">
    <div v-if="normalizedRole === 'user'" class="message-content user-content">
      <p class="whitespace-pre-wrap">{{ message.content }}</p>
    </div>

    <div v-else-if="normalizedRole === 'assistant'" class="message-content assistant-content">
      <details v-if="message.thinking" class="thinking-panel">
        <summary class="thinking-summary">
          <span class="i-carbon-idea thinking-icon" />
          <span>{{ $t('dataStudio.agent.message.thinking') }}</span>
          <span class="i-carbon-chevron-right thinking-chevron" />
        </summary>
        <pre class="thinking-body">{{ message.thinking }}</pre>
      </details>
      <div v-if="isStreaming && message.thinking && !message.content" class="thinking-indicator">
        <span class="i-carbon-idea h-3.5 w-3.5 opacity-50" />
        <span class="text-xs text-muted-foreground">
          {{ $t('dataStudio.agent.message.thinkingInProgress') }}
        </span>
      </div>
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
      <div v-if="message.toolCalls?.length" class="tool-calls">
        <div
          v-for="tc in message.toolCalls"
          :key="tc.id"
          :class="['tool-chip', `tool-${tc.status}`]"
        >
          <span :class="toolStatusIcon(tc.status)" class="h-3.5 w-3.5" />
          <span class="text-xs">{{ tc.toolName }}</span>
        </div>
      </div>
    </div>

    <div v-else-if="normalizedRole === 'tool'" class="message-content tool-content">
      <details class="tool-result-details">
        <summary class="text-xs text-muted-foreground cursor-pointer">
          {{ $t('dataStudio.agent.message.toolResult') }}
        </summary>
        <pre class="tool-result-pre">{{ formattedContent }}</pre>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import MarkdownRender from '@/components/markdown-render.vue';

const props = defineProps<{
  message: any;
}>();

const normalizedRole = computed(() => {
  const r = props.message.role;
  if (r === 'BOT' || r === 'assistant') return 'assistant';
  if (r === 'USER' || r === 'user') return 'user';
  if (r === 'tool') return 'tool';
  return 'user';
});

const isStreaming = computed(() => {
  return props.message.status === 'streaming' || props.message.status === 'SENDING';
});

const formattedContent = computed(() => {
  try {
    return JSON.stringify(JSON.parse(props.message.content), null, 2);
  } catch {
    return props.message.content;
  }
});

const toolStatusIcon = (status: string): string => {
  const iconMap: Record<string, string> = {
    pending: 'i-carbon-time',
    executing: 'i-carbon-renew animate-spin',
    done: 'i-carbon-checkmark',
    denied: 'i-carbon-close',
    error: 'i-carbon-warning',
    confirmed: 'i-carbon-checkmark',
  };
  return iconMap[status] ?? 'i-carbon-circle-dash';
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
}

.tool-content {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
  border-left: 2px solid hsl(var(--border));
  border-radius: 4px;
  max-width: 85%;
  font-size: 12px;
}

.tool-result-details {
  padding: 4px 0;
}

.tool-result-pre {
  margin-top: 8px;
  padding: 8px;
  background: hsl(var(--background));
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.4;
  overflow-x: auto;
  max-height: 300px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 4px 0;
}

.dot {
  width: 6px;
  height: 6px;
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

.tool-calls {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.thinking-panel {
  margin-bottom: 8px;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  overflow: hidden;
}

.thinking-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--background));
  user-select: none;
  list-style: none;
}

.thinking-summary::-webkit-details-marker {
  display: none;
}

.thinking-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.thinking-chevron {
  width: 12px;
  height: 12px;
  margin-left: auto;
  transition: transform 0.2s ease;
}

details[open] .thinking-chevron {
  transform: rotate(90deg);
}

.thinking-body {
  padding: 8px 10px;
  font-size: 11px;
  line-height: 1.5;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--background));
  border-top: 1px solid hsl(var(--border));
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow-y: auto;
}

.thinking-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  margin-bottom: 4px;
}

.tool-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  font-size: 12px;
}

.tool-chip.tool-done {
  border-color: hsl(var(--primary) / 0.3);
  color: hsl(var(--primary));
}

.tool-chip.tool-error {
  border-color: hsl(var(--destructive) / 0.3);
  color: hsl(var(--destructive));
}

.tool-chip.tool-denied {
  border-color: hsl(var(--muted-foreground) / 0.3);
  color: hsl(var(--muted-foreground));
}

.tool-chip.tool-executing {
  border-color: hsl(var(--primary) / 0.3);
  color: hsl(var(--primary));
}

.tool-chip.tool-pending {
  border-color: hsl(var(--muted-foreground) / 0.2);
  color: hsl(var(--muted-foreground));
}

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
