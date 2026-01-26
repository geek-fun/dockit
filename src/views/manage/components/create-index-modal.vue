<template>
  <n-modal :show="props.show" @update:show="val => emit('update:show', val)">
    <n-card
      style="width: 700px"
      :title="lang.t('manage.dynamo.createGsiTitle')"
      :bordered="false"
      role="dialog"
    >
      <div style="max-height: 65vh; overflow-y: auto; overflow-x: hidden" class="hide-scrollbar">
        <n-form
          ref="formRef"
          :model="formValue"
          :rules="rules"
          label-placement="left"
          label-width="160"
        >
          <!-- Index Details Section -->
          <n-divider title-placement="left">
            {{ lang.t('manage.dynamo.indexDetails') }}
          </n-divider>

          <n-form-item :label="lang.t('manage.dynamo.indexName')" path="indexName">
            <n-input
              v-model:value="formValue.indexName"
              :placeholder="lang.t('manage.dynamo.indexNamePlaceholder')"
              :input-props="inputProps"
            />
          </n-form-item>

          <!-- Partition Key Attributes -->
          <n-form-item :label="lang.t('manage.dynamo.partitionKey')" path="partitionKeyAttributes">
            <div style="width: 100%; display: flex; flex-direction: column; gap: 8px">
              <div
                v-for="(attr, index) in formValue.partitionKeyAttributes"
                :key="index"
                style="display: flex; gap: 8px; align-items: center"
              >
                <n-input
                  v-model:value="attr.name"
                  :placeholder="lang.t('manage.dynamo.keyAttributeName')"
                  :input-props="inputProps"
                  style="flex: 1"
                />
                <n-select
                  v-model:value="attr.type"
                  :options="keyTypeOptions"
                  style="width: 140px"
                />
                <n-button
                  text
                  type="error"
                  :disabled="formValue.partitionKeyAttributes.length === 1"
                  @click="removePartitionKeyAttribute(index)"
                >
                  <template #icon>
                    <n-icon><TrashCan /></n-icon>
                  </template>
                </n-button>
              </div>
              <n-button dashed block @click="addPartitionKeyAttribute">
                {{ lang.t('manage.dynamo.addAttribute') }}
              </n-button>
            </div>
          </n-form-item>

          <!-- Sort Key Attributes (Optional) -->
          <n-form-item :label="lang.t('manage.dynamo.sortKey')" path="sortKeyAttributes">
            <div style="width: 100%; display: flex; flex-direction: column; gap: 8px">
              <div
                v-for="(attr, index) in formValue.sortKeyAttributes"
                :key="index"
                style="display: flex; gap: 8px; align-items: center"
              >
                <n-input
                  v-model:value="attr.name"
                  :placeholder="lang.t('manage.dynamo.keyAttributeNameOptional')"
                  :input-props="inputProps"
                  style="flex: 1"
                />
                <n-select
                  v-model:value="attr.type"
                  :options="keyTypeOptions"
                  style="width: 140px"
                />
                <n-button text type="error" @click="removeSortKeyAttribute(index)">
                  <template #icon>
                    <n-icon><TrashCan /></n-icon>
                  </template>
                </n-button>
              </div>
              <n-button dashed block @click="addSortKeyAttribute">
                {{ lang.t('manage.dynamo.addAttribute') }}
              </n-button>
            </div>
          </n-form-item>

          <!-- Attribute Projections -->
          <n-form-item :label="lang.t('manage.dynamo.projection')" path="projectionType">
            <n-select v-model:value="formValue.projectionType" :options="projectionOptions" />
          </n-form-item>

          <n-form-item
            v-if="formValue.projectionType === 'INCLUDE'"
            :label="lang.t('manage.dynamo.projectedAttributes')"
            path="projectedAttributes"
          >
            <n-dynamic-tags v-model:value="formValue.projectedAttributes" />
          </n-form-item>

          <!-- Index Capacity Section -->
          <n-divider title-placement="left">
            {{ lang.t('manage.dynamo.indexCapacity') }}
          </n-divider>

          <n-form-item :label="lang.t('manage.dynamo.capacityMode')">
            <div style="width: 100%">
              <div style="margin-bottom: 8px; font-weight: 500">
                {{ baseTableCapacityMode }}
              </div>
              <n-alert type="info" :bordered="false" style="padding: 8px 12px">
                {{ lang.t('manage.dynamo.capacityModeNotice') }}
              </n-alert>
            </div>
          </n-form-item>

          <n-form-item
            v-if="baseTableCapacityMode === 'PROVISIONED'"
            :label="lang.t('manage.dynamo.maxTableThroughput')"
            path="throughputMode"
          >
            <n-radio-group v-model:value="formValue.throughputMode">
              <n-space vertical>
                <n-radio value="copy">
                  {{ lang.t('manage.dynamo.copyFromBaseTable') }}
                </n-radio>
                <n-radio value="customize">
                  {{ lang.t('manage.dynamo.customizeSettings') }}
                </n-radio>
              </n-space>
            </n-radio-group>
          </n-form-item>

          <n-form-item
            v-if="
              baseTableCapacityMode === 'PROVISIONED' && formValue.throughputMode === 'customize'
            "
            :label="lang.t('manage.dynamo.rcu')"
            path="readCapacityUnits"
          >
            <n-input-number
              v-model:value="formValue.readCapacityUnits"
              :min="1"
              style="width: 100%"
            />
          </n-form-item>

          <n-form-item
            v-if="
              baseTableCapacityMode === 'PROVISIONED' && formValue.throughputMode === 'customize'
            "
            :label="lang.t('manage.dynamo.wcu')"
            path="writeCapacityUnits"
          >
            <n-input-number
              v-model:value="formValue.writeCapacityUnits"
              :min="1"
              style="width: 100%"
            />
          </n-form-item>

          <!-- Warm Throughput Section -->
          <n-divider title-placement="left">
            {{ lang.t('manage.dynamo.warmThroughput') }}
          </n-divider>

          <n-form-item
            :label="lang.t('manage.dynamo.warmThroughputMode')"
            path="warmThroughputMode"
          >
            <n-radio-group v-model:value="formValue.warmThroughputMode">
              <n-space vertical>
                <n-radio value="default">
                  {{ warmThroughputDefaultLabel }}
                </n-radio>
                <n-radio value="increase">
                  {{ lang.t('manage.dynamo.increaseWarmThroughput') }}
                </n-radio>
              </n-space>
            </n-radio-group>
          </n-form-item>

          <n-form-item
            v-if="formValue.warmThroughputMode === 'increase'"
            :label="lang.t('manage.dynamo.warmReadUnits')"
            path="warmReadUnits"
          >
            <n-input-number
              v-model:value="formValue.warmReadUnits"
              :min="0"
              :placeholder="String(warmThroughputDefaults.read)"
              style="width: 100%"
            />
          </n-form-item>

          <n-form-item
            v-if="formValue.warmThroughputMode === 'increase'"
            :label="lang.t('manage.dynamo.warmWriteUnits')"
            path="warmWriteUnits"
          >
            <n-input-number
              v-model:value="formValue.warmWriteUnits"
              :min="0"
              :placeholder="String(warmThroughputDefaults.write)"
              style="width: 100%"
            />
          </n-form-item>
        </n-form>
      </div>

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
            {{ lang.t('dialogOps.create') }}
          </n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue';
