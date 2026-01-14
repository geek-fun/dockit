<template>
  <n-modal :show="props.show" @update:show="val => emit('update:show', val)">
    <n-card
      style="width: 400px"
      :title="lang.t('dialogOps.warning')"
      :bordered="false"
      role="dialog"
    >
      <n-result
        v-if="resultType === 'success' && resultMessage"
        status="success"
        :title="lang.t('editor.dynamo.deleteItemSuccess')"
        size="small"
      />
      <n-alert
        v-else-if="resultMessage"
        :type="resultType"
        style="margin-bottom: 12px"
        closable
        @close="resultMessage = ''"
      >
        {{ resultMessage }}
      </n-alert>
      <p v-else>{{ lang.t('editor.dynamo.deleteItemConfirm') }}</p>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 12px">
          <n-button @click="handleCancel" :disabled="loading || resultType === 'success'">
            {{ lang.t('dialogOps.cancel') }}
          </n-button>
          <n-button
            v-if="resultType === 'error'"
            type="warning"
            @click="handleRetry"
            :loading="loading"
          >
            {{ lang.t('dialogOps.retry') }}
          </n-button>
          <n-button
            v-else-if="!resultMessage"
            type="warning"
            @click="handleConfirm"
            :loading="loading"
          >
            {{ lang.t('dialogOps.confirm') }}
          </n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { MIN_LOADING_TIME, SUCCESS_MESSAGE_DELAY } from '../../../../common';
import { useLang } from '../../../../lang';
import { DynamoDBConnection, useConnectionStore, useTabStore } from '../../../../store';

const lang = useLang();
const connectionStore = useConnectionStore();
const tabStore = useTabStore();
const { deleteItem } = connectionStore;

interface Props {
  show: boolean;
  keys: Array<{ key: string; value: string | number | boolean | null; type: string }>;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  (e: 'deleted'): void;
}>();

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

    // Emit deleted event to parent
    emit('deleted');

    // Show success result
    resultType.value = 'success';
    resultMessage.value = 'success';

    // Close modal after 1 second
    setTimeout(() => {
      emit('update:show', false);
    }, SUCCESS_MESSAGE_DELAY);
  } catch (error: any) {
    // Ensure minimum loading time before showing error
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    // Show error and keep modal open for retry
    resultType.value = 'error';
    resultMessage.value = error?.details
      ? `status: ${error?.status ?? 'unknown'}, details: ${error.details}`
      : error?.message || String(error);
  } finally {
    loading.value = false;
  }
};
</script>
