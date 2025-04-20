<template>
  <div class="dynamo-editor">
    <tool-bar type="DYNAMO_EDITOR" />
    <n-card>
      <n-form
        ref="formRef"
        :model="dynamoQueryForm"
        label-placement="left"
        require-mark-placement="right-hanging"
        label-width="auto"
      >
        <!-- First row with partition and sort key -->
        <n-grid :cols="24" :x-gap="12">
          <n-grid-item span="11">
            <n-form-item label="Table Or Index" path="index">
              <n-select
                placeholder="Select Table Or Index"
                remote
                :loading="loadingRef.index"
                :default-value="dynamoQueryForm.index"
                @update:show="handleIndexOpen"
                @update:value="handleUpdate"
                :options="indicesOrTableOptions"
              />
            </n-form-item>
            <n-form-item
              v-if="selectedIndexOrTable?.partitionKeyName"
              :label="getLabel('PARTITION_KEY')"
              path="partitionKey"
            >
              <n-input
                v-model:value="dynamoQueryForm.partitionKey"
                placeholder="Enter Partition Key Value"
              />
            </n-form-item>
          </n-grid-item>
          <n-grid-item span="11">
            <n-form-item
              v-if="selectedIndexOrTable?.sortKeyName"
              :label="getLabel('SORT_KEY')"
              path="sortKey"
            >
              <n-input v-model:value="dynamoQueryForm.sortKey" placeholder="Enter Sort Key Value" />
            </n-form-item>
          </n-grid-item>
          <n-grid-item span="2" style="display: flex; align-items: center; justify-content: center">
            <n-button quaternary circle @click="addFormItem">
              <template #icon>
                <n-icon>
                  <plus-outlined />
                </n-icon>
              </template>
            </n-button>
          </n-grid-item>
        </n-grid>

        <!-- Dynamic additional form items -->
        <n-grid v-for="(item, index) in additionalFormItems" :key="index" :cols="24" :x-gap="12">
          <n-grid-item span="9">
            <n-form-item :path="`additionalFormItems[${index}].key`">
              <n-input v-model:value="item.key" placeholder="Input Attribute Name" />
            </n-form-item>
          </n-grid-item>
          <n-grid-item span="4">
            <n-form-item :path="`additionalFormItems[${index}].operator`">
              <n-select
                v-model:value="item.operator"
                placeholder="Select Operator"
                :options="filterConditions"
              />
            </n-form-item>
          </n-grid-item>
          <n-grid-item span="9">
            <n-form-item :path="`additionalFormItems[${index}].value`">
              <n-input v-model:value="item.value" placeholder="Input Attribute Value" />
            </n-form-item>
          </n-grid-item>
          <n-grid-item span="2" style="display: flex; align-items: center; justify-content: center">
            <n-button quaternary circle @click="addFormItem">
              <template #icon>
                <n-icon>
                  <plus-outlined />
                </n-icon>
              </template>
            </n-button>
          </n-grid-item>
        </n-grid>
      </n-form>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { PlusOutlined } from '@vicons/antd';
import ToolBar from '../../../components/tool-bar.vue';
import {
  Connection,
  DynamoDBConnection,
  DynamoIndexOrTableOption,
  useConnectionStore,
  useTabStore,
} from '../../../store';

const connectionStore = useConnectionStore();

const { fetchIndices } = connectionStore;
const { getDynamoIndexOrTableOption } = storeToRefs(connectionStore);

const tabStore = useTabStore();
const { activeConnection } = storeToRefs(tabStore);

const filterConditions = ref([
  {
    label: 'Equal to',
    value: 'Equal to',
  },
  {
    label: 'Not equal to',
    value: 'Not equal to',
  },
  {
    label: 'Less than or equal to',
    value: 'Less than or equal to',
  },
  {
    label: 'Less than',
    value: 'Less than',
  },
  {
    label: 'Greater than or equal to',
    value: 'Greater than or equal to',
  },
  {
    label: 'Greater than',
    value: 'Greater than',
  },
  {
    label: 'Between',
    value: 'Between',
  },
  {
    label: 'Exists',
    value: 'Exists',
  },
  {
    label: 'Not exists',
    value: 'Not exists',
  },
  {
    label: 'Contain',
    value: 'Contain',
  },
  {
    label: 'Not contain',
    value: 'Not contain',
  },
  {
    label: 'Begins with',
    value: 'Begins with',
  },
]);

const loadingRef = ref({ index: false });

const dynamoQueryForm = ref({
  index: '',
  partitionKey: '',
  sortKey: '',
});

const additionalFormItems = ref<{ key: string; value: string; operator: string }[]>([]);

const addFormItem = () => {
  additionalFormItems.value.push({
    key: '',
    value: '',
    operator: '',
  });
};

const indicesOrTableOptions = ref<Array<DynamoIndexOrTableOption>>([]);

const selectedIndexOrTable = ref<DynamoIndexOrTableOption | undefined>(undefined);

const handleUpdate = (value: string) => {
  const indices = getDynamoIndexOrTableOption.value(activeConnection.value as DynamoDBConnection);
  selectedIndexOrTable.value = indices.find(item => item.value === value);
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
    console.error('Error fetching indices:', err);
  } finally {
    loadingRef.value.index = false;
  }
};
</script>

<style lang="scss" scoped></style>