import type { FormInst, FormRules } from 'naive-ui';
import { TrashCan } from '@vicons/carbon';
import { MIN_LOADING_TIME, inputProps } from '../../../common';
import { useLang } from '../../../lang';
import { useClusterManageStore, DatabaseType } from '../../../store';
import { storeToRefs } from 'pinia';

const lang = useLang();
const clusterManageStore = useClusterManageStore();
const { connection } = storeToRefs(clusterManageStore);

interface Props {
  show: boolean;
  tableName: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  (e: 'created'): void;
}>();

type KeyAttribute = {
  name: string;
  type: string;
};

const formRef = ref<FormInst | null>(null);
const loading = ref(false);
const errorMessage = ref('');
const baseTableInfo = ref<any>(null);

const formValue = ref({
  indexName: '',
  partitionKeyAttributes: [{ name: '', type: 'S' }] as KeyAttribute[],
  sortKeyAttributes: [{ name: '', type: 'S' }] as KeyAttribute[],
  projectionType: 'ALL',
  projectedAttributes: [] as string[],
  throughputMode: 'copy' as 'copy' | 'customize',
  readCapacityUnits: 5,
  writeCapacityUnits: 5,
  warmThroughputMode: 'default' as 'default' | 'increase',
  warmReadUnits: 0,
  warmWriteUnits: 0,
});

const baseTableCapacityMode = computed(() => {
  return baseTableInfo.value?.billingMode || 'PAY_PER_REQUEST';
});

const warmThroughputDefaults = computed(() => {
  const warmRead = baseTableInfo.value?.warmThroughput?.readUnitsPerSecond || 0;
  const warmWrite = baseTableInfo.value?.warmThroughput?.writeUnitsPerSecond || 0;
  return { read: warmRead, write: warmWrite };
});

