<template>
  <n-card class="create-item-container">
    <n-card :title="$t('editor.dynamo.addAttributesTitle')" class="create-item-container">
      <template #header-extra>
        <n-icon size="26" style="cursor: pointer" @click="addAttributeItem">
          <Add />
        </n-icon>
      </template>
      <div class="form-container">
        <div class="form-scroll-container">
          <n-form
            ref="dynamoRecordFormRef"
            :model="dynamoRecordForm"
            label-placement="left"
            require-mark-placement="right-hanging"
            label-width="auto"
            class="create-item-container"
          >
            <n-infinite-scroll style="height: 100%">
              <!-- First row with partition and sort key -->
              <n-grid :cols="24" :x-gap="12">
                <n-grid-item span="10">
                  <n-form-item
                    v-if="selectedTable.partitionKeyLabel"
                    :label="selectedTable.partitionKeyLabel"
                    path="partitionKey"
                    :rule="{
                      required: true,
                      message: `${lang.t('editor.dynamo.attributeValueRequired')}`,
                      trigger: ['input', 'blur'],
                    }"
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
                    :rule="{
                      required: true,
                      message: `${lang.t('editor.dynamo.attributeValueRequired')}`,
                      trigger: ['input', 'blur'],
                    }"
                  >
                    <n-input
                      v-model:value="dynamoRecordForm.sortKey"
                      :placeholder="$t('editor.dynamo.enterSortKey')"
                      :input-props="inputProps"
                    />
                  </n-form-item>
                </n-grid-item>
              </n-grid>
              <n-divider title-placement="left">Key Attributes</n-divider>
              <n-grid
                v-for="(item, index) in dynamoRecordForm.keyAttributes"
                :key="index"
                :cols="24"
                :x-gap="12"
              >
                <n-grid-item span="8">
                  <n-form-item :path="`keyAttributes[${index}].key`">
                    <n-input
                      v-model:value="item.key"
                      :placeholder="$t('editor.dynamo.inputAttrName')"
                      disabled
                    />
                  </n-form-item>
                </n-grid-item>
                <n-grid-item span="4">
                  <n-form-item :path="`keyAttributes[${index}].type`">
                    <n-select
                      v-model:value="item.type"
                      :placeholder="$t('editor.dynamo.type')"
                      disabled
                      :options="attributeType"
                    />
                  </n-form-item>
                </n-grid-item>
                <n-grid-item span="10">
                  <n-form-item :path="`keyAttributes[${index}].value`">
                    <n-input-number
                      v-if="calcType(item.type) === 'number'"
                      v-model:value="item.value as number"
                      :placeholder="$t('editor.dynamo.inputAttrValue')"
                      style="width: 100%"
                    />
                    <n-input
                      v-else
                      v-model:value="item.value as string"
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
              <!-- Dynamically additional form items -->
              <n-divider title-placement="left">Additional Attributes</n-divider>
              <n-grid
                v-for="(item, index) in dynamoRecordForm.attributes"
                :key="index"
                :cols="24"
                :x-gap="12"
              >
                <n-grid-item span="8">
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
                <n-grid-item span="10">
                  <n-form-item
                    :path="`attributes[${index}].value`"
                    :rule="{
                      required: true,
                      message: `${lang.t('editor.dynamo.attributeValueRequired')}`,
                      trigger: ['input', 'blur'],
                    }"
                  >
                    <n-input
                      v-model:value="item.value as string"
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
            </n-infinite-scroll>
          </n-form>
        </div>
      </div>
    </n-card>
    <template #footer>
      <div class="card-footer">
        <n-button type="warning" tertiary @click="handleReset">
          {{ $t('dialogOps.reset') }}
        </n-button>
        <n-button
          type="primary"
          :disabled="!validationPassed"
          :loading="loadingRef.createItem"
          @click="handleSubmit"
        >
          {{ $t('dialogOps.create') }}
        </n-button>
      </div>
    </template>
  </n-card>
  <n-card v-if="queryResult.data" :title="$t('editor.dynamo.resultTitle')">
    <n-data-table :columns="queryResult.columns" :data="queryResult.data" />
  </n-card>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Add, Delete } from '@vicons/carbon';
