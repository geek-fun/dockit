<template>
  <n-modal :show="props.show" @update:show="val => emit('update:show', val)">
    <n-card
      style="width: 600px"
      :title="lang.t('manage.dynamo.createGsiTitle')"
      :bordered="false"
      role="dialog"
    >
      <n-form ref="formRef" :model="formValue" :rules="rules" label-placement="left" label-width="140">
        <n-form-item :label="lang.t('manage.dynamo.indexName')" path="indexName">
          <n-input v-model:value="formValue.indexName" :placeholder="lang.t('manage.dynamo.indexNamePlaceholder')" />
        </n-form-item>
        
        <n-form-item :label="lang.t('manage.dynamo.partitionKey')" path="partitionKey">
          <n-input v-model:value="formValue.partitionKey" :placeholder="lang.t('manage.dynamo.partitionKeyPlaceholder')" />
        </n-form-item>
        
        <n-form-item :label="lang.t('manage.dynamo.partitionKeyType')" path="partitionKeyType">
          <n-select v-model:value="formValue.partitionKeyType" :options="keyTypeOptions" />
        </n-form-item>
        
        <n-form-item :label="lang.t('manage.dynamo.sortKey')" path="sortKey">
          <n-input v-model:value="formValue.sortKey" :placeholder="lang.t('manage.dynamo.sortKeyPlaceholder')" />
        </n-form-item>
        
        <n-form-item :label="lang.t('manage.dynamo.sortKeyType')" path="sortKeyType">
          <n-select v-model:value="formValue.sortKeyType" :options="keyTypeOptions" :disabled="!formValue.sortKey" />
        </n-form-item>
        
        <n-form-item :label="lang.t('manage.dynamo.projection')" path="projectionType">
          <n-select v-model:value="formValue.projectionType" :options="projectionOptions" />
        </n-form-item>
        
        <n-form-item v-if="formValue.projectionType === 'INCLUDE'" :label="lang.t('manage.dynamo.projectedAttributes')" path="projectedAttributes">
          <n-dynamic-tags v-model:value="formValue.projectedAttributes" />
        </n-form-item>
        
        <n-form-item :label="lang.t('manage.dynamo.rcu')" path="readCapacityUnits">
          <n-input-number v-model:value="formValue.readCapacityUnits" :min="1" style="width: 100%" />
        </n-form-item>
        
        <n-form-item :label="lang.t('manage.dynamo.wcu')" path="writeCapacityUnits">
          <n-input-number v-model:value="formValue.writeCapacityUnits" :min="1" style="width: 100%" />
        </n-form-item>
      </n-form>
      
      <n-alert v-if="errorMessage" type="error" style="margin-top: 12px" closable @close="errorMessage = ''">
        {{ errorMessage }}
      </n-alert>
      
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 12px">
          <n-button @click="handleCancel" :disabled="loading">
            {{ lang.t('dialogOps.cancel') }}
          </n-button>
          <n-button type="primary" @click="handleSubmit" :loading="loading">
            {{ lang.t('dialogOps.confirm') }}
          </n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { FormInst, FormRules } from 'naive-ui';
import { MIN_LOADING_TIME } from '../../../common';
import { useLang } from '../../../lang';

const lang = useLang();

interface Props {
  show: boolean;
  tableName: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  (e: 'created'): void;
}>();

const formRef = ref<FormInst | null>(null);
const loading = ref(false);
const errorMessage = ref('');

const formValue = ref({
  indexName: '',
  partitionKey: '',
  partitionKeyType: 'S',
  sortKey: '',
  sortKeyType: 'S',
  projectionType: 'ALL',
  projectedAttributes: [] as string[],
  readCapacityUnits: 5,
  writeCapacityUnits: 5,
});

const keyTypeOptions = [
  { label: 'String (S)', value: 'S' },
  { label: 'Number (N)', value: 'N' },
  { label: 'Binary (B)', value: 'B' },
];

const projectionOptions = [
  { label: 'ALL', value: 'ALL' },
  { label: 'KEYS_ONLY', value: 'KEYS_ONLY' },
  { label: 'INCLUDE', value: 'INCLUDE' },
];

const rules: FormRules = {
  indexName: {
    required: true,
    message: lang.t('manage.dynamo.indexNameRequired'),
    trigger: 'blur',
  },
  partitionKey: {
    required: true,
    message: lang.t('manage.dynamo.partitionKeyRequired'),
    trigger: 'blur',
  },
};

// Reset form when modal opens
watch(
  () => props.show,
  newVal => {
    if (newVal) {
      formValue.value = {
        indexName: '',
        partitionKey: '',
        partitionKeyType: 'S',
        sortKey: '',
        sortKeyType: 'S',
        projectionType: 'ALL',
        projectedAttributes: [],
        readCapacityUnits: 5,
        writeCapacityUnits: 5,
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
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }

  const startTime = Date.now();

  try {
    loading.value = true;

    // TODO: Call backend API to create index when implemented
    // For now, simulate the operation
    await new Promise(resolve => setTimeout(resolve, MIN_LOADING_TIME));

    // Ensure minimum loading time
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    emit('update:show', false);
    emit('created');
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
