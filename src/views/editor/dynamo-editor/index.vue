<template>
  <div class="dynamo-editor">
    <tool-bar type="DYNAMO_EDITOR" />
    <n-card>
      <n-form
        ref="dynamoQueryFormRef"
        :model="dynamoQueryForm"
        :rules="dynamoQueryFormRules"
        label-placement="left"
        require-mark-placement="right-hanging"
        label-width="auto"
      >
        <!-- First row with partition and sort key -->
        <n-grid :cols="24" :x-gap="12">
          <n-grid-item span="12">
            <n-form-item :label="$t('editor.dynamo.tableOrIndex')" path="index">
              <n-select
                :placeholder="$t('editor.dynamo.selectTableOrIndex')"
                v-model:value="dynamoQueryForm.index"
                remote
                :loading="loadingRef.index"
                @update:show="handleIndexOpen"
                @update:value="handleUpdate"
                :options="indicesOrTableOptions"
              />
            </n-form-item>
          </n-grid-item>

          <n-grid-item span="12">
            <n-form-item
              v-if="selectedIndexOrTable?.partitionKeyName"
              :label="getLabel('PARTITION_KEY')"
              path="partitionKey"
              :input-props="inputProps"
            >
              <n-input
                v-model:value="dynamoQueryForm.partitionKey"
                :placeholder="$t('editor.dynamo.enterPartitionKey')"
                :input-props="inputProps"
              />
            </n-form-item>
          </n-grid-item>

          <n-grid-item span="12">
            <n-form-item
              v-if="selectedIndexOrTable?.sortKeyName"
              :label="getLabel('SORT_KEY')"
              path="sortKey"
              :input-props="inputProps"
            >
              <n-input
                v-model:value="dynamoQueryForm.sortKey"
                :placeholder="$t('editor.dynamo.enterSortKey')"
              />
            </n-form-item>
          </n-grid-item>
        </n-grid>

        <!-- Dynamic additional form items -->
        <n-card :title="$t('editor.dynamo.filterTitle')">
          <template #header-extra>
            <n-icon size="26" @click="addFilterItem" style="cursor: pointer">
              <Add />
            </n-icon>
          </template>
          <n-grid
            v-for="(item, index) in dynamoQueryForm.formFilterItems"
            :key="index"
            :cols="24"
            :x-gap="12"
          >
            <n-grid-item span="9">
              <n-form-item
                :path="`formFilterItems[${index}].key`"
                :rule="{
                  required: true,
                  message: `${lang.t('editor.dynamo.filterKeyRequired')}`,
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
                :path="`formFilterItems[${index}].operator`"
                :rule="{
                  required: true,
                  message: `${lang.t('editor.dynamo.filterOperatorRequired')}`,
                  trigger: ['input', 'blur'],
                }"
              >
                <n-select
                  v-model:value="item.operator"
                  :placeholder="$t('editor.dynamo.inputOperator')"
                  :options="filterConditions"
                />
              </n-form-item>
            </n-grid-item>
            <n-grid-item span="9">
              <n-form-item
                :path="`formFilterItems[${index}].value`"
                :rule="{
                  required: true,
                  message: `${lang.t('editor.dynamo.filterValueRequired')}`,
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
              <n-button quaternary circle @click="removeFilterItem(index)">
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
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Add, Delete } from '@vicons/carbon';
import { isEmpty } from 'lodash';
import ToolBar from '../../../components/tool-bar.vue';
import { FormItemRule, FormRules, FormValidationError } from 'naive-ui';
import {
  Connection,
  DynamoDBConnection,
  DynamoIndexOrTableOption,
  useConnectionStore,
  useTabStore,
} from '../../../store';
import { inputProps } from '../../../common';
import { useLang } from '../../../lang';

const connectionStore = useConnectionStore();

const { fetchIndices, queryTable } = connectionStore;
const { getDynamoIndexOrTableOption } = storeToRefs(connectionStore);

const tabStore = useTabStore();
const { activeConnection } = storeToRefs(tabStore);

const dynamoQueryFormRef = ref();
const filterConditions = ref([
  { label: '=', value: '=' },
  { label: '!=', value: '!=' },
  { label: '<=', value: '<=' },
  { label: '<', value: '<' },
  { label: '>=', value: '>=' },
  { label: '>', value: '>' },
  { label: 'Between', value: 'between' },
  { label: 'Exists', value: 'attribute_exists' },
  { label: 'Not exists', value: 'attribute_not_exists' },
  { label: 'Contain', value: 'contains' },
  { label: 'Not contain', value: 'not contain' },
  { label: 'Begins with', value: 'begins_with' },
]);

const loadingRef = ref({ index: false });

const message = useMessage();
const lang = useLang();

const dynamoQueryForm = ref<{
  index: string;
  partitionKey: string;
  sortKey: string;
  formFilterItems: Array<{ key: string; value: string; operator: string }>;
}>({ index: '', partitionKey: '', sortKey: '', formFilterItems: [] });