const warmThroughputDefaultLabel = computed(() => {
  const { read, write } = warmThroughputDefaults.value;
  if (read > 0 || write > 0) {
    return `${lang.t('manage.dynamo.keepDefaultValues')} (${read} RCU/S, ${write} WCU/S)`;
  }
  return lang.t('manage.dynamo.keepDefaultValues');
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
  partitionKeyAttributes: {
    required: true,
    validator: (_rule, value: KeyAttribute[]) => {
      if (!value || value.length === 0) {
        return new Error(lang.t('manage.dynamo.partitionKeyRequired'));
      }
      for (const attr of value) {
        if (!attr.name || attr.name.trim() === '') {
          return new Error(lang.t('manage.dynamo.partitionKeyRequired'));
        }
      }
      return true;
    },
    trigger: 'blur',
  },
};

const addPartitionKeyAttribute = () => {
  formValue.value.partitionKeyAttributes.push({ name: '', type: 'S' });
};

const removePartitionKeyAttribute = (index: number) => {
  formValue.value.partitionKeyAttributes.splice(index, 1);
};

const addSortKeyAttribute = () => {
  formValue.value.sortKeyAttributes.push({ name: '', type: 'S' });
};

const removeSortKeyAttribute = (index: number) => {
  formValue.value.sortKeyAttributes.splice(index, 1);
};

// Fetch base table info when modal opens
const fetchBaseTableInfo = async () => {
  if (!connection.value || connection.value.type !== DatabaseType.DYNAMODB) return;

  try {
    baseTableInfo.value = await clusterManageStore.describeTable();

    // Set default throughput values from base table if PROVISIONED
    if (baseTableInfo.value?.billingMode === 'PROVISIONED') {
      const baseReadCapacity = baseTableInfo.value?.provisionedThroughput?.readCapacityUnits || 5;
      const baseWriteCapacity = baseTableInfo.value?.provisionedThroughput?.writeCapacityUnits || 5;
      formValue.value.readCapacityUnits = baseReadCapacity;
      formValue.value.writeCapacityUnits = baseWriteCapacity;
    }

    // Set default warm throughput values from base table
    const warmRead = baseTableInfo.value?.warmThroughput?.readUnitsPerSecond || 0;
    const warmWrite = baseTableInfo.value?.warmThroughput?.writeUnitsPerSecond || 0;
    formValue.value.warmReadUnits = warmRead;
    formValue.value.warmWriteUnits = warmWrite;
  } catch (error) {
    console.error('Failed to fetch base table info:', error);
  }
};

// Reset form when modal opens
watch(
  () => props.show,
  newVal => {
    if (newVal) {
      formValue.value = {
        indexName: '',
        partitionKeyAttributes: [{ name: '', type: 'S' }],
        sortKeyAttributes: [{ name: '', type: 'S' }],
        projectionType: 'ALL',
        projectedAttributes: [],
        throughputMode: 'copy',
        readCapacityUnits: 5,
        writeCapacityUnits: 5,
        warmThroughputMode: 'default',
        warmReadUnits: 0,
        warmWriteUnits: 0,
      };
      errorMessage.value = '';
      loading.value = false;
      fetchBaseTableInfo();
    }
  },
);

onMounted(() => {
  if (props.show) {
    fetchBaseTableInfo();
  }
});

const handleCancel = () => {
  emit('update:show', false);
};

const handleSubmit = async () => {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }

  if (!connection.value || connection.value.type !== DatabaseType.DYNAMODB) return;

  const startTime = Date.now();

  try {
    loading.value = true;

    // Prepare key schema - combine partition and sort keys
    const keySchema: Array<{
      attributeName: string;
      keyType: 'HASH' | 'RANGE';
      attributeType: string;
    }> = [];

    // Add partition key(s)
    formValue.value.partitionKeyAttributes.forEach(attr => {
      if (attr.name && attr.name.trim()) {
        keySchema.push({
          attributeName: attr.name.trim(),
          keyType: 'HASH',
          attributeType: attr.type,
        });
      }
    });

    // Add sort key(s) if provided
    formValue.value.sortKeyAttributes.forEach(attr => {
      if (attr.name && attr.name.trim()) {
        keySchema.push({
          attributeName: attr.name.trim(),
          keyType: 'RANGE',
          attributeType: attr.type,
        });
      }
    });

    // Determine throughput settings
    let readCapacity = undefined;
    let writeCapacity = undefined;

    if (baseTableCapacityMode.value === 'PROVISIONED') {
      if (formValue.value.throughputMode === 'copy') {
        readCapacity = baseTableInfo.value?.provisionedThroughput?.readCapacityUnits || 5;
        writeCapacity = baseTableInfo.value?.provisionedThroughput?.writeCapacityUnits || 5;
      } else {
        readCapacity = formValue.value.readCapacityUnits;
        writeCapacity = formValue.value.writeCapacityUnits;
      }
    }

    // Prepare warm throughput settings
    const warmThroughput =
      formValue.value.warmThroughputMode === 'increase'
        ? {
            readUnits: formValue.value.warmReadUnits,
            writeUnits: formValue.value.warmWriteUnits,
          }
        : undefined;

    // Call backend API to create GSI with enhanced configuration
    await clusterManageStore.createGlobalSecondaryIndex({
      indexName: formValue.value.indexName,
      keySchema,
      projectionType: formValue.value.projectionType,
      projectedAttributes:
        formValue.value.projectionType === 'INCLUDE'
          ? formValue.value.projectedAttributes
          : undefined,
      readCapacityUnits: readCapacity,
      writeCapacityUnits: writeCapacity,
      warmThroughput,
    });

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

<style scoped>
.n-divider {
  margin: 24px 0 16px 0;
}

.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
