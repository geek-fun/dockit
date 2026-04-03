<template>
  <SplitPane v-model:size="editorSize" direction="vertical" class="ui-editor">
    <template #1>
      <Card class="query-container">
        <CardContent class="p-4 h-full overflow-hidden">
          <Form ref="dynamoQueryFormRef" class="query-form">
            <!-- First row with partition and sort key -->
            <Grid :cols="24" :x-gap="12">
              <GridItem :span="8">
                <FormItem :label="$t('editor.dynamo.tableOrIndex')">
                  <Select
                    :model-value="dynamoQueryForm.index ?? undefined"
                    @update:open="handleIndexOpen"
                    @update:model-value="handleSelectUpdate"
                  >
                    <SelectTrigger>
                      <span
                        v-if="dynamoQueryForm.index && selectedIndexOrTable"
                        class="select-value-text"
                      >
                        {{ selectedIndexOrTable.label }}
                      </span>
                      <SelectValue v-else :placeholder="$t('editor.dynamo.selectTableOrIndex')" />
                    </SelectTrigger>
                    <SelectContent>
                      <div v-if="loadingRef.index" class="flex items-center justify-center py-4">
                        <Spinner class="h-4 w-4 mr-2" />
                        <span class="text-sm text-muted-foreground">Loading...</span>
                      </div>
                      <SelectItem
                        v-for="option in indicesOrTableOptions"
                        v-else
                        :key="option.value"
                        :value="option.value"
                      >
                        {{ option.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              </GridItem>

              <GridItem :span="8">
                <FormItem
                  v-if="selectedIndexOrTable?.partitionKeyName"
                  :label="getLabel('PARTITION_KEY')"
                >
                  <Input
                    :model-value="dynamoQueryForm.partitionKey ?? ''"
                    :placeholder="$t('editor.dynamo.enterPartitionKey')"
                    @update:model-value="
                      (val: string | number) => (dynamoQueryForm.partitionKey = String(val))
                    "
                  />
                  <p v-if="showScanWarning" class="text-sm text-amber-600 dark:text-amber-500 mt-1">
                    {{ $t('editor.dynamo.scanWarning') }}
                  </p>
                </FormItem>
              </GridItem>

              <GridItem :span="8">
                <FormItem v-if="selectedIndexOrTable?.sortKeyName" :label="getLabel('SORT_KEY')">
                  <Input
                    :model-value="dynamoQueryForm.sortKey ?? ''"
                    :placeholder="$t('editor.dynamo.enterSortKey')"
                    @update:model-value="
                      (val: string | number) => (dynamoQueryForm.sortKey = String(val))
                    "
                  />
                </FormItem>
              </GridItem>
            </Grid>

            <!-- Dynamic additional form items -->
            <Card class="additional-filter-container mt-4">
              <CardHeader class="p-3 flex flex-row items-center justify-between">
                <CardTitle class="text-base">{{ $t('editor.dynamo.filterTitle') }}</CardTitle>
                <span class="i-carbon-add h-6 w-6 cursor-pointer" @click="addFilterItem" />
              </CardHeader>
              <CardContent class="filter-card-content p-3">
                <ScrollArea class="filter-scroll-area">
                  <div class="space-y-2">
                    <Grid
                      v-for="(item, index) in dynamoQueryForm.formFilterItems"
                      :key="index"
                      :cols="24"
                      :x-gap="12"
                    >
                      <GridItem :span="9">
                        <FormItem :error="getFilterError(index, 'key')">
                          <Input
                            v-model="item.key"
                            :placeholder="$t('editor.dynamo.inputAttrName')"
                          />
                        </FormItem>
                      </GridItem>
                      <GridItem :span="4">
                        <FormItem :error="getFilterError(index, 'operator')">
                          <Select v-model="item.operator">
                            <SelectTrigger>
                              <SelectValue :placeholder="$t('editor.dynamo.inputOperator')" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem
                                v-for="condition in filterConditions"
                                :key="condition.value"
                                :value="condition.value"
                              >
                                {{ condition.label }}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      </GridItem>
                      <GridItem :span="9">
                        <FormItem :error="getFilterError(index, 'value')">
                          <Input
                            v-model="item.value"
                            :placeholder="$t('editor.dynamo.inputAttrValue')"
                          />
                        </FormItem>
                      </GridItem>
                      <GridItem :span="2" class="flex items-start pt-px">
                        <Button
                          variant="ghost"
                          size="icon"
                          type="button"
                          class="h-8 w-8 mb-px"
                          @click.prevent="removeFilterItem(index)"
                        >
                          <span class="i-carbon-trash-can h-4 w-4" />
                        </Button>
                      </GridItem>
                    </Grid>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </Form>
        </CardContent>
        <CardFooter class="card-footer">
          <Button variant="outline" @click="handleReset">
            {{ $t('dialogOps.reset') }}
          </Button>
          <Button :disabled="!validationPassed || loadingRef.queryResult" @click="queryToDynamo">
            <Spinner v-if="loadingRef.queryResult" class="mr-2 h-4 w-4" />
            {{ $t('dialogOps.execute') }}
          </Button>
        </CardFooter>
      </Card>
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
  </SplitPane>

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
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useMessageService, useLoadingBarService } from '@/composables';
import { SplitPane } from '@/components/ui/split-pane';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormItem } from '@/components/ui/form';
import { Grid, GridItem } from '@/components/ui/grid';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import {
  Connection,
  DatabaseType,
  DynamoDBConnection,
  DynamoIndexOrTableOption,
  useConnectionStore,
  useDbDataStore,
  useHistoryStore,
  useTabStore,
} from '../../../../store';
import { CustomError } from '../../../../common';
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

