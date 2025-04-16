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
                v-model:value="dynamoQueryForm.index"
                placeholder="Select Table Or Index"
                remote
                :loading="loadingRef.index"
                @update:show="handleIndexOpen"
                :options="generalOptions"
              />
            </n-form-item>
            <n-form-item label="Partition Key" path="partitionKey">
              <n-select
                v-model:value="dynamoQueryForm.partitionKey"
                placeholder="Enter Partition Key Value"
                :options="generalOptions"
              />
            </n-form-item>
          </n-grid-item>
          <n-grid-item span="11">
            <n-form-item label="Sort Key" path="sortKey">
              <n-select
                v-model:value="dynamoQueryForm.sortKey"
                placeholder="Select"
                :options="generalOptions"
              />
            </n-form-item>
          </n-grid-item>
          <n-grid-item span="2" style="display: flex; align-items: center; justify-content: center">
            <n-button quaternary circle @click="addFormItem">
              <template #icon>
                <n-icon>
                  <plus-icon />
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
                  <plus-icon />
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
import ToolBar from '../../../components/tool-bar.vue';
import { PlusOutlined as PlusIcon } from '@vicons/antd';

const generalOptions = ref([
  {
    label: 'String',
    value: 'string',
  },
  {
    label: 'Number',
    value: 'number',
  },
  {
    label: 'Boolean',
    value: 'boolean',
  },
]);

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

const handleIndexOpen = async (isOpen: boolean) => {
  if (!isOpen) {
    loadingRef.value.index = false;
    return;
  }
  loadingRef.value.index = true;
  try {
    // Simulate fetching indices
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (err) {
    console.error('Error fetching indices:', err);
  } finally {
    loadingRef.value.index = false;
  }
};
</script>

<style lang="scss" scoped></style>
