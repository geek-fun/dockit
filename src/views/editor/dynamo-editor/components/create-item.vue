<template>
  <n-card>
    <n-form
      ref="dynamoRecordFormRef"
      :model="dynamoRecordForm"
      :rules="dynamoRecordFormRules"
      label-placement="left"
      require-mark-placement="right-hanging"
      label-width="auto"
    >
      <n-card :title="$t('editor.dynamo.addAttributesTitle')">
        <template #header-extra>
          <n-icon size="26" @click="addAttributeItem" style="cursor: pointer">
            <Add />
          </n-icon>
        </template>
        <!-- First row with partition and sort key -->
        <n-grid :cols="24" :x-gap="12">
          <n-grid-item span="12">
            <n-form-item
              v-if="selectedTable.partitionKeyLabel"
              :label="selectedTable.partitionKeyLabel"
              path="partitionKey"
              :input-props="inputProps"
            >
              <n-input
                v-model:value="dynamoRecordForm.partitionKey"
                :placeholder="$t('editor.dynamo.enterPartitionKey')"
                :input-props="inputProps"
              />
            </n-form-item>
          </n-grid-item>

          <n-grid-item span="12">
            <n-form-item
              v-if="selectedTable.sortKeyLabel"
              :label="selectedTable.sortKeyLabel"
              path="sortKey"
              :input-props="inputProps"
            >
              <n-input
                v-model:value="dynamoRecordForm.sortKey"
                :placeholder="$t('editor.dynamo.enterSortKey')"
              />
            </n-form-item>
          </n-grid-item>
        </n-grid>
        <!-- Dynamically additional form items -->
        <n-grid
          v-for="(item, index) in dynamoRecordForm.attributes"
          :key="index"
          :cols="24"
          :x-gap="12"
        >
          <n-grid-item span="9">
            <n-form-item
              :path="`attributes[${index}].key`"
              :rule="{
                required: true,
                message: `${lang.t('editor.dynamo.attributeNameRequired')}`,
                trigger: ['input', 'blur'],
              }"
            >
              <n-input
                v-model:value="item.key"
                :placeholder="$t('editor.dynamo.inputAttrName')"
                :input-props="inputProps"
              />
            </n-form-item>
          </n-grid-item>
          <n-grid-item span="4">
            <n-form-item
              :path="`attributes[${index}].type`"
              :rule="{
                required: true,
                message: `${lang.t('editor.dynamo.attributeTypeRequired')}`,
                trigger: ['input', 'blur'],
              }"
            >
              <n-select
                v-model:value="item.type"
                :placeholder="$t('editor.dynamo.type')"
                :options="attributeType"
              />
            </n-form-item>
          </n-grid-item>
          <n-grid-item span="9">
            <n-form-item
              :path="`attributes[${index}].value`"
              :rule="{
                required: true,
                message: `${lang.t('editor.dynamo.attributeValueRequired')}`,
                trigger: ['input', 'blur'],
              }"
            >
              <n-input
                v-model:value="item.value"
                :placeholder="$t('editor.dynamo.inputAttrValue')"
                :input-props="inputProps"
              />
            </n-form-item>
          </n-grid-item>
          <n-grid-item span="2">
            <n-button quaternary circle @click="removeAttributeItem(index)">
              <template #icon>
                <n-icon>
                  <Delete />
                </n-icon>
              </template>
            </n-button>
          </n-grid-item>
        </n-grid>
      </n-card>
    </n-form>
    <template #footer>
      <div class="card-footer">
        <n-button type="warning" tertiary @click="handleReset">
          {{ $t('dialogOps.reset') }}
        </n-button>
        <n-button type="primary" @click="handleSubmit" :disabled="!validationPassed">
          {{ $t('dialogOps.execute') }}
        </n-button>
      </div>
    </template>
  </n-card>
  <n-card :title="$t('editor.dynamo.resultTitle')" v-if="queryResult.data">
    <n-data-table :columns="queryResult.columns" :data="queryResult.data" />
  </n-card>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Add, Delete } from '@vicons/carbon';
import { FormRules, FormValidationError } from 'naive-ui';
import { Connection, DynamoDBConnection, useConnectionStore, useTabStore } from '../../../../store';
import { inputProps } from '../../../../common';
import { useLang } from '../../../../lang';

