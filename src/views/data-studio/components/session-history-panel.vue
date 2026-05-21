<template>
  <div class="history-panel">
    <div class="history-header">
      <span class="history-title">{{ $t('dataStudio.history.title') }}</span>
      <button class="icon-btn" @click="$emit('new-session')">
        <span class="i-carbon-add h-4 w-4" />
      </button>
    </div>

    <div class="session-list">
      <div v-if="sortedSessions.length === 0" class="empty-hint">
        {{ $t('dataStudio.history.empty') }}
      </div>
      <div
        v-for="session in sortedSessions"
        :key="session.id"
        :class="['session-item', session.id === activeSessionId && 'session-item--active']"
        @click="$emit('select', session.id)"
      >
        <div class="session-item-body">
          <span class="session-name">{{ sessionLabel(session) }}</span>
          <span class="session-meta">{{ formatTime(session) }}</span>
        </div>
        <button
          class="delete-btn"
          :title="$t('dataStudio.history.delete')"
          @click.stop="$emit('delete', session.id)"
        >
          <span class="i-carbon-trash-can h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDataStudioStore, type AgentSession } from '@/store/dataStudioStore';
import { storeToRefs } from 'pinia';

defineEmits<{
  select: [sessionId: string];
  delete: [sessionId: string];
  'new-session': [];
}>();

const { t } = useI18n();
const dataStudioStore = useDataStudioStore();
const { sessions, activeSessionId, sessionMeta } = storeToRefs(dataStudioStore);

const sortedSessions = computed(() =>
  [...sessions.value].sort((a, b) => {
    const aTime = sessionMeta.value[a.id]?.updatedAt ?? 0;
    const bTime = sessionMeta.value[b.id]?.updatedAt ?? 0;
    return bTime - aTime;
  }),
);

const sessionLabel = (session: AgentSession): string => {
  const meta = sessionMeta.value[session.id];
  if (meta?.title && meta.title !== t('dataStudio.history.newSession')) return meta.title;
  const sourceLabel = session.sources
    .filter(source => !source.detached)
    .map(source => source.alias)
    .join(', ');
  if (sourceLabel) return sourceLabel;
  const firstUser = session.messages.find(m => m.role === 'user');
  if (firstUser?.content) {
    return firstUser.content.length > 40 ? firstUser.content.slice(0, 40) + '…' : firstUser.content;
  }
  return meta?.title ?? t('dataStudio.history.sessionFallback');
};

const formatTime = (session: AgentSession): string => {
  const ts = sessionMeta.value[session.id]?.updatedAt ?? 0;
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return t('dataStudio.history.yesterday');
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};
</script>

<style scoped>
.history-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid hsl(var(--border));
  flex-shrink: 0;
}

.history-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all 0.15s;
}

.icon-btn:hover {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}

.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.empty-hint {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  text-align: center;
  padding: 20px 0;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}

.session-item:hover {
  background: hsl(var(--muted));
}

.session-item--active {
  background: hsl(var(--muted));
  border-color: hsl(var(--border));
}

.session-item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.session-name {
  font-size: 13px;
  font-weight: 500;
  color: hsl(var(--foreground));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-meta {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s;
  flex-shrink: 0;
}

.session-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: hsl(var(--destructive) / 0.1);
  color: hsl(var(--destructive));
}
</style>
