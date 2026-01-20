<template>
  <n-modal :show="props.show" @update:show="val => emit('update:show', val)">
    <n-card
      style="width: 500px"
      :title="lang.t('manage.dynamo.modifyGsiTitle')"
      :bordered="false"
      role="dialog"
    >
      <n-form ref="formRef" :model="formValue" :rules="rules" label-placement="left" label-width="180">
        <n-form-item :label="lang.t('manage.dynamo.indexName')">
          <n-text>{{ props.indexName }}</n-text>
        </n-form-item>
        
        <n-divider />
        
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
import type { DynamoIndex } from '../../../datasources';

const lang = useLang();

interface Props {
  show: boolean;
  indexName: string;
  tableName: string;
  index: DynamoIndex | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  (e: 'modified'): void;
}>();

const formRef = ref<FormInst | null>(null);
const loading = ref(false);
const errorMessage = ref('');

const formValue = ref({
  readCapacityUnits: 5,
  writeCapacityUnits: 5,
});

const rules: FormRules = {
  readCapacityUnits: {
    required: true,
    type: 'number',
    message: lang.t('manage.dynamo.rcuRequired'),
    trigger: 'blur',
  },
  writeCapacityUnits: {
    required: true,
    type: 'number',
    message: lang.t('manage.dynamo.wcuRequired'),
    trigger: 'blur',
  },
};

// Reset form when modal opens
watch(
  () => props.show,
  newVal => {
    if (newVal && props.index) {
      formValue.value = {
        readCapacityUnits: props.index.provisionedThroughput?.readCapacityUnits || 5,
        writeCapacityUnits: props.index.provisionedThroughput?.writeCapacityUnits || 5,
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

    // TODO: Call backend API to modify index when implemented
    // For now, simulate the operation
    await new Promise(resolve => setTimeout(resolve, MIN_LOADING_TIME));

    // Ensure minimum loading time
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    emit('update:show', false);
    emit('modified');
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
