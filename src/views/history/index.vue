<template>
  <div class="history-container">
    <div class="history-container-list">
      <div v-if="entries.length > 0" class="history-list-header">
        <span class="history-list-title">{{ $t('history.title') }}</span>
        <Button variant="ghost" size="xs" @click="handleClearAll">
          <span class="i-carbon-trash-can h-4 w-4" />
        </Button>
      </div>
      <ScrollArea v-if="entries.length > 0" class="history-scroll-area">
        <div
          v-for="entry in entries"
          :key="entry.id"
          class="history-item"
          :class="{ active: selectedEntryId === entry.id }"
          @click="selectEntry(entry.id)"
        >
          <div class="history-item-header">
            <Badge :variant="getMethodVariant(entry.method)">{{ entry.method }}</Badge>
            <span class="history-item-time">{{ formatTime(entry.timestamp) }}</span>
          </div>
          <div
            class="history-item-path"
            :title="`/${entry.index ? entry.index + '/' : ''}${entry.path}`"
          >
            /{{ entry.index ? entry.index + '/' : '' }}{{ entry.path }}
          </div>
          <div class="history-item-connection">{{ entry.connectionName }}</div>
        </div>
      </ScrollArea>
      <HistoryEmpty v-else />
    </div>
    <div class="history-container-details">
      <template v-if="selectedEntry">
        <div class="details-header">
          <span class="details-title">{{ $t('history.details') }}</span>
          <div class="details-actions">
            <Button variant="outline" size="xs" @click="handleCopyQuery">
              <span class="i-carbon-copy h-4 w-4 mr-1" />
              {{ $t('history.copyQuery') }}
            </Button>
            <Button variant="outline" size="xs" @click="handleAddToEditor">
              <span class="i-carbon-add h-4 w-4 mr-1" />
              {{ $t('history.addToEditor') }}
            </Button>
            <Button size="xs" @click="handleExecute">
              <span class="i-carbon-play h-4 w-4 mr-1" />
              {{ $t('history.execute') }}
            </Button>
            <Button variant="ghost" size="xs" @click="handleDelete">
              <span class="i-carbon-trash-can h-4 w-4" />
            </Button>
          </div>
        </div>
        <div class="details-body">
          <div class="details-meta">
            <div class="meta-row">
              <span class="meta-label">{{ $t('history.method') }}</span>
              <Badge :variant="getMethodVariant(selectedEntry.method)">
                {{ selectedEntry.method }}
              </Badge>
            </div>
            <div class="meta-row">
              <span class="meta-label">{{ $t('history.path') }}</span>
              <span class="meta-value">{{ selectedEntry.path }}</span>
            </div>
            <div v-if="selectedEntry.index" class="meta-row">
              <span class="meta-label">{{ $t('history.index') }}</span>
              <span class="meta-value">{{ selectedEntry.index }}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">{{ $t('history.connection') }}</span>
              <span class="meta-value">{{ selectedEntry.connectionName }}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">{{ $t('history.timestamp') }}</span>
              <span class="meta-value">{{ formatFullTime(selectedEntry.timestamp) }}</span>
            </div>
          </div>
          <div v-if="selectedEntry.qdsl" class="details-qdsl">
            <span class="meta-label">{{ $t('history.body') }}</span>
            <pre class="qdsl-content">{{ selectedEntry.qdsl }}</pre>
          </div>
        </div>
      </template>
      <HistoryEmpty v-else />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useHistoryStore, useConnectionStore, useTabStore } from '../../store';
import { useLang } from '../../lang';
import { useMessageService, useDialogService } from '@/composables';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import HistoryEmpty from './components/history-empty.vue';

const lang = useLang();
const message = useMessageService();
const dialog = useDialogService();
const router = useRouter();

const historyStore = useHistoryStore();
const { entries, selectedEntryId, selectedEntry } = storeToRefs(historyStore);
const { selectEntry, removeEntry, clearHistory, fetchHistory } = historyStore;

const connectionStore = useConnectionStore();
const { searchQDSL } = connectionStore;

