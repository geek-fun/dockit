<template>
  <n-split direction="vertical" class="ui-editor">
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
      <n-card
        :title="$t('editor.dynamo.resultTitle')"
        v-if="dynamoData.data"
        class="query-result-container"
      >
        <div class="infinity-scroll-outer-container">
          <div class="infinity-scroll-inner-container">
            <n-infinite-scroll style="height: 100%">
              <n-data-table
                :bordered="false"
                :single-line="false"
                :columns="dynamoData.columns"
                :data="dynamoData.data"
                :loading="loadingRef.queryResult"
                :pagination="dynamoData.pagination"
                @update:page="changePage"
                @update:pageSize="changePageSize"
                :remote="true"
              />
            </n-infinite-scroll>
          </div>
        </div>
      </n-card>
    </template>
  </n-split>
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

const connectionStore = useConnectionStore();

const { fetchIndices } = connectionStore;
const { getDynamoIndexOrTableOption } = storeToRefs(connectionStore);

const tabStore = useTabStore();
const { activeConnection } = storeToRefs(tabStore);

const dbDataStore = useDbDataStore();
const { getDynamoData, changePage, changePageSize, resetDynamoData } = dbDataStore;
const { dynamoData } = storeToRefs(dbDataStore);

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

const loadingRef = ref({ index: false, queryResult: false });

const message = useMessage();
const lang = useLang();

const dynamoQueryForm = ref<{
  index: string | null;
  partitionKey: string | null;
  sortKey: string | null;
  formFilterItems: Array<{ key: string; value: string; operator: string }>;
}>({ index: null, partitionKey: null, sortKey: null, formFilterItems: [] });

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

const selectedIndexOrTable = ref<DynamoIndexOrTableOption | undefined>(undefined);

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

    const { partitionKey, sortKey, formFilterItems, index } = dynamoQueryForm.value;

    await getDynamoData(activeConnection.value as DynamoDBConnection, {
      partitionKey: partitionKey ?? undefined,
      sortKey: sortKey ?? undefined,
      filters: formFilterItems,
      index: index ?? undefined,
    });
  } catch (error) {
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
  selectedIndexOrTable.value = undefined;
  dynamoQueryForm.value = { index: null, partitionKey: null, sortKey: null, formFilterItems: [] };

  if (dynamoQueryFormRef.value) {
    dynamoQueryFormRef.value.restoreValidation();
  }
  resetDynamoData();
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

  .query-result-container {
    width: 100%;
    height: 100%;

    :deep(.n-data-table-th__title) {
      white-space: nowrap;
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
