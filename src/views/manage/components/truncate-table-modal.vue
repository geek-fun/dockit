<template>
  <Dialog :open="props.show" @update:open="val => emit('update:show', val)">
    <DialogContent class="max-w-[500px]">
      <DialogHeader>
        <DialogTitle>{{ lang.t('manage.dynamo.truncateTableTitle') }}</DialogTitle>
      </DialogHeader>

      <div v-if="resultType === 'success' && resultMessage" class="text-center py-4 space-y-3">
        <div class="text-green-500 text-4xl mb-2">✓</div>
        <p class="text-sm font-medium">{{ lang.t('manage.dynamo.truncateTableSuccess') }}</p>
        <div class="truncate-summary text-xs text-gray-500">
          <div>
            {{ lang.t('manage.dynamo.truncateTotalItems') }}: {{ truncateResult?.totalItems }}
          </div>
          <div>
            {{ lang.t('manage.dynamo.truncateDeletedItems') }}: {{ truncateResult?.deletedItems }}
          </div>
          <div v-if="(truncateResult?.errors?.length ?? 0) > 0" class="text-red-500">
            {{ lang.t('manage.dynamo.truncateErrors') }}: {{ truncateResult?.errors?.length ?? 0 }}
          </div>
        </div>
      </div>

      <Alert v-else-if="resultMessage && resultType === 'error'" variant="destructive" class="mb-3">
        <AlertDescription class="flex items-center justify-between">
          <span>{{ resultMessage }}</span>
          <button class="ml-2 text-sm hover:opacity-70 cursor-pointer" @click="resultMessage = ''">
            <X class="w-4 h-4" />
          </button>
        </AlertDescription>
      </Alert>

      <div v-else-if="isTruncating" class="text-center py-4">
        <Spinner class="h-8 w-8 mx-auto mb-3" />
        <p class="text-sm font-medium">{{ lang.t('manage.dynamo.truncateTableInProgress') }}</p>
      </div>

      <div v-else class="space-y-4">
        <Alert variant="destructive">
          <AlertDescription>
            {{ lang.t('manage.dynamo.truncateTableWarning') }}
          </AlertDescription>
        </Alert>

        <div class="truncate-info text-sm">
          <p>{{ lang.t('manage.dynamo.truncateTableInfo') }}</p>
          <p class="font-medium mt-2">
            {{ lang.t('manage.dynamo.itemCount') }}: {{ formatNumber(props.itemCount) }}
          </p>
        </div>

        <div>
          <label class="text-sm font-medium mb-2 block">
            {{ lang.t('manage.dynamo.truncateTableConfirmLabel') }}
          </label>
          <Input
            v-model="confirmInput"
            :placeholder="lang.t('manage.dynamo.truncateTableConfirmPlaceholder')"
            autocapitalize="off"
            autocomplete="off"
            :spellcheck="false"
            autocorrect="off"
          />
        </div>
      </div>

      <DialogFooter class="mt-4">
        <Button variant="outline" :disabled="isTruncating" @click="handleCancel">
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
          v-else-if="!resultMessage && !isTruncating"
          variant="destructive"
          :disabled="loading || confirmInput.toLowerCase() !== 'truncate'"
          @click="handleConfirm"
        >
          <Spinner v-if="loading" class="mr-2 h-4 w-4" />
          {{ lang.t('manage.dynamo.truncateTable') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
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
import {
  useDynamoManageStore,
  DynamoDBConnection,
  TruncateResult,
  DatabaseType,
} from '../../../store';

const lang = useLang();
const dynamoManageStore = useDynamoManageStore();

interface Props {
  show: boolean;
  tableName: string;
  itemCount: number;
  connection: DynamoDBConnection;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  (e: 'truncated', result: TruncateResult): void;
}>();

const loading = ref(false);
const resultMessage = ref('');
const resultType = ref<'success' | 'error'>('success');
const confirmInput = ref('');
const isTruncating = ref(false);
const truncateResult = ref<TruncateResult | null>(null);

const formatNumber = (num: number | undefined) => {
  if (num === undefined) return '-';
  return num.toLocaleString();
};

watch(
  () => props.show,
  newVal => {
    if (newVal) {
      resultMessage.value = '';
      resultType.value = 'success';
      loading.value = false;
      confirmInput.value = '';
      isTruncating.value = false;
      truncateResult.value = null;
    }
  },
);

const handleCancel = () => {
  emit('update:show', false);
};

const handleRetry = async () => {
  resultMessage.value = '';
  await handleConfirm();
};

const handleConfirm = async () => {
  if (props.connection.type !== DatabaseType.DYNAMODB) return;
  if (confirmInput.value.toLowerCase() !== 'truncate') return;

  const startTime = Date.now();

  try {
    loading.value = true;
    isTruncating.value = true;

    const result = await dynamoManageStore.truncateTable(props.connection, props.tableName);

    truncateResult.value = result;

    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    isTruncating.value = false;
    resultType.value = 'success';
    resultMessage.value = 'success';

    setTimeout(() => {
      emit('update:show', false);
      emit('truncated', result);
    }, SUCCESS_MESSAGE_DELAY);
  } catch (error: unknown) {
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    isTruncating.value = false;
    resultType.value = 'error';
    const err = error as { details?: string; status?: number; message?: string };
    resultMessage.value = err?.details
      ? `status: ${err?.status ?? 'unknown'}, details: ${err.details}`
      : err?.message || String(error);
  } finally {
    loading.value = false;
    isTruncating.value = false;
  }
};
</script>

<style scoped>
.truncate-info {
  padding: 0.75rem;
  background: var(--gray-50);
  border-radius: 0.5rem;
}

.truncate-summary {
  padding: 0.5rem;
  background: var(--gray-50);
  border-radius: 0.5rem;
}
</style>
