<template>
  <Dialog :open="props.show" @update:open="handleOpenChange">
    <DialogContent class="sm:max-w-[400px]" :show-close="false">
      <DialogHeader>
        <DialogTitle>{{ lang.t('dialogOps.warning') }}</DialogTitle>
        <button
          class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          @click="handleCancel"
        >
          <Icon :size="20" :component="X" />
        </button>
      </DialogHeader>

      <div class="modal-content">
        <Alert v-if="resultType === 'success' && resultMessage" variant="success" class="mb-4">
          <AlertDescription>
            {{ lang.t('editor.dynamo.deleteItemSuccess') }}
          </AlertDescription>
        </Alert>
        <Alert v-else-if="resultMessage" variant="destructive" class="mb-4">
          <AlertDescription class="flex items-center justify-between">
            {{ resultMessage }}
            <button class="ml-2 hover:opacity-70 cursor-pointer" @click="resultMessage = ''">
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
          v-if="resultType === 'error'"
          variant="destructive"
          :disabled="loading"
          @click="handleRetry"
        >
          <span v-if="loading" class="mr-2 h-4 w-4 animate-spin">⟳</span>
          {{ lang.t('dialogOps.retry') }}
        </Button>
        <Button
          v-else-if="!resultMessage"
          variant="destructive"
          :disabled="loading"
          @click="handleConfirm"
        >
          <span v-if="loading" class="mr-2 h-4 w-4 animate-spin">⟳</span>
          {{ lang.t('dialogOps.confirm') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { X } from 'lucide-vue-next';
import { MIN_LOADING_TIME, SUCCESS_MESSAGE_DELAY } from '../../../../common';
import { useLang } from '../../../../lang';
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
const resultMessage = ref('');
const resultType = ref<'success' | 'error'>('success');

// Reset state when modal opens
watch(
  () => props.show,
  newVal => {
    if (newVal) {
      resultMessage.value = '';
      resultType.value = 'success';
      loading.value = false;
    }
  },
);

const handleCancel = () => {
  emit('update:show', false);
};

const handleRetry = async () => {
  // Clear error message before retry
  resultMessage.value = '';
  await handleConfirm();
};

const handleConfirm = async () => {
  const connection = tabStore.activeConnection as DynamoDBConnection | null;
  if (!props.keys || props.keys.length === 0 || !connection) return;

  const startTime = Date.now();

  try {
    loading.value = true;

    // Execute delete
    await deleteItem(connection, props.keys);

    // Ensure minimum loading time before showing success
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    // Show success result
    resultType.value = 'success';
    resultMessage.value = 'success';

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

    // Show error and keep modal open for retry
    resultType.value = 'error';
    const err = error as { status?: string; details?: string; message?: string };
    resultMessage.value = err?.details
      ? `status: ${err?.status ?? 'unknown'}, details: ${err.details}`
      : err?.message || String(error);
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped></style>
