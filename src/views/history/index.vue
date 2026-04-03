<template>
  <div class="history-container">
    <div class="history-container-list">
      <div v-if="entries.length > 0" class="history-list-header">
        <span class="history-list-title">{{ $t('history.title') }}</span>
        <Button variant="ghost" size="xs" @click="handleClearAll">
          <span class="i-carbon-trash-can h-4 w-4" />
        </Button>
      </div>
      <div v-if="entries.length > 0" class="history-search-bar">
        <span
          class="i-carbon-search h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2"
        />
        <Input
          v-model="searchQuery"
          :placeholder="$t('history.searchPlaceholder')"
          class="pl-7 h-7 text-xs"
        />
      </div>
      <ScrollArea v-if="entries.length > 0" class="history-scroll-area">
        <div
          v-for="entry in filteredEntries"
          :key="entry.id"
          class="history-item"
          :class="{
            active: selectedEntryId === entry.id,
            [`method-item-${entry.method.toLowerCase()}`]: true,
          }"
          @click="selectEntry(entry.id)"
        >
          <div class="history-item-header">
            <div class="history-item-left">
              <component :is="getDbIcon(entry.databaseType)" class="db-icon" />
              <Badge variant="outline" class="method-badge" :style="getMethodStyle(entry.method)">
                {{ entry.method }}
              </Badge>
            </div>
            <span class="history-item-time" :title="formatFullTime(entry.timestamp)">
              {{ formatTime(entry.timestamp) }}
            </span>
          </div>
          <div class="history-item-path" :title="getDisplayPath(entry)">
            {{ getDisplayPath(entry) }}
          </div>
          <div class="history-item-connection">
            <span class="i-carbon-plug h-3 w-3 shrink-0" />
            <span class="truncate">{{ entry.connectionName }}</span>
          </div>
        </div>
        <div v-if="filteredEntries.length === 0" class="search-empty">
          <span class="i-carbon-search h-8 w-8 text-muted-foreground/40" />
          <span class="search-empty-text">{{ $t('history.searchPlaceholder') }}</span>
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
              <span class="meta-label">{{ $t('history.type') }}</span>
              <div class="db-type-cell">
                <component :is="getDbIcon(selectedEntry.databaseType)" class="db-icon-md" />
                <span class="meta-value">
                  {{ selectedEntry.databaseType || DatabaseType.ELASTICSEARCH }}
                </span>
              </div>
            </div>
            <div class="meta-row">
              <span class="meta-label">{{ $t('history.method') }}</span>
              <Badge
                variant="outline"
                class="method-badge"
                :style="getMethodStyle(selectedEntry.method)"
              >
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
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import {
  useHistoryStore,
  useConnectionStore,
  useTabStore,
  DatabaseType,
  useDbDataStore,
} from '../../store';
import type { DynamoDBConnection } from '../../store';
import { useLang } from '../../lang';
import { useMessageService, useDialogService } from '@/composables';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import dynamoDBIcon from '../../assets/svg/dynamoDB.svg';
import elasticsearchIcon from '../../assets/svg/elasticsearch.svg';
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

const searchQuery = ref('');

const getDbIcon = (dbType?: string) =>
  dbType === DatabaseType.DYNAMODB ? dynamoDBIcon : elasticsearchIcon;

const filteredEntries = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return entries.value;
  return entries.value.filter(
    entry =>
      entry.path.toLowerCase().includes(q) ||
      (entry.index ?? '').toLowerCase().includes(q) ||
      entry.method.toLowerCase().includes(q) ||
      entry.connectionName.toLowerCase().includes(q) ||
      (entry.qdsl ?? '').toLowerCase().includes(q),
  );
});
const { activePanel, activeConnection } = storeToRefs(tabStore);

const dbDataStore = useDbDataStore();

onMounted(async () => {
  await fetchHistory();
});

const METHOD_COLORS: Record<string, string> = {
  GET: 'hsl(var(--method-get))',
  POST: 'hsl(var(--method-post))',
  PUT: 'hsl(var(--method-put))',
  DELETE: 'hsl(var(--method-delete))',
  HEAD: 'hsl(var(--method-head))',
  PartiQL: 'hsl(var(--method-get))',
  Query: 'hsl(var(--method-post))',
};

const getMethodColor = (method: string) => METHOD_COLORS[method] ?? 'hsl(0 0% 45%)';

const getMethodStyle = (method: string) => {
  const color = getMethodColor(method);
  return { color, borderColor: color };
};

