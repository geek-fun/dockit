<template>
  <n-split direction="vertical" class="ui-editor" v-model:size="editorSize">
    <template #1>
      <n-card class="query-container">
        <n-form
          ref="dynamoQueryFormRef"
          :model="dynamoQueryForm"
          :rules="dynamoQueryFormRules"
          label-placement="left"
          require-mark-placement="right-hanging"
          label-width="auto"
          style="width: 100%; height: 100%"
        >
          <!-- First row with partition and sort key -->
          <n-grid :cols="24" :x-gap="12">
            <n-grid-item span="8">
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

            <n-grid-item span="8">
              <n-form-item
                v-if="selectedIndexOrTable?.partitionKeyName"
                :label="getLabel('PARTITION_KEY')"
                path="partitionKey"
              >
                <n-input
                  v-model:value="dynamoQueryForm.partitionKey"
                  :placeholder="$t('editor.dynamo.enterPartitionKey')"
                  :input-props="inputProps"
                />
              </n-form-item>
            </n-grid-item>

            <n-grid-item span="8">
              <n-form-item
                v-if="selectedIndexOrTable?.sortKeyName"
                :label="getLabel('SORT_KEY')"
                path="sortKey"
              >
                <n-input
                  v-model:value="dynamoQueryForm.sortKey"
                  :placeholder="$t('editor.dynamo.enterSortKey')"
                  :input-props="inputProps"
                />
              </n-form-item>
            </n-grid-item>
          </n-grid>

          <!-- Dynamic additional form items -->
          <n-card :title="$t('editor.dynamo.filterTitle')" class="additional-filter-container">
            <template #header-extra>
              <n-icon size="26" @click="addFilterItem" style="cursor: pointer">
                <Add />
              </n-icon>
            </template>
            <div class="infinity-scroll-outer-container">
              <div class="infinity-scroll-inner-container">
                <n-infinite-scroll style="height: 100%">
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
                        :path="`formFilterItems[${index}].operator`"
                        :rule="{
                          required: true,
                          message: `${lang.t('editor.dynamo.operatorRequired')}`,
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
                      <n-button quaternary circle @click="removeFilterItem(index)">
                        <template #icon>
                          <n-icon>
                            <Delete />
                          </n-icon>
                        </template>
                      </n-button>
                    </n-grid-item>
                  </n-grid>
                </n-infinite-scroll>
              </div>
            </div>
          </n-card>
        </n-form>
        <template #footer>
          <div class="card-footer">
            <n-button type="warning" tertiary @click="handleReset">
              {{ $t('dialogOps.reset') }}
            </n-button>
            <n-button
              type="primary"
              @click="queryToDynamo"
              :disabled="!validationPassed"
              :loading="loadingRef.queryResult"
            >
              {{ $t('dialogOps.execute') }}
            </n-button>
          </div>
        </template>
      </n-card>
    </template>
    <template #2>
      <result-panel
        v-show="dynamoData.queryData.showResultPanel"
        :has-data="!!dynamoData.queryData.data"
        :columns="dynamoData.queryData.columns"
        :data="dynamoData.queryData.data ?? []"
        :loading="loadingRef.queryResult"
        :pagination="dynamoData.queryData.pagination"
        :remote="true"
        :closable="true"
        :show-actions="true"
        :partition-key-name="partitionKeyName"
        :sort-key-name="sortKeyName"
        @update:page="changePage"
        @update:page-size="changePageSize"
        @close="handleCloseResultPanel"
        @edit="handleEdit"
      />
    </template>
  </n-split>

  <!-- Edit Item Modal -->
  <edit-item
    v-model:show="showEditModal"
    :item="editingItem"
    :partition-key-name="partitionKeyName"
    :partition-key-type="partitionKeyType"
    :sort-key-name="sortKeyName"
    :sort-key-type="sortKeyType"
    @submit="handleEditSubmit"
  />
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Add, Delete } from '@vicons/carbon';
import { isEmpty } from 'lodash';
import { FormItemRule, FormRules, FormValidationError } from 'naive-ui';
import {
  Connection,
  DynamoDBConnection,
  DynamoIndexOrTableOption,
  useConnectionStore,
  useDbDataStore,
  useTabStore,
} from '../../../../store';
import { CustomError, inputProps } from '../../../../common';
import { useLang } from '../../../../lang';
import EditItem from './edit-item.vue';
import ResultPanel from './result-panel.vue';

const lang = useLang();

const connectionStore = useConnectionStore();

const { fetchIndices, updateItem } = connectionStore;
const { getDynamoIndexOrTableOption } = storeToRefs(connectionStore);

const tabStore = useTabStore();
const { activeConnection } = storeToRefs(tabStore);

const dbDataStore = useDbDataStore();
const {
  getDynamoData,
  changePage,
  changePageSize,
  resetDynamoData,
  resetUiQueryForm,
  refreshDynamoData,
} = dbDataStore;
const { dynamoData } = storeToRefs(dbDataStore);

// Use store-persisted UI query form state
const dynamoQueryForm = computed({
  get: () => dynamoData.value.uiQueryForm,
  set: val => {
    dynamoData.value.uiQueryForm = val;
  },
});

const selectedIndexOrTable = computed({
  get: () => dynamoData.value.uiQueryForm.selectedIndexOrTable,
  set: val => {
    dynamoData.value.uiQueryForm.selectedIndexOrTable = val;
  },
});

