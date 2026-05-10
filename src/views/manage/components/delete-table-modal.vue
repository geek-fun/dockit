<template>
  <Dialog :open="props.show" @update:open="val => emit('update:show', val)">
    <DialogContent class="max-w-[500px]">
      <DialogHeader>
        <DialogTitle>{{ lang.t('manage.dynamo.deleteTableTitle') }}</DialogTitle>
      </DialogHeader>

      <div v-if="resultType === 'success' && resultMessage" class="text-center py-4">
        <div class="text-green-500 text-4xl mb-2">✓</div>
        <p class="text-sm font-medium">{{ lang.t('manage.dynamo.deleteTableSuccess') }}</p>
      </div>

      <Alert v-else-if="resultMessage" variant="destructive" class="mb-3">
        <AlertDescription class="flex items-center justify-between">
          <span>{{ resultMessage }}</span>
          <button class="ml-2 text-sm hover:opacity-70 cursor-pointer" @click="resultMessage = ''">
            <X class="w-4 h-4" />
          </button>
        </AlertDescription>
      </Alert>

      <div v-else class="space-y-4">
        <Alert variant="destructive">
          <AlertDescription>
            {{ lang.t('manage.dynamo.deleteTableWarning') }}
          </AlertDescription>
        </Alert>

        <div class="table-summary space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-500">{{ lang.t('manage.dynamo.tableName') }}</span>
            <span class="font-medium">{{ props.tableName }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">{{ lang.t('manage.dynamo.itemCount') }}</span>
            <span class="font-medium">{{ formatNumber(props.tableInfo?.itemCount) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">{{ lang.t('manage.dynamo.tableSize') }}</span>
            <span class="font-medium">{{ formatBytes(props.tableInfo?.sizeBytes) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">{{ lang.t('manage.dynamo.indexCount') }}</span>
            <span class="font-medium">{{ props.tableInfo?.indices?.length || 0 }}</span>
          </div>
        </div>

        <div>
          <label class="text-sm font-medium mb-2 block">
            {{ lang.t('manage.dynamo.deleteTableConfirmLabel') }}
          </label>
          <Input
            v-model="confirmInput"
            :placeholder="lang.t('manage.dynamo.deleteTableConfirmPlaceholder')"
            autocapitalize="off"
            autocomplete="off"
            :spellcheck="false"
            autocorrect="off"
          />
        </div>

        <div v-if="canDelete" class="text-xs text-gray-500">
          {{ lang.t('manage.dynamo.deleteTableReady') }}
        </div>
        <div v-else-if="elapsedTime < MIN_DELAY_TIME" class="text-xs text-gray-500">
          {{ lang.t('manage.dynamo.deleteTableWait') }} ({{
            Math.ceil((MIN_DELAY_TIME - elapsedTime) / 1000)
          }}s)
        </div>
      </div>

      <DialogFooter class="mt-4">
        <Button variant="outline" :disabled="loading" @click="handleCancel">
          {{ lang.t('dialogOps.cancel') }}
        </Button>
        <Button
          v-if="resultType === 'error'"
          variant="destructive"
          :disabled="loading"
          @click="handleRetry"
        >
          <Spinner v-if="loading" class="mr-2 h-4 w-4" />
          {{ lang.t('dialogOps.retry') }}
        </Button>
        <Button
          v-else-if="!resultMessage"
          variant="destructive"
          :disabled="loading || !canDelete"
          @click="handleConfirm"
        >
          <Spinner v-if="loading" class="mr-2 h-4 w-4" />
          {{ lang.t('dialogOps.delete') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed, onUnmounted } from 'vue';
import { X } from 'lucide-vue-next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { MIN_LOADING_TIME, SUCCESS_MESSAGE_DELAY } from '../../../common';
import { useLang } from '../../../lang';
import { useDynamoManageStore, DynamoDBConnection, DatabaseType } from '../../../store';
import { DynamoDBTableInfo } from '../../../datasources';

const lang = useLang();
const dynamoManageStore = useDynamoManageStore();

const MIN_DELAY_TIME = 1000;

interface Props {
  show: boolean;
  tableName: string;
  tableInfo: DynamoDBTableInfo | undefined;
  connection: DynamoDBConnection;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  (e: 'deleted'): void;
}>();

const loading = ref(false);
const resultMessage = ref('');
const resultType = ref<'success' | 'error'>('success');
const confirmInput = ref('');
const elapsedTime = ref(0);
const timerRef = ref<ReturnType<typeof setInterval> | null>(null);

const canDelete = computed(() => {
  return (
    confirmInput.value === props.tableName && elapsedTime.value >= MIN_DELAY_TIME && !loading.value
  );
});

const formatNumber = (num: number | undefined) => {
  if (num === undefined) return '-';
  return num.toLocaleString();
};

const formatBytes = (bytes: number | undefined) => {
  if (bytes === undefined) return '-';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

watch(
  () => props.show,
  newVal => {
    if (newVal) {
      resultMessage.value = '';
      resultType.value = 'success';
      loading.value = false;
      confirmInput.value = '';
      elapsedTime.value = 0;

      timerRef.value = setInterval(() => {
        elapsedTime.value += 100;
        if (elapsedTime.value >= MIN_DELAY_TIME && timerRef.value) {
          clearInterval(timerRef.value);
          timerRef.value = null;
        }
      }, 100);
    } else {
      if (timerRef.value) {
        clearInterval(timerRef.value);
        timerRef.value = null;
      }
    }
  },
);

onUnmounted(() => {
  if (timerRef.value) {
    clearInterval(timerRef.value);
    timerRef.value = null;
  }
});

const handleCancel = () => {
  emit('update:show', false);
};

const handleRetry = async () => {
  resultMessage.value = '';
  await handleConfirm();
};

const handleConfirm = async () => {
  if (props.connection.type !== DatabaseType.DYNAMODB) return;
  if (confirmInput.value !== props.tableName) return;

  const startTime = Date.now();

  try {
    loading.value = true;

    await dynamoManageStore.deleteTable(props.connection, props.tableName);

    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    resultType.value = 'success';
    resultMessage.value = 'success';

    setTimeout(() => {
      emit('update:show', false);
      emit('deleted');
    }, SUCCESS_MESSAGE_DELAY);
  } catch (error: unknown) {
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    resultType.value = 'error';
    const err = error as { details?: string; status?: number; message?: string };
    resultMessage.value = err?.details
      ? `status: ${err?.status ?? 'unknown'}, details: ${err.details}`
      : err?.message || String(error);
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.table-summary {
  padding: 0.75rem;
  background: var(--gray-50);
  border-radius: 0.5rem;
}
</style>
