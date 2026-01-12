<template>
  <n-modal
    v-model:show="showModal"
    preset="dialog"
    :title="$t('editor.dynamo.editItemTitle')"
    style="width: 900px"
  >
    <n-form
      ref="editFormRef"
      :model="editForm"
      label-placement="left"
      require-mark-placement="right-hanging"
      label-width="auto"
    >
      <!-- Key attributes (read-only) -->
      <n-divider title-placement="left">{{ $t('editor.dynamo.keyAttributes') }}</n-divider>
      <n-grid v-for="(item, index) in editForm.keys" :key="`key-${index}`" :cols="24" :x-gap="12">
        <n-grid-item span="8">
          <n-form-item>
            <n-input v-model:value="item.key" disabled />
          </n-form-item>
        </n-grid-item>
        <n-grid-item span="4">
          <n-form-item>
            <n-select v-model:value="item.type" :options="attributeTypeOptions" disabled />
          </n-form-item>
        </n-grid-item>
        <n-grid-item span="12">
          <n-form-item>
            <n-input-number
              v-if="item.type === 'N'"
              v-model:value="item.value as number"
              style="width: 100%"
              disabled
            />
            <n-input v-else v-model:value="item.value as string" disabled />
          </n-form-item>
        </n-grid-item>
      </n-grid>

      <!-- Editable attributes -->
      <n-divider title-placement="left">
        {{ $t('editor.dynamo.editableAttributes') }}
        <n-icon size="20" @click="addAttribute" style="cursor: pointer; margin-left: 8px">
          <Add />
        </n-icon>
      </n-divider>
      <n-grid
        v-for="(item, index) in editForm.attributes"
        :key="`attr-${index}`"
        :cols="24"
        :x-gap="12"
      >
        <n-grid-item span="7">
          <n-form-item
            :path="`attributes[${index}].key`"
            :rule="{
              required: true,
              message: lang.t('editor.dynamo.attributeNameRequired'),
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
              message: lang.t('editor.dynamo.attributeTypeRequired'),
              trigger: ['input', 'blur'],
            }"
          >
            <n-select
              v-model:value="item.type"
              :placeholder="$t('editor.dynamo.type')"
              :options="attributeTypeOptions"
            />
          </n-form-item>
        </n-grid-item>
        <n-grid-item span="11">
          <n-form-item
            :path="`attributes[${index}].value`"
            :rule="{
              required: true,
              validator: (rule: any, value: any) => {
                if (item.type === 'N') {
                  return typeof value === 'number';
                }
                if (item.type === 'BOOL') {
                  return typeof value === 'boolean';
                }
                if (item.type === 'NULL') {
                  return true;
                }
                return value !== null && value !== undefined && value !== '';
              },
              message: lang.t('editor.dynamo.attributeValueRequired'),
              trigger: ['input', 'blur', 'change'],
            }"
          >
            <n-input-number
              v-if="item.type === 'N'"
              v-model:value="item.value as number"
              :placeholder="$t('editor.dynamo.inputAttrValue')"
              style="width: 100%"
            />
            <n-switch v-else-if="item.type === 'BOOL'" v-model:value="item.value as boolean" />
            <n-input
              v-else
              v-model:value="item.value as string"
              :placeholder="$t('editor.dynamo.inputAttrValue')"
              :input-props="inputProps"
            />
          </n-form-item>
        </n-grid-item>
        <n-grid-item span="2">
          <n-button quaternary circle @click="removeAttribute(index)">
            <template #icon>
              <n-icon>
                <Delete />
              </n-icon>
            </template>
          </n-button>
        </n-grid-item>
      </n-grid>
    </n-form>
    <template #action>
      <n-button @click="handleClose">{{ $t('dialogOps.cancel') }}</n-button>
      <n-button type="primary" @click="handleSubmit" :loading="loading">
        {{ $t('dialogOps.confirm') }}
      </n-button>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { Add, Delete } from '@vicons/carbon';
import { FormValidationError } from 'naive-ui';
import { inputProps } from '../../../../common';
import { useLang } from '../../../../lang';

const lang = useLang();

type AttributeItem = {
  key: string;
  value: string | number | boolean | null;
  type: string;
};

const props = defineProps<{
  show: boolean;
  item: Record<string, unknown> | null;
  partitionKeyName: string;
  partitionKeyType: string;
  sortKeyName?: string;
  sortKeyType?: string;
}>();

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  (e: 'submit', keys: AttributeItem[], attributes: AttributeItem[]): void;
}>();

const showModal = computed({
  get: () => props.show,
  set: (value: boolean) => emit('update:show', value),
});

const loading = ref(false);
const editFormRef = ref();

const attributeTypeOptions = ref([
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

const editForm = ref<{
  keys: AttributeItem[];
  attributes: AttributeItem[];
}>({
  keys: [],
  attributes: [],
});

const inferType = (value: unknown): string => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'string') return 'S';
  if (typeof value === 'number') return 'N';
  if (typeof value === 'boolean') return 'BOOL';
  if (Array.isArray(value)) return 'L';
  if (typeof value === 'object') return 'M';
  return 'S';
};

const formatValue = (value: unknown, type: string): string | number | boolean | null => {
  if (type === 'N' && typeof value === 'number') return value;
  if (type === 'BOOL' && typeof value === 'boolean') return value;
  if (type === 'NULL') return null;
  if (type === 'L' || type === 'M' || type === 'SS' || type === 'NS' || type === 'BS') {
    return JSON.stringify(value);
  }
  return String(value ?? '');
};

watch(
  () => props.item,
  newItem => {
    if (newItem) {
      const keys: AttributeItem[] = [];
      const attributes: AttributeItem[] = [];

      // Extract partition key - check if the key name exists and is not empty
      if (props.partitionKeyName && props.partitionKeyName.trim() !== '') {
        const partitionValue = newItem[props.partitionKeyName];

        if (partitionValue !== undefined) {
          keys.push({
            key: props.partitionKeyName,
            value: formatValue(partitionValue, props.partitionKeyType),
            type: props.partitionKeyType,
          });
        }
      }

      // Extract sort key if present
      if (props.sortKeyName && props.sortKeyType && props.sortKeyName.trim() !== '') {
        const sortValue = newItem[props.sortKeyName];

        if (sortValue !== undefined) {
          keys.push({
            key: props.sortKeyName,
            value: formatValue(sortValue, props.sortKeyType),
            type: props.sortKeyType,
          });
        }
      }

      // Extract other attributes
      for (const [attrKey, attrValue] of Object.entries(newItem)) {
        if (attrKey !== props.partitionKeyName && attrKey !== props.sortKeyName) {
          const type = inferType(attrValue);
          attributes.push({
            key: attrKey,
            value: formatValue(attrValue, type),
            type,
          });
        }
      }

      editForm.value = { keys, attributes };
    }
  },
  { immediate: true },
);

const addAttribute = () => {
  editForm.value.attributes.push({ key: '', value: null, type: 'NULL' });
};

const removeAttribute = (index: number) => {
  editForm.value.attributes.splice(index, 1);
};

const handleClose = () => {
  showModal.value = false;
};

const validateForm = async () => {
  try {
    return await editFormRef.value?.validate((errors: Array<FormValidationError>) => !errors);
  } catch (e) {
    return false;
  }
};

const handleSubmit = async () => {
  if (!(await validateForm())) {
    return;
  }

  const attributes = editForm.value.attributes.filter(attr => attr.type !== 'NULL');
  loading.value = true;
  try {
    emit('submit', editForm.value.keys, attributes);
  } finally {
    loading.value = false;
  }
};
</script>

<style lang="scss" scoped></style>
