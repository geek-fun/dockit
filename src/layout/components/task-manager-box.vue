<template>
  <div class="task-manager-container">
    <div class="task-manager-header">
      <div class="header-title">{{ $t('aside.taskManager') }}</div>
      <button
        class="clear-btn"
        :disabled="!hasDismissable"
        @click="importExportStore.clearCompletedTasks()"
      >
        {{ $t('taskManager.clearCompleted') }}
      </button>
    </div>

    <div class="task-list">
      <ScrollArea class="h-full">
        <div v-if="runningTasks.length === 0" class="empty-state">
          <span class="i-carbon-task h-10 w-10 empty-icon" />
          <p class="empty-text">{{ $t('taskManager.noTasks') }}</p>
        </div>

        <div v-for="task in runningTasks" :key="task.id" class="task-card">
          <div class="task-card-header">
            <div class="task-title-row">
              <span :class="kindIconClass(task.kind)" class="h-4 w-4 task-kind-icon" />
              <span class="task-title">{{ taskTitle(task) }}</span>
            </div>
            <button
              v-if="task.status !== 'running'"
              class="dismiss-btn"
              @click="importExportStore.removeTask(task.id)"
            >
              <span class="i-carbon-close h-4 w-4" />
            </button>
          </div>

          <div class="task-meta-row">
            <span :class="statusClass(task.status)" class="status-badge">
              {{ $t(`taskManager.status.${task.status}`) }}
            </span>
            <span class="task-direction">{{ task.index }}</span>
          </div>

          <div v-if="task.status === 'running' || task.progress.complete > 0" class="task-progress">
            <Progress
              :percentage="progressPct(task)"
              :status="
                task.status === 'failed'
                  ? 'error'
                  : task.status === 'completed'
                    ? 'success'
                    : 'info'
              "
            />
            <p class="progress-label">
              {{ task.progress.complete.toLocaleString() }} /
              {{ task.progress.total.toLocaleString() }}
              {{ $t('export.documents') }}
              <span class="progress-pct">{{ progressPct(task) }}%</span>
            </p>
          </div>

          <div
            v-if="task.kind === 'import' && (task.inserted != null || task.skipped != null)"
            class="task-stats"
          >
            <span v-if="task.inserted != null" class="stat inserted">
              {{ $t('import.inserted') }}: {{ (task.inserted ?? 0).toLocaleString() }}
            </span>
            <span v-if="task.updated != null && task.updated > 0" class="stat updated">
              {{ $t('import.updated') }}: {{ task.updated.toLocaleString() }}
            </span>
            <span v-if="task.skipped != null && task.skipped > 0" class="stat skipped">
              {{ $t('import.skipped') }}: {{ task.skipped.toLocaleString() }}
            </span>
          </div>

          <div v-if="task.status === 'failed' && task.error" class="task-error">
            {{ task.error }}
          </div>

          <div class="task-footer">
            <span class="task-time">{{ formatTime(task.startTime) }}</span>
            <button class="goto-btn" @click="goToImportExport(task)">
              {{ $t('taskManager.goToTask') }}
              <span class="i-carbon-arrow-right h-3 w-3 ml-1" />
            </button>
          </div>
        </div>
      </ScrollArea>
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useImportExportStore, BackgroundTask, TaskStatus, TaskKind } from '../../store';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';

const router = useRouter();
const importExportStore = useImportExportStore();
const { runningTasks } = storeToRefs(importExportStore);

const emit = defineEmits<{ close: [] }>();

const hasDismissable = computed(() =>
  runningTasks.value.some(t => t.status === 'completed' || t.status === 'failed'),
);

const progressPct = (task: BackgroundTask) => {
  const { complete, total } = task.progress;
  if (total === 0) return 0;
  return Math.round((complete / total) * 100);
};

const taskTitle = (task: BackgroundTask) =>
  task.fileName ?? task.sourceFile?.split('/').pop() ?? task.index;

const kindIconClass = (kind: TaskKind) =>
  kind === 'import' ? 'i-carbon-upload' : 'i-carbon-download';

const statusClass = (status: TaskStatus) => {
  const map: Record<TaskStatus, string> = {
    running: 'status-running',
    completed: 'status-completed',
    failed: 'status-failed',
    pending: 'status-pending',
  };
  return map[status];
};

const formatTime = (date: Date | undefined) => {
  if (!date) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const goToImportExport = (task: BackgroundTask) => {
  emit('close');
  router.push({ path: '/import-export', query: { mode: task.kind, taskId: task.id } });
};
</script>

<style scoped>
.task-manager-container {
  height: 100%;
  width: 400px;
  display: flex;
  flex-direction: column;
  border-left: 1px solid hsl(var(--border));
}

.task-manager-header {
  height: 40px;
  padding: 0 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid hsl(var(--border));
  flex-shrink: 0;
}

.header-title {
  font-size: 18px;
  font-weight: bold;
}

.clear-btn {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: color 0.2s;
}

.clear-btn:hover:not(:disabled) {
  color: hsl(var(--foreground));
}

.clear-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.task-list {
  flex: 1;
  height: 0;
  overflow: hidden;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  gap: 12px;
}

.empty-icon {
  color: hsl(var(--muted-foreground));
  opacity: 0.4;
}

.empty-text {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  text-align: center;
}

.task-card {
  margin: 10px;
  padding: 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.task-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.task-kind-icon {
  flex-shrink: 0;
  color: hsl(var(--muted-foreground));
}

.task-title {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dismiss-btn {
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: hsl(var(--muted-foreground));
  padding: 2px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  transition: color 0.2s;
}

.dismiss-btn:hover {
  color: hsl(var(--foreground));
}

.task-meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 10px;
}

.status-running {
  background: rgba(32, 128, 240, 0.12);
  color: #2080f0;
}

.status-completed {
  background: rgba(24, 160, 88, 0.12);
  color: #18a058;
}

.status-failed {
  background: rgba(208, 48, 80, 0.12);
  color: #d03050;
}

.status-pending {
  background: rgba(240, 160, 32, 0.12);
  color: #f0a020;
}

.task-direction {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.progress-label {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  display: flex;
  justify-content: space-between;
}

.progress-pct {
  font-weight: 600;
  color: hsl(var(--foreground));
}

.task-stats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.stat {
  font-size: 11px;
  font-weight: 500;
}

.stat.inserted {
  color: #18a058;
}

.stat.updated {
  color: #2080f0;
}

.stat.skipped {
  color: #f0a020;
}

.task-error {
  font-size: 11px;
  color: #d03050;
  background: rgba(208, 48, 80, 0.06);
  border: 1px solid rgba(208, 48, 80, 0.2);
  border-radius: 4px;
  padding: 6px 8px;
  word-break: break-word;
}

.task-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.task-time {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.goto-btn {
  font-size: 11px;
  color: hsl(var(--primary));
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 0;
  transition: opacity 0.2s;
}

.goto-btn:hover {
  opacity: 0.8;
}
</style>