const dynamoQueryFormRef = ref();
const filterConditions = ref([
  { label: lang.t('editor.dynamo.filterLabels.eq'), value: '=' },
  { label: lang.t('editor.dynamo.filterLabels.ne'), value: '!=' },
  { label: lang.t('editor.dynamo.filterLabels.lte'), value: '<=' },
  { label: lang.t('editor.dynamo.filterLabels.lt'), value: '<' },
  { label: lang.t('editor.dynamo.filterLabels.gte'), value: '>=' },
  { label: lang.t('editor.dynamo.filterLabels.gt'), value: '>' },
  { label: lang.t('editor.dynamo.filterLabels.between'), value: 'between' },
  { label: lang.t('editor.dynamo.filterLabels.exists'), value: 'attribute_exists' },
  { label: lang.t('editor.dynamo.filterLabels.notExists'), value: 'attribute_not_exists' },
  { label: lang.t('editor.dynamo.filterLabels.contains'), value: 'contains' },
  { label: lang.t('editor.dynamo.filterLabels.notContains'), value: 'not contain' },
  { label: lang.t('editor.dynamo.filterLabels.beginsWith'), value: 'begins_with' },
]);

const loadingRef = ref({ index: false, queryResult: false });
const editorSize = ref(dynamoData.value.queryData.showResultPanel ? 0.5 : 1);

const message = useMessage();
const loadingBar = useLoadingBar();

// Edit state
const showEditModal = ref(false);
const editingItem = ref<Record<string, unknown> | null>(null);

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
      validator: (_: FormItemRule, value) => !isEmpty(value),
      renderMessage: () => lang.t('editor.dynamo.scanWarning'),
      level: 'warning',
      trigger: ['input', 'blur'],
    },
  ],
});

const addFilterItem = () => {
  dynamoQueryForm.value.formFilterItems.push({ key: '', value: '', operator: '' });
};

const removeFilterItem = (index: number) => {
  dynamoQueryForm.value.formFilterItems.splice(index, 1);
};

const indicesOrTableOptions = ref<Array<DynamoIndexOrTableOption>>([]);

const handleUpdate = (value: string, options: DynamoIndexOrTableOption) => {
  const indices = getDynamoIndexOrTableOption.value(activeConnection.value as DynamoDBConnection);
  selectedIndexOrTable.value = indices.find(({ label }) => label === options.label);

  dynamoQueryForm.value.index = value;
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
    indicesOrTableOptions.value = getDynamoIndexOrTableOption
      .value(activeConnection.value as DynamoDBConnection)
      .map(item => ({ ...item, value: item.label }));
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

const queryToDynamo = async (event?: MouseEvent) => {
  if (event?.preventDefault) {
    event.preventDefault();
  }
  if (!activeConnection.value || !selectedIndexOrTable.value) {
    message.error(`status: 500, ${lang.t('connection.selectIndex')}`);
    return;
  }
  if (!(await validateForm())) {
    message.error(lang.t('connection.validationFailed'));
    return;
  }

  try {
    loadingRef.value.queryResult = true;
    loadingBar.start();

    const { partitionKey, sortKey, formFilterItems, index } = dynamoQueryForm.value;

    await getDynamoData(activeConnection.value as DynamoDBConnection, {
      partitionKey: partitionKey ?? undefined,
      sortKey: sortKey ?? undefined,
      filters: formFilterItems,
      index: index ?? undefined,
    });
    editorSize.value = 0.5;
    loadingBar.finish();
  } catch (error) {
    loadingBar.error();
    const { status, details } = error as CustomError;
    message.error(`status: ${status}, details: ${details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3600,
    });
  } finally {
    loadingRef.value.queryResult = false;
  }
};

const handleReset = () => {
  resetUiQueryForm();

  if (dynamoQueryFormRef.value) {
    dynamoQueryFormRef.value.restoreValidation();
  }
  editorSize.value = 1;
  resetDynamoData();
};

const handleCloseResultPanel = () => {
  editorSize.value = 1;
  resetDynamoData();
};

// Get partition key and sort key info from active connection
const partitionKeyName = computed(
  () => (activeConnection.value as DynamoDBConnection)?.partitionKey?.name ?? '',
);
const partitionKeyType = computed(
  () => (activeConnection.value as DynamoDBConnection)?.partitionKey?.valueType ?? 'S',
);
const sortKeyName = computed(
  () => (activeConnection.value as DynamoDBConnection)?.sortKey?.name ?? undefined,
);
const sortKeyType = computed(
  () => (activeConnection.value as DynamoDBConnection)?.sortKey?.valueType ?? undefined,
);

const handleEdit = (row: Record<string, unknown>) => {
  editingItem.value = row;
  showEditModal.value = true;
};

type AttributeItem = {
  key: string;
  value: string | number | boolean | null;
  type: string;
};

const handleEditSubmit = async (keys: AttributeItem[], attributes: AttributeItem[]) => {
  if (!activeConnection.value) return;

  try {
    loadingRef.value.queryResult = true;
    loadingBar.start();
    await updateItem(activeConnection.value as DynamoDBConnection, keys, attributes);
    message.success(lang.t('editor.dynamo.updateItemSuccess'));
    showEditModal.value = false;
    await refreshDynamoData();
    loadingBar.finish();
  } catch (error) {
    loadingBar.error();
    const { status, details } = error as CustomError;
    message.error(`status: ${status}, details: ${details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3600,
    });
  } finally {
    loadingRef.value.queryResult = false;
  }
};
</script>

<style lang="scss" scoped>
.ui-editor {
  width: 100%;
  height: 100%;

  .query-container {
    width: 100%;
    height: 100%;

    .additional-filter-container {
      width: 100%;
      height: calc(100% - 60px);
    }

    .card-footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }
  }
}

.infinity-scroll-outer-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;

  .infinity-scroll-inner-container {
    flex: 1;
    height: 0;
  }
}
</style>
