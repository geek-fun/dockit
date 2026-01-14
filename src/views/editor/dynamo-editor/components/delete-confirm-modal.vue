<template>
  <n-modal v-model:show="showModal">
    <n-card
      style="width: 400px"
      :title="lang.t('dialogOps.warning')"
      :bordered="false"
      role="dialog"
    >
      <n-alert v-if="resultMessage" :type="resultType" style="margin-bottom: 12px">
        {{ resultMessage }}
      </n-alert>
      <p v-if="!resultMessage">{{ lang.t('editor.dynamo.deleteItemConfirm') }}</p>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 12px">
          <n-button @click="handleCancel" :disabled="loading">
            {{ lang.t('dialogOps.cancel') }}
          </n-button>
          <n-button
            type="error"
            @click="handleConfirm"
            :loading="loading"
            :disabled="!!resultMessage"
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
import { useLang } from '../../../../lang';

// Auto-close delay for result messages (in milliseconds)
const AUTO_CLOSE_DELAY = 1000;

const lang = useLang();

interface Props {
  show: boolean;
  row: Record<string, unknown> | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  (e: 'confirm', row: Record<string, unknown>): Promise<void>;
}>();

const showModal = ref(props.show);
const loading = ref(false);
const resultMessage = ref('');
const resultType = ref<'success' | 'error'>('success');

watch(() => props.show, (newVal) => {
  showModal.value = newVal;
  if (newVal) {
    // Reset state when modal opens
    resultMessage.value = '';
    resultType.value = 'success';
    loading.value = false;
  }
});

watch(showModal, (newVal) => {
  emit('update:show', newVal);
});

const handleCancel = () => {
  showModal.value = false;
};

const handleConfirm = async () => {
  if (!props.row) return;

  try {
    loading.value = true;
    await emit('confirm', props.row);
    resultType.value = 'success';
    resultMessage.value = lang.t('editor.dynamo.deleteItemSuccess');
    // Close modal after delay
    setTimeout(() => {
      showModal.value = false;
    }, AUTO_CLOSE_DELAY);
  } catch (error: any) {
    resultType.value = 'error';
    resultMessage.value = error?.details 
      ? `status: ${error?.status ?? 'unknown'}, details: ${error.details}` 
      : error?.message || String(error);
    // Close modal after delay on error
    setTimeout(() => {
      showModal.value = false;
    }, AUTO_CLOSE_DELAY);
  } finally {
    loading.value = false;
  }
};
</script>
