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
        :title="lang.t('manage.dynamo.deleteIndexSuccess')"
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
      <div v-else>
        <p>{{ lang.t('manage.dynamo.deleteIndexConfirm') }}</p>
        <p class="index-name">{{ props.indexName }}</p>
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 12px">
          <n-button @click="handleCancel" :disabled="loading">
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
import { MIN_LOADING_TIME, SUCCESS_MESSAGE_DELAY } from '../../../common';
import { useLang } from '../../../lang';
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
  if (!props.indexName || !connection.value || connection.value.type !== DatabaseType.DYNAMODB) return;

  const startTime = Date.now();

  try {
    loading.value = true;

    // Call backend API to delete GSI
    await dynamoApi.deleteGlobalSecondaryIndex(
      connection.value as DynamoDBConnection,
      props.indexName,
    );

    // Ensure minimum loading time before showing success
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    // Show success result
    resultType.value = 'success';
    resultMessage.value = 'success';

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

    // Show error and keep modal open for retry
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
.index-name {
  font-weight: 600;
  color: var(--primary-color);
  margin-top: 8px;
}
</style>
