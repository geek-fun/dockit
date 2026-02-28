<template>
  <Dialog :open="showModal" @update:open="handleOpenChange">
    <DialogContent class="sm:max-w-[900px]" :show-close="false">
      <DialogHeader>
        <DialogTitle>{{ $t('editor.dynamo.editItemTitle') }}</DialogTitle>
        <button
          class="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
          @click="handleClose"
        >
          <X class="h-5 w-5" />
        </button>
      </DialogHeader>

      <div class="modal-content">
        <Form class="edit-form" @submit.prevent>
          <!-- Key attributes (read-only) -->
          <div class="key-attributes-section">
            <div class="text-sm font-medium text-muted-foreground mb-2">
              {{ $t('editor.dynamo.keyAttributes') }}
            </div>
            <Grid
              v-for="(keyEntry, index) in editForm.keys"
              :key="`key-${index}`"
              :cols="24"
              :x-gap="12"
            >
              <GridItem :span="8">
                <FormItem>
                  <Input v-model="keyEntry.key" disabled />
                </FormItem>
              </GridItem>
              <GridItem :span="4">
                <FormItem>
                  <Select v-model="keyEntry.type" disabled>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        v-for="option in attributeTypeOptions"
                        :key="option.value"
                        :value="option.value"
                      >
                        {{ option.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              </GridItem>
              <GridItem :span="12">
                <FormItem>
                  <InputNumber
                    v-if="keyEntry.type === 'N'"
                    v-model:model-value="keyEntry.value as number"
                    class="w-full"
                    disabled
                  />
                  <Input v-else v-model="keyEntry.value as string" disabled />
                </FormItem>
              </GridItem>
            </Grid>
          </div>

          <!-- Editable attributes -->
          <Separator class="my-4" />
          <div class="flex items-center gap-2 mb-2 shrink-0">
            <span class="text-sm font-medium text-muted-foreground">
              {{ $t('editor.dynamo.editableAttributes') }}
            </span>
            <Button variant="ghost" size="icon" class="h-6 w-6" @click="addAttribute">
              <span class="i-carbon-add h-4 w-4" />
            </Button>
          </div>
          <ScrollArea class="editable-attributes-scroll">
            <Grid
              v-for="(attrEntry, index) in editForm.attributes"
              :key="`attr-${index}`"
              :cols="24"
              :x-gap="12"
            >
              <GridItem :span="7">
                <FormItem :error="getAttributeError(index, 'key')">
                  <Input
                    v-model="attrEntry.key"
                    :placeholder="$t('editor.dynamo.inputAttrName')"
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="off"
                    spellcheck="false"
                  />
                </FormItem>
              </GridItem>
              <GridItem :span="4">
                <FormItem :error="getAttributeError(index, 'type')">
                  <Select v-model="attrEntry.type">
                    <SelectTrigger>
                      <SelectValue :placeholder="$t('editor.dynamo.type')" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        v-for="option in attributeTypeOptions"
                        :key="option.value"
                        :value="option.value"
                      >
                        {{ option.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              </GridItem>
              <GridItem :span="11">
                <FormItem :error="getAttributeError(index, 'value')">
                  <InputNumber
                    v-if="attrEntry.type === 'N'"
                    v-model:model-value="attrEntry.value as number"
                    :placeholder="$t('editor.dynamo.inputAttrValue')"
                    class="w-full"
                  />
                  <Switch
                    v-else-if="attrEntry.type === 'BOOL'"
                    :checked="attrEntry.value as boolean"
                    @update:checked="val => (attrEntry.value = val)"
                  />
                  <Input
                    v-else-if="attrEntry.type && attrEntry.type !== 'NULL'"
                    v-model="attrEntry.value as string"
                    :placeholder="$t('editor.dynamo.inputAttrValue')"
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="off"
                    spellcheck="false"
                  />
                  <Input
                    v-else
                    model-value=""
                    disabled
                    :placeholder="$t('editor.dynamo.selectTypeFirst')"
                  />
                </FormItem>
              </GridItem>
              <GridItem :span="2">
                <Button variant="ghost" size="icon" @click="removeAttribute(index)">
                  <span class="i-carbon-trash-can h-4 w-4" />
                </Button>
              </GridItem>
            </Grid>
          </ScrollArea>
        </Form>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="handleClose">{{ $t('dialogOps.cancel') }}</Button>
        <Button :disabled="loading" @click="handleSubmit">
          <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
          {{ $t('dialogOps.confirm') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { X, Loader2 } from 'lucide-vue-next';
import { useLang } from '../../../../lang';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Form, FormItem } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { InputNumber } from '@/components/ui/input-number';
import { Button } from '@/components/ui/button';
import { Grid, GridItem } from '@/components/ui/grid';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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

const handleOpenChange = (open: boolean) => {
  if (!open) {
    handleClose();
  }
};

const loading = ref(false);

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

const errors = ref<{
  attributes: Array<{ key?: string; type?: string; value?: string }>;
}>({ attributes: [] });

const getAttributeError = (index: number, field: 'key' | 'type' | 'value') => {
  return errors.value.attributes[index]?.[field];
};

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
      errors.value = { attributes: attributes.map(() => ({})) };
    }
  },
  { immediate: true },
);

const addAttribute = () => {
  editForm.value.attributes.push({ key: '', value: null, type: 'NULL' });
  errors.value.attributes.push({});
};

const removeAttribute = (index: number) => {
  editForm.value.attributes.splice(index, 1);
  errors.value.attributes.splice(index, 1);
};

const handleClose = () => {
  showModal.value = false;
};

const validateForm = (): boolean => {
  let isValid = true;
  errors.value = { attributes: [] };

  editForm.value.attributes.forEach((attr, index) => {
    const attrErrors: { key?: string; type?: string; value?: string } = {};

    if (!attr.key) {
      attrErrors.key = lang.t('editor.dynamo.attributeNameRequired');
      isValid = false;
    }

    if (!attr.type) {
      attrErrors.type = lang.t('editor.dynamo.attributeTypeRequired');
      isValid = false;
    }

    // Validate value based on type
    if (attr.type !== 'NULL') {
      if (attr.type === 'N' && typeof attr.value !== 'number') {
        attrErrors.value = lang.t('editor.dynamo.attributeValueRequired');
        isValid = false;
      } else if (attr.type === 'BOOL' && typeof attr.value !== 'boolean') {
        attrErrors.value = lang.t('editor.dynamo.attributeValueRequired');
        isValid = false;
      } else if (
        attr.type !== 'N' &&
        attr.type !== 'BOOL' &&
        (attr.value === null || attr.value === undefined || attr.value === '')
      ) {
        attrErrors.value = lang.t('editor.dynamo.attributeValueRequired');
        isValid = false;
      }
    }

    errors.value.attributes[index] = attrErrors;
  });

  return isValid;
};

const handleSubmit = async () => {
  if (!validateForm()) {
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

<style scoped>
.modal-content {
  min-height: 0;
  max-height: 60vh;
  overflow: hidden;
}

.edit-form {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 60vh;
  overflow: hidden;
}

.key-attributes-section {
  flex-shrink: 0;
}

.editable-attributes-scroll {
  flex: 1;
  min-height: 0;
  max-height: 100%;
}
</style>