const connectionStore = useConnectionStore();

const { fetchIndices } = connectionStore;
const { getDynamoIndexOrTableOption } = storeToRefs(connectionStore);

const tabStore = useTabStore();
const { activeConnection } = storeToRefs(tabStore);

const dynamoRecordFormRef = ref();
const attributeType = ref([
  { label: 'String', value: 'String=' },
  { label: 'Number', value: 'Number' },
  { label: 'Boolean', value: 'Boolean' },
  { label: 'Binary', value: 'Binary' },
  { label: 'Null', value: 'Null' },
  { label: 'String Set', value: 'String Set>' },
  { label: 'Number Set', value: 'Number Set' },
  { label: 'Binary Set', value: 'Binary Set' },
  { label: 'List', value: 'List' },
  { label: 'Map', value: 'Map' },
]);

const message = useMessage();
const lang = useLang();

const dynamoRecordForm = ref<{
  index: string;
  partitionKey: string;
  sortKey: string;
  attributes: Array<{ key: string; value: string; type: string }>;
}>({ index: '', partitionKey: '', sortKey: '', attributes: [] });

const dynamoRecordFormRules = reactive<FormRules>({
  index: [
    {
      required: true,
      renderMessage: () => lang.t('editor.dynamo.indexIsRequired'),
      trigger: ['input', 'blur'],
    },
  ],
  partitionKey: [
    {
      required: true,
      renderMessage: () => lang.t('editor.dynamo.attributeValueRequired'),
      level: 'error',
      trigger: ['input', 'blur'],
    },
  ],
});

const queryResult = ref<{
  columns: Array<{ title: string; key: string }>;
  data: Array<Record<string, unknown>> | undefined;
}>({
  columns: [],
  data: undefined,
});

const addAttributeItem = () => {
  dynamoRecordForm.value.attributes.push({ key: '', value: '', type: '' });
};

const removeAttributeItem = (index: number) => {
  dynamoRecordForm.value.attributes.splice(index, 1);
};

const selectedTable = computed(() => {
  const indexOrTableOptions = getDynamoIndexOrTableOption.value(
    activeConnection.value as DynamoDBConnection,
  );
  if (indexOrTableOptions?.length < 1) {
    return {
      partitionKeyName: undefined,
      sortKeyName: undefined,
      partitionKeyLabel: undefined,
      sortKeyLabel: undefined,
    };
  }

  const { partitionKeyName, sortKeyName } = indexOrTableOptions[0];

  return {
    partitionKeyName,
    sortKeyName,
    partitionKeyLabel: partitionKeyName ? `${partitionKeyName}  (Partition Key):` : undefined,
    sortKeyLabel: sortKeyName ? `${sortKeyName} (Sort Key):` : undefined,
  };
});

const validateForm = async () => {
  try {
    return await dynamoRecordFormRef.value?.validate(
      (errors: Array<FormValidationError>) => !errors,
    );
  } catch (e) {
    return false;
  }
};
const validationPassed = watch(
  [dynamoRecordForm.value, dynamoRecordForm.value.attributes],
  validateForm,
);

const handleSubmit = async (event: MouseEvent) => {
  event.preventDefault();
  if (!activeConnection.value) {
    message.error(`status: 500, ${lang.t('connection.selectIndex')}`);
    return;
  }
  if (!(await validateForm())) {
    message.error(lang.t('connection.validationFailed'));
    return;
  }

  try {
    // const { tableName } = activeConnection.value as DynamoDBConnection;
    // const { partitionKey, sortKey, attributes } = dynamoRecordForm.value;
    // Build query parameters
  } catch (error) {
    message.error(`status: ${(error as Error).name}, details: ${(error as Error).message}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3600,
    });
  }
};

const handleReset = () => {
  dynamoRecordForm.value = { index: '', partitionKey: '', sortKey: '', attributes: [] };

  if (dynamoRecordFormRef.value) {
    dynamoRecordFormRef.value.restoreValidation();
  }
};

fetchIndices(activeConnection.value as Connection);
</script>

<style lang="scss" scoped>
.card-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