const getDisplayPath = (entry: { databaseType?: string; index?: string; path: string }) => {
  if (entry.databaseType === DatabaseType.DYNAMODB) {
    return entry.index ? `${entry.path} / ${entry.index}` : entry.path;
  }
  return `/${entry.index ? entry.index + '/' : ''}${entry.path}`;
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

const buildQueryText = (entry: {
  databaseType?: string;
  method: string;
  path: string;
  index?: string;
  qdsl?: string;
}) => {
  if (entry.databaseType === DatabaseType.DYNAMODB) {
    return entry.qdsl || '';
  }
  const { method, path, index, qdsl } = entry;
  return `${method} ${index ? index + '/' : ''}${path}${qdsl ? '\n' + qdsl : ''}`;
};

const handleCopyQuery = async () => {
  if (!selectedEntry.value) return;
  const queryText = buildQueryText(selectedEntry.value);
  try {
    await navigator.clipboard.writeText(queryText);
    message.success(lang.t('editor.copySuccess'));
  } catch {
    message.error(lang.t('editor.copyFailure'));
  }
};

const handleAddToEditor = () => {
  if (!selectedEntry.value) return;
  const entry = selectedEntry.value;

  if (entry.databaseType === DatabaseType.DYNAMODB && entry.method === 'PartiQL' && entry.qdsl) {
    if (activePanel.value?.content != null) {
      const current = activePanel.value.content || '';
      activePanel.value.content = current ? current + '\n\n' + entry.qdsl : entry.qdsl;
    }
  } else if (!entry.databaseType || entry.databaseType === DatabaseType.ELASTICSEARCH) {
    const queryText = buildQueryText(entry);
    if (activePanel.value?.content != null) {
      const current = activePanel.value.content || '';
      activePanel.value.content = current ? current + '\n\n' + queryText : queryText;
    }
  }

  router.push('/connect');
};

const handleExecute = async () => {
  if (!selectedEntry.value) return;
  if (!activeConnection.value) {
    message.error(lang.t('history.noConnection'));
    return;
  }

  const entry = selectedEntry.value;

  try {
    if (entry.databaseType === DatabaseType.DYNAMODB && entry.method === 'PartiQL' && entry.qdsl) {
      await dbDataStore.executePartiqlStatement(
        activeConnection.value as DynamoDBConnection,
        entry.qdsl,
      );
    } else {
      const { method, path, index, qdsl } = entry;
      await searchQDSL(activeConnection.value, { method, path, index, qdsl });
    }
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

.history-search-bar {
  position: relative;
  padding: 6px 8px;
  border-bottom: 1px solid hsl(var(--border));
}

.history-scroll-area {
  flex: 1;
  height: 0;
}

.history-item {
  padding: 8px 12px 8px 10px;
  cursor: pointer;
  border-bottom: 1px solid hsl(var(--border));
  border-left: 2px solid transparent;
  transition:
    background-color 0.15s,
    border-left-color 0.15s;
}

.history-item:hover,
.history-item.active {
  background-color: hsl(var(--accent));
}

/* Per-method left border colors */
.history-item.method-item-get:hover,
.history-item.method-item-get.active {
  border-left-color: hsl(var(--method-get));
}
.history-item.method-item-post:hover,
.history-item.method-item-post.active {
  border-left-color: hsl(var(--method-post));
}
.history-item.method-item-put:hover,
.history-item.method-item-put.active {
  border-left-color: hsl(var(--method-put));
}
.history-item.method-item-delete:hover,
.history-item.method-item-delete.active {
  border-left-color: hsl(var(--method-delete));
}
.history-item.method-item-head:hover,
.history-item.method-item-head.active {
  border-left-color: hsl(var(--method-head));
}
.history-item.method-item-partiql:hover,
.history-item.method-item-partiql.active {
  border-left-color: hsl(var(--method-get));
}
.history-item.method-item-query:hover,
.history-item.method-item-query.active {
  border-left-color: hsl(var(--method-post));
}

.history-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.history-item-left {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.db-icon {
  width: 14px;
  height: 14px;
  object-fit: contain;
  flex-shrink: 0;
  opacity: 0.85;
}

.db-icon-md {
  width: 18px;
  height: 18px;
  object-fit: contain;
}

.db-type-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.method-badge {
  font-size: 10px;
  padding: 0 5px;
  font-weight: 600;
}

.history-item-time {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
  flex-shrink: 0;
}

.history-item-path {
  font-size: 12px;
  color: hsl(var(--foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
  margin-left: 19px;
}

.history-item-connection {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  margin-top: 3px;
  margin-left: 19px;
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
}

.search-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 16px;
}

.search-empty-text {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  text-align: center;
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
