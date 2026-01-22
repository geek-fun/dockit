<template>
  <n-modal :show="props.show" @update:show="val => emit('update:show', val)">
    <n-card
      style="width: 600px"
      :title="lang.t('manage.dynamo.tableSettingsTitle')"
      :bordered="false"
      role="dialog"
    >
      <n-tabs type="line" animated>
        <!-- Streams Tab -->
        <n-tab-pane name="streams" :tab="lang.t('manage.dynamo.streams')">
          <n-form label-placement="left" label-width="160">
            <n-form-item :label="lang.t('manage.dynamo.enableStreams')">
              <n-switch v-model:value="formValue.streamsEnabled" />
            </n-form-item>
            <n-form-item
              v-if="formValue.streamsEnabled"
              :label="lang.t('manage.dynamo.streamViewType')"
            >
              <n-select v-model:value="formValue.streamViewType" :options="streamViewTypeOptions" />
            </n-form-item>
          </n-form>
        </n-tab-pane>

        <!-- TTL Tab -->
        <n-tab-pane name="ttl" :tab="lang.t('manage.dynamo.ttl')">
          <n-form label-placement="left" label-width="160">
            <n-form-item :label="lang.t('manage.dynamo.enableTtl')">
              <n-switch v-model:value="formValue.ttlEnabled" />
            </n-form-item>
            <n-form-item v-if="formValue.ttlEnabled" :label="lang.t('manage.dynamo.ttlAttribute')">
              <n-input
                v-model:value="formValue.ttlAttributeName"
                :placeholder="lang.t('manage.dynamo.ttlAttributePlaceholder')"
              />
            </n-form-item>
          </n-form>
        </n-tab-pane>

        <!-- PITR Tab -->
        <n-tab-pane name="pitr" :tab="lang.t('manage.dynamo.pitr')">
          <n-form label-placement="left" label-width="160">
            <n-form-item :label="lang.t('manage.dynamo.enablePitr')">
              <n-switch v-model:value="formValue.pitrEnabled" />
            </n-form-item>
            <n-alert v-if="formValue.pitrEnabled" type="info" style="margin-top: 8px">
              {{ lang.t('manage.dynamo.pitrWarning') }}
            </n-alert>
          </n-form>
        </n-tab-pane>

        <!-- Table Class Tab -->
        <n-tab-pane name="tableClass" :tab="lang.t('manage.dynamo.tableClass')">
          <n-form label-placement="left" label-width="160">
            <n-form-item :label="lang.t('manage.dynamo.tableClass')">
              <n-select v-model:value="formValue.tableClass" :options="tableClassOptions" />
            </n-form-item>
            <n-alert type="info" style="margin-top: 8px">
              {{ lang.t('manage.dynamo.tableClassInfo') }}
            </n-alert>
          </n-form>
        </n-tab-pane>
      </n-tabs>

      <n-alert
        v-if="errorMessage"
        type="error"
        style="margin-top: 12px"
        closable
        @close="errorMessage = ''"
      >
        {{ errorMessage }}
      </n-alert>

      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 12px">
          <n-button :disabled="loading" @click="handleCancel">
            {{ lang.t('dialogOps.cancel') }}
          </n-button>
          <n-button type="primary" :loading="loading" @click="handleSubmit">
            {{ lang.t('dialogOps.save') }}
          </n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { MIN_LOADING_TIME } from '../../../common';
import { useLang } from '../../../lang';

const lang = useLang();

interface Props {
  show: boolean;
  tableName: string;
  currentSettings: {
    streamsEnabled: boolean;
    streamViewType: string;
    ttlEnabled: boolean;
    ttlAttributeName: string;
    pitrEnabled: boolean;
    tableClass: string;
  };
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  (e: 'saved'): void;
}>();

const loading = ref(false);
const errorMessage = ref('');

const formValue = ref({
  streamsEnabled: false,
  streamViewType: 'NEW_AND_OLD_IMAGES',
  ttlEnabled: false,
  ttlAttributeName: '',
  pitrEnabled: false,
  tableClass: 'STANDARD',
});

const streamViewTypeOptions = [
  { label: 'KEYS_ONLY', value: 'KEYS_ONLY' },
  { label: 'NEW_IMAGE', value: 'NEW_IMAGE' },
  { label: 'OLD_IMAGE', value: 'OLD_IMAGE' },
  { label: 'NEW_AND_OLD_IMAGES', value: 'NEW_AND_OLD_IMAGES' },
];

const tableClassOptions = [
  { label: 'DynamoDB Standard', value: 'STANDARD' },
  { label: 'DynamoDB Standard-IA', value: 'STANDARD_INFREQUENT_ACCESS' },
];

// Reset form when modal opens
watch(
  () => props.show,
  newVal => {
    if (newVal) {
      formValue.value = {
        streamsEnabled: props.currentSettings.streamsEnabled,
        streamViewType: props.currentSettings.streamViewType || 'NEW_AND_OLD_IMAGES',
        ttlEnabled: props.currentSettings.ttlEnabled,
        ttlAttributeName: props.currentSettings.ttlAttributeName || '',
        pitrEnabled: props.currentSettings.pitrEnabled,
        tableClass: props.currentSettings.tableClass || 'STANDARD',
      };
      errorMessage.value = '';
      loading.value = false;
    }
  },
);

const handleCancel = () => {
  emit('update:show', false);
};

const handleSubmit = async () => {
  const startTime = Date.now();

  try {
    loading.value = true;

    // TODO: Call backend APIs to update table settings when implemented
    // For now, simulate the operation
    await new Promise(resolve => setTimeout(resolve, MIN_LOADING_TIME));

    // Ensure minimum loading time
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    emit('update:show', false);
    emit('saved');
  } catch (error: unknown) {
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    const err = error as { details?: string; status?: number; message?: string };
    errorMessage.value = err?.details
      ? `status: ${err?.status ?? 'unknown'}, details: ${err.details}`
      : err?.message || String(error);
  } finally {
    loading.value = false;
  }
};
</script>