import { FormValidationError } from 'naive-ui';
import { Connection, DynamoDBConnection, useConnectionStore, useTabStore } from '../../../../store';
import { CustomError, inputProps } from '../../../../common';
import { useLang } from '../../../../lang';

const connectionStore = useConnectionStore();

const { fetchIndices, createItem } = connectionStore;
const { getDynamoIndexOrTableOption } = storeToRefs(connectionStore);

const tabStore = useTabStore();
const { activeConnection } = storeToRefs(tabStore);

const loadingRef = ref({ createItem: false });

const dynamoRecordFormRef = ref();
const attributeType = ref([
  { label: 'String', value: 'S' },
  { label: 'Number', value: 'N' },
  { label: 'Boolean', value: 'BOOL' },
  { label: 'Binary', value: 'B' },
  { label: 'Null', value: 'NULL' },
  { label: 'List', value: 'L' },
  { label: 'Map', value: 'M' },
  { label: 'String Set', value: 'SS' },
  { label: 'Number Set', value: 'NS' },
  { label: 'Binary Set', value: 'BS' },
]);

const message = useMessage();
const lang = useLang();

const dynamoRecordForm = ref<{
  partitionKey: string;
  sortKey: string;
  attributes: Array<{ key: string; value: string | number | boolean | null; type: string }>;
  keyAttributes: Array<{ key: string; value: string | number | boolean | null; type: string }>;
}>({ partitionKey: '', sortKey: '', attributes: [], keyAttributes: [] });

const queryResult = ref<{
  columns: Array<{ title: string; key: string }>;
  data: Array<Record<string, unknown>> | undefined;
}>({
  columns: [],
  data: undefined,
});

const addAttributeItem = () => {
  dynamoRecordForm.value.attributes.push({ key: '', value: null, type: '' });
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

const calcType = (type: string) => {
  switch (type) {
    case 'S':
      return 'text';
    case 'N':
      return 'number';
    case 'BOOL':
      return 'checkbox';
    case 'B':
      return 'text';
    case 'NULL':
      return 'text';
    case 'L':
      return 'text';
    case 'M':
      return 'text';
    case 'SS':
      return 'text';
    case 'NS':
      return 'number';
    case 'BS':
      return 'text';
    default:
      return 'text';
  }
};

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
    loadingRef.value.createItem = true;
    const { partitionKey, sortKey } = activeConnection.value as DynamoDBConnection;
    const pkRecord = {
      key: partitionKey.name,
      value: dynamoRecordForm.value.partitionKey,
      type: partitionKey.valueType,
    };
    const skRecord = {
      key: sortKey?.name,
      value: dynamoRecordForm.value.sortKey,
      type: sortKey?.valueType,
    };

    const attributes = [
      ...dynamoRecordForm.value.attributes,
      ...dynamoRecordForm.value.keyAttributes,
      pkRecord,
      ...(skRecord.key ? [skRecord] : []),
    ].filter(({ value }) => value !== null) as Array<{
      key: string;
      value: string | number | boolean | null;
      type: string;
    }>;

    await createItem(activeConnection.value as DynamoDBConnection, attributes);
    message.success(lang.t('editor.dynamo.createItemSuccess'));
  } catch (error) {
    const { status, details } = error as CustomError;
    message.error(`status: ${status}, details: ${details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3600,
    });
  } finally {
    loadingRef.value.createItem = false;
  }
};

const handleReset = () => {
  dynamoRecordForm.value = { partitionKey: '', sortKey: '', attributes: [], keyAttributes: [] };

  if (dynamoRecordFormRef.value) {
    dynamoRecordFormRef.value.restoreValidation();
  }
};

fetchIndices(activeConnection.value as Connection).then(() => {
  const { partitionKey, sortKey, attributeDefinitions } =
    activeConnection.value as DynamoDBConnection;

  dynamoRecordForm.value.keyAttributes = attributeDefinitions
    .map(({ attributeName, attributeType }) => ({
      key: attributeName,
      value: null,
      type: attributeType,
    }))
    .filter(({ key }) => ![partitionKey.name, sortKey?.name].filter(Boolean).includes(key));
});
</script>

<style lang="scss" scoped>
.create-item-container {
  width: 100%;
  height: 100%;

  .form-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;

    .form-scroll-container {
      flex: 1;
      height: 0;
    }
  }
}

.card-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