const historyStore = useHistoryStore();

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

const message = useMessageService();
const loadingBar = useLoadingBarService();

// Watch for showResultPanel changes and adjust split pane size
watch(
  () => dynamoData.value.queryData.showResultPanel,
  showPanel => {
    editorSize.value = showPanel ? 0.5 : 1;
  },
);

// Edit state
const showEditModal = ref(false);
const editingItem = ref<Record<string, unknown> | null>(null);

const validationSchema = computed(() =>
  toTypedSchema(
    z.object({
      index: z
        .string()
        .nullable()
        .refine(val => val !== null && val.length > 0, {
          message: lang.t('editor.dynamo.indexIsRequired'),
        }),
      partitionKey: z.string().nullable().optional(),
      sortKey: z.string().nullable().optional(),
      formFilterItems: z
        .array(
          z.object({
            key: z.string(),
            operator: z.string(),
            value: z.string(),
          }),
        )
        .refine(
          items =>
            items.every(item => {
              const hasAny = item.key || item.operator || item.value;
              const hasAll = item.key && item.operator && item.value;
              return !hasAny || hasAll;
            }),
          { message: lang.t('connection.validationFailed') },
        ),
    }),
  ),
);

const { validate } = useForm({
  validationSchema,
  initialValues: dynamoQueryForm.value,
});

const validationPassed = computed(() => {
  if (!dynamoQueryForm.value.index) return false;

  for (const item of dynamoQueryForm.value.formFilterItems) {
    if (item.key || item.operator || item.value) {
      if (!item.key || !item.operator || !item.value) return false;
    }
  }

  return true;
});

const getFilterError = (index: number, field: 'key' | 'operator' | 'value') => {
  const item = dynamoQueryForm.value.formFilterItems[index];
  if (!item) return undefined;
  const hasAny = item.key || item.operator || item.value;
  if (!hasAny) return undefined;
  if (!item[field]) return lang.t('editor.dynamo.attributeValueRequired');
  return undefined;
};

const showScanWarning = computed(() => {
  return (
    dynamoQueryForm.value.index &&
    (!dynamoQueryForm.value.partitionKey || dynamoQueryForm.value.partitionKey.trim() === '')
  );
});

const addFilterItem = () => {
  dynamoQueryForm.value.formFilterItems.push({ key: '', value: '', operator: '' });
};

const removeFilterItem = (index: number) => {
  dynamoQueryForm.value.formFilterItems.splice(index, 1);
};

const indicesOrTableOptions = ref<Array<DynamoIndexOrTableOption>>([]);

const handleSelectUpdate = (value: string) => {
  const indices = getDynamoIndexOrTableOption.value(activeConnection.value as DynamoDBConnection);
  const option = indicesOrTableOptions.value.find(opt => opt.value === value);
  if (option) {
    selectedIndexOrTable.value = indices.find(({ label }) => label === option.label);
  }
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

const queryToDynamo = async (event?: MouseEvent) => {
  if (event?.preventDefault) {
    event.preventDefault();
  }

  const { valid } = await validate();

  if (!activeConnection.value || !selectedIndexOrTable.value) {
    message.error(`status: 500, ${lang.t('connection.selectIndex')}`);
    return;
  }

  if (!valid || !validationPassed.value) {
    return;
  }

  const { partitionKey, sortKey, formFilterItems, index } = dynamoQueryForm.value;

  try {
    loadingRef.value.queryResult = true;
    loadingBar.start();

    await getDynamoData(activeConnection.value as DynamoDBConnection, {
      partitionKey: partitionKey ?? undefined,
      sortKey: sortKey ?? undefined,
      filters: formFilterItems,
      index: index ?? undefined,
    });

    const conn = activeConnection.value as DynamoDBConnection;
    const queryDesc = [
      partitionKey ? `PK=${partitionKey}` : null,
      sortKey ? `SK=${sortKey}` : null,
      ...(formFilterItems
        ?.filter(f => f.key && f.operator)
        .map(f => `${f.key}${f.operator}${f.value}`) ?? []),
    ]
      .filter(Boolean)
      .join(', ');

    historyStore.addEntry({
      databaseType: DatabaseType.DYNAMODB,
      method: 'Query',
      path: conn.tableName,
      index: index ?? undefined,
      qdsl: queryDesc || undefined,
      connectionName: conn.name,
      connectionId: conn.id,
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

<style scoped>
.ui-editor {
  width: 100%;
  height: 100%;
}

.ui-editor .query-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ui-editor .query-form {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ui-editor .additional-filter-container {
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ui-editor .filter-card-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.ui-editor .filter-scroll-area {
  height: 100%;
  max-height: 100%;
}

.card-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