const tabStore = useTabStore();
const { activePanel, activeConnection } = storeToRefs(tabStore);

onMounted(async () => {
  await fetchHistory();
});

const getMethodVariant = (method: string) => {
  const map: Record<string, string> = {
    GET: 'info',
    POST: 'success',
    PUT: 'warning',
    DELETE: 'destructive',
    HEAD: 'secondary',
  };
  return (map[method] || 'outline') as
    | 'info'
    | 'success'
    | 'warning'
    | 'destructive'
    | 'secondary'
    | 'outline';
};

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const formatFullTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleString();
};

const handleCopyQuery = async () => {
  if (!selectedEntry.value) return;
  const { method, path, index, qdsl } = selectedEntry.value;
  const queryText = `${method} ${index ? index + '/' : ''}${path}${qdsl ? '\n' + qdsl : ''}`;
  try {
    await navigator.clipboard.writeText(queryText);
    message.success(lang.t('editor.copySuccess'));
  } catch {
    message.error(lang.t('editor.copyFailure'));
  }
};

const handleAddToEditor = () => {
  if (!selectedEntry.value) return;
  const { method, path, index, qdsl } = selectedEntry.value;
  const queryText = `${method} ${index ? index + '/' : ''}${path}${qdsl ? '\n' + qdsl : ''}`;

  if (activePanel.value?.content !== undefined) {
    const current = activePanel.value.content || '';
    activePanel.value.content = current ? current + '\n\n' + queryText : queryText;
  }

  router.push('/connect');
};

const handleExecute = async () => {
  if (!selectedEntry.value) return;
  if (!activeConnection.value) {
    message.error(lang.t('history.noConnection'));
    return;
  }
  const { method, path, index, qdsl } = selectedEntry.value;
  try {
    await searchQDSL(activeConnection.value, { method, path, index, qdsl });
    message.success(lang.t('history.executeSuccess'));
    router.push('/connect');
  } catch (err) {
    const error = err as { status?: number; details?: string; message?: string };
    message.error(`${error.details || error.message || 'Query failed'}`, {
      closable: true,
      keepAliveOnHover: true,
    });
  }
};

const handleDelete = () => {
  if (!selectedEntry.value) return;
  removeEntry(selectedEntry.value.id);
};

const handleClearAll = () => {
  dialog.warning({
    title: lang.t('dialogOps.warning'),
    content: lang.t('history.clearAllConfirm'),
    positiveText: lang.t('dialogOps.confirm'),
    negativeText: lang.t('dialogOps.cancel'),
    onPositiveClick: () => {
      clearHistory();
    },
  });
};
</script>

<style scoped>
.history-container {
  height: 100%;
  width: 100%;
  display: flex;
}

.history-container-list {
  width: 280px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid hsl(var(--border));
}

.history-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid hsl(var(--border));
}

.history-list-title {
  font-size: 14px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.history-scroll-area {
  flex: 1;
  height: 0;
}

.history-item {
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid hsl(var(--border));
  transition: background-color 0.15s;
}

.history-item:hover {
  background-color: hsl(var(--accent));
}

.history-item.active {
  background-color: hsl(var(--accent));
}

.history-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.history-item-time {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.history-item-path {
  font-size: 12px;
  color: hsl(var(--foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
}

.history-item-connection {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  margin-top: 2px;
}

.history-container-details {
  flex: 1;
  width: 0;
  display: flex;
  flex-direction: column;
}

.details-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid hsl(var(--border));
}

.details-title {
  font-size: 14px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.details-actions {
  display: flex;
  gap: 6px;
}

.details-body {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.details-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.meta-label {
  font-size: 12px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
  min-width: 80px;
}

.meta-value {
  font-size: 13px;
  color: hsl(var(--foreground));
  font-family: monospace;
}

.details-qdsl {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.qdsl-content {
  background-color: hsl(var(--muted));
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  padding: 12px;
  font-size: 13px;
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-y: auto;
  max-height: 400px;
  margin: 0;
}
</style>
