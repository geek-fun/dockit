<template>
  <Dialog :open="props.show" @update:open="val => emit('update:show', val)">
    <DialogContent class="max-w-[400px]">
      <DialogHeader>
        <DialogTitle>{{ lang.t('dialogOps.warning') }}</DialogTitle>
      </DialogHeader>

      <div v-if="isSuccess" class="text-center py-4">
        <div class="text-green-500 text-4xl mb-2">✓</div>
        <p class="text-sm font-medium">{{ lang.t('manage.dynamo.deleteIndexSuccess') }}</p>
      </div>

      <Alert v-else-if="isError" variant="destructive" class="mb-3">
        <AlertDescription class="flex items-center justify-between">
          <span>{{ message }}</span>
          <button
            class="ml-2 text-sm hover:opacity-70 cursor-pointer"
            aria-label="Dismiss"
            @click="reset()"
          >
            <X class="w-4 h-4" />
          </button>
        </AlertDescription>
      </Alert>

      <div v-else>
        <p>{{ lang.t('manage.dynamo.deleteIndexConfirm') }}</p>
        <p class="index-name">{{ props.indexName }}</p>
      </div>

      <DialogFooter class="mt-4">
        <Button variant="outline" :disabled="loading" @click="handleCancel">
          {{ lang.t('dialogOps.cancel') }}
        </Button>
        <Button
          v-if="isError"
          variant="destructive"
          :disabled="loading"
          @click="handleRetry"
          @keydown.enter.prevent="handleRetry"
        >
          <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
          {{ lang.t('dialogOps.retry') }}
        </Button>
        <Button
          v-else-if="isIdle"
          variant="destructive"
          :disabled="loading"
          @click="handleConfirm"
          @keydown.enter.prevent="handleConfirm"
        >
          <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
          {{ lang.t('dialogOps.delete') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { X, Loader2 } from 'lucide-vue-next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MIN_LOADING_TIME, SUCCESS_MESSAGE_DELAY } from '../../../common';
import { useLang } from '../../../lang';
import { useDialogResult, formatApiError } from '@/composables';
import { dynamoApi } from '../../../datasources';
import { useClusterManageStore, DynamoDBConnection, DatabaseType } from '../../../store';
import { storeToRefs } from 'pinia';

const lang = useLang();
const clusterManageStore = useClusterManageStore();
const { connection } = storeToRefs(clusterManageStore);

interface Props {
  show: boolean;
  indexName: string;
  tableName: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  (e: 'deleted'): void;
}>();

const loading = ref(false);
const { message, isIdle, isSuccess, isError, succeed, fail, reset } = useDialogResult();

// Reset state when modal opens
watch(
  () => props.show,
  newVal => {
    if (newVal) {
      reset();
      loading.value = false;
    }
  },
);

const handleCancel = () => {
  emit('update:show', false);
};

const handleRetry = async () => {
  reset();
  await handleConfirm();
};

const handleConfirm = async () => {
  if (!props.indexName || !connection.value || connection.value.type !== DatabaseType.DYNAMODB)
    return;

  const startTime = Date.now();

  try {
    loading.value = true;

    // Call backend API to delete GSI
    await dynamoApi.deleteGlobalSecondaryIndex(
      connection.value as DynamoDBConnection,
      props.tableName,
      props.indexName,
    );

    // Ensure minimum loading time before showing success
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    succeed();

    // Close modal after delay and emit deleted event
    setTimeout(() => {
      emit('update:show', false);
      emit('deleted');
    }, SUCCESS_MESSAGE_DELAY);
  } catch (error: unknown) {
    // Ensure minimum loading time before showing error
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    fail(formatApiError(error));
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.index-name {
  font-weight: 600;
  color: hsl(var(--primary));
  margin-top: 8px;
}
</style>