const dynamoQueryFormRules = reactive<FormRules>({
  index: [
    {
      required: true,
      renderMessage: () => lang.t('editor.dynamo.indexIsRequired'),
      trigger: ['input', 'blur'],
    },
  ],
  partitionKey: [
    {
      validator: (_: FormItemRule, value) =>
        !(isEmpty(dynamoQueryForm.value.formFilterItems) && !value),
      renderMessage: () => lang.t('editor.dynamo.atLeastRequired'),
      level: 'error',
      trigger: ['input', 'blur'],
    },
    {
      validator: (_: FormItemRule, value) =>
        !(!isEmpty(dynamoQueryForm.value.formFilterItems) && !value),
      renderMessage: () => lang.t('editor.dynamo.scanWarning'),
      level: 'warning',
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

const addFilterItem = () => {
  dynamoQueryForm.value.formFilterItems.push({ key: '', value: '', operator: '' });
};

const removeFilterItem = (index: number) => {
  dynamoQueryForm.value.formFilterItems.splice(index, 1);
};

const indicesOrTableOptions = ref<Array<DynamoIndexOrTableOption>>([]);

const selectedIndexOrTable = ref<DynamoIndexOrTableOption | undefined>(undefined);

const handleUpdate = (value: string) => {
  const indices = getDynamoIndexOrTableOption.value(activeConnection.value as DynamoDBConnection);
  selectedIndexOrTable.value = indices.find(item => item.value === value);
  dynamoQueryForm.value.index = selectedIndexOrTable.value!.value;
};

const getLabel = (label: string) => {
  if (!selectedIndexOrTable.value) {
    return label;
  }
  switch (label) {
    case 'PARTITION_KEY':
      return `${selectedIndexOrTable.value.partitionKeyName} (Partition Key):`;
    case 'SORT_KEY':
      return `${selectedIndexOrTable.value.sortKeyName} (Sort Key):`;
    default:
      return label;
  }
};

const handleIndexOpen = async (isOpen: boolean) => {
  if (!isOpen) {
    loadingRef.value.index = false;
    return;
  }
  loadingRef.value.index = true;
  try {
    await fetchIndices(activeConnection.value as Connection);
    indicesOrTableOptions.value = getDynamoIndexOrTableOption.value(
      activeConnection.value as DynamoDBConnection,
    );
  } catch (err) {
    message.error(`status: ${(err as Error).name}, details: ${(err as Error).message}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3600,
    });
  } finally {
    loadingRef.value.index = false;
  }
};

const validateForm = async () => {
  try {
    return await dynamoQueryFormRef.value?.validate(
      (errors: Array<FormValidationError>) => !errors,
    );
  } catch (e) {
    return false;
  }
};
const validationPassed = watch(
  [dynamoQueryForm.value, dynamoQueryForm.value.formFilterItems],
  validateForm,
);

const handleSubmit = async (event: MouseEvent) => {
  event.preventDefault();
  if (!activeConnection.value || !selectedIndexOrTable.value) {
    message.error(`status: 500, ${lang.t('connection.selectIndex')}`);
    return;
  }
  if (!(await validateForm())) {
    message.error(lang.t('connection.validationFailed'));
    return;
  }

  try {
    const { tableName } = activeConnection.value as DynamoDBConnection;
    const { partitionKey, sortKey, formFilterItems } = dynamoQueryForm.value;
    const { partitionKeyName, sortKeyName, value } =
      selectedIndexOrTable.value as DynamoIndexOrTableOption;
    // Build query parameters
    const queryParams = {
      tableName,
      indexName: value,
      partitionKey: { name: partitionKeyName, value: partitionKey },
      sortKey: sortKeyName && sortKey ? { name: sortKeyName, value: sortKey } : undefined,
      filters: formFilterItems,
    };

    const data = await queryTable(activeConnection.value as DynamoDBConnection, queryParams);

    const columnsSet = new Set<string>();
    data.items.forEach(item => {
      Object.keys(item).forEach(key => {
        columnsSet.add(key);
      });
    });
    const columnsData = data.items.map(item => {
      const row: Record<string, unknown> = {};
      columnsSet.forEach(key => {
        row[key] = item[key];
      });
      return row;
    });
    queryResult.value = {
      columns: Array.from(columnsSet).map(key => ({ title: key, key })),
      data: columnsData,
    };
  } catch (error) {
    message.error(`status: ${(error as Error).name}, details: ${(error as Error).message}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3600,
    });
  }
};

const handleReset = () => {
  selectedIndexOrTable.value = undefined;
  dynamoQueryForm.value = { index: '', partitionKey: '', sortKey: '', formFilterItems: [] };

  if (dynamoQueryFormRef.value) {
    dynamoQueryFormRef.value.restoreValidation();
  }
};
</script>

<style lang="scss" scoped>
.card-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
