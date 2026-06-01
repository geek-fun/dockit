<template>
  <Dialog :open="props.show" @update:open="handleOpenChange">
    <DialogContent class="sm:max-w-[400px]" :show-close="false">
      <DialogHeader>
        <DialogTitle>{{ lang.t('dialogOps.warning') }}</DialogTitle>
        <button
          class="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
          aria-label="Close"
          @click="handleCancel"
        >
          <Icon :size="20" :component="X" />
        </button>
      </DialogHeader>

      <div class="modal-content">
        <Alert v-if="isSuccess" variant="success" class="mb-4">
          <AlertDescription>
            {{ lang.t('editor.dynamo.deleteItemSuccess') }}
          </AlertDescription>
        </Alert>
        <Alert v-else-if="isError" variant="destructive" class="mb-4">
          <AlertDescription class="flex items-center justify-between">
            {{ message }}
            <button
              class="ml-2 hover:opacity-70 cursor-pointer"
              aria-label="Dismiss"
              @click="reset()"
            >
              <X class="w-4 h-4" />
            </button>
          </AlertDescription>
        </Alert>
        <p v-else>{{ lang.t('editor.dynamo.deleteItemConfirm') }}</p>
      </div>

      <DialogFooter>
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
import { MIN_LOADING_TIME, SUCCESS_MESSAGE_DELAY } from '../../../../common';
import { useLang } from '../../../../lang';
import { useDialogResult, formatApiError } from '@/composables';
import { DynamoDBConnection, useDbDataStore, useTabStore } from '../../../../store';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Alert, AlertDescription } from '@/components/ui/alert';

const lang = useLang();
const dbDataStore = useDbDataStore();
const tabStore = useTabStore();
const { deleteItem } = dbDataStore;

interface Props {
  show: boolean;
  keys: Array<{ key: string; value: string | number | boolean | null; type: string }>;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
}>();

const handleOpenChange = (open: boolean) => {
  if (!open) {
    handleCancel();
  }
};

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
  const connection = tabStore.activeConnection as DynamoDBConnection | null;
  const tableName = tabStore.activePanel?.activeTable;
  if (!props.keys || props.keys.length === 0 || !connection || !tableName) return;

  const startTime = Date.now();

  try {
    loading.value = true;

    // Execute delete
    await deleteItem(connection, tableName, props.keys);

    // Ensure minimum loading time before showing success
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    succeed();

    // Close modal after 1 second
    setTimeout(() => {
      emit('update:show', false);
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

<style scoped></style>
