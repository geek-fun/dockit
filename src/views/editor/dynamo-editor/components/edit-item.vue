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
                  <Input v-model="keyEntry.value as string" disabled />
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
                  <Select
                    :model-value="attrEntry.type"
                    @update:model-value="val => onAttributeTypeChange(attrEntry, val as string)"
                  >
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
                  <div v-if="attrEntry.type === 'B'" class="flex w-full items-center gap-1">
                    <Input
                      v-model="attrEntry.value as string"
                      :placeholder="$t('editor.dynamo.inputAttrValue')"
                      class="flex-1"
                      autocomplete="off"
                      autocorrect="off"
                      autocapitalize="off"
                      spellcheck="false"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-6 w-6 shrink-0"
                      :title="$t('editor.dynamo.loadBinaryFile')"
                      @click="loadBinaryValue(attrEntry)"
                    >
                      <span class="i-carbon-upload h-4 w-4" />
                    </Button>
                  </div>
                  <Input
                    v-else-if="isStructuredType(attrEntry.type)"
                    :model-value="(attrEntry.value as string) ?? ''"
                    readonly
                    class="cursor-pointer"
                    :placeholder="typeValueTemplate(attrEntry.type)"
                    @click="openStructuredEditor(index)"
                  />
                  <Input
                    v-else-if="attrEntry.type === 'N'"
                    v-model="attrEntry.value as string"
                    inputmode="decimal"
                    :placeholder="$t('editor.dynamo.inputAttrValue')"
                  />
                  <Input v-else-if="attrEntry.type === 'NULL'" model-value="null" disabled />
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

      <StructuredValueDialog
        :open="structuredEditor.open"
        :attribute-type="structuredEditorType"
        :value="structuredEditorValue"
        @update:open="structuredEditor.open = $event"
        @apply="handleStructuredApply"
      />

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
import { useMessageService } from '@/composables';
import StructuredValueDialog from './structured-value-dialog.vue';
import {
  isStructuredType,
  pickBinaryFileAsBase64,
  typeValueTemplate,
  defaultAttributeValue,
  validateAttributeValue,
  buildDynamoEditForm,
  changedDynamoAttributes,
  removedDynamoAttributes,
} from '../utils';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Form, FormItem } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
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
  attributeTypes?: Record<string, string>;
  partitionKeyName: string;
  partitionKeyType: string;
  sortKeyName?: string;
  sortKeyType?: string;
}>();

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  (e: 'submit', keys: AttributeItem[], attributes: AttributeItem[], removed: string[]): void;
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
const originalAttributes = ref<AttributeItem[]>([]);

const getAttributeError = (index: number, field: 'key' | 'type' | 'value') => {
  return errors.value.attributes[index]?.[field];
};

const message = useMessageService();

const onAttributeTypeChange = (attr: AttributeItem, type: string) => {
  attr.type = type;
  attr.value = defaultAttributeValue(type);
};

const loadBinaryValue = async (attr: AttributeItem) => {
  try {
    const base64 = await pickBinaryFileAsBase64();
    if (base64 !== null) attr.value = base64;
  } catch (error) {
    message.error(String(error));
  }
};

const structuredEditor = ref<{ open: boolean; index: number }>({ open: false, index: -1 });
const structuredEditorType = computed(
  () => editForm.value.attributes[structuredEditor.value.index]?.type ?? 'L',
);
const structuredEditorValue = computed(
  () => (editForm.value.attributes[structuredEditor.value.index]?.value as string) ?? null,
);

const openStructuredEditor = (index: number) => {
  structuredEditor.value = { open: true, index };
};

const handleStructuredApply = (value: string) => {
  const target = editForm.value.attributes[structuredEditor.value.index];
  if (target) target.value = value;
};

watch(
  [() => props.show, () => props.item, () => props.attributeTypes],
  ([show, item]) => {
    structuredEditor.value = { open: false, index: -1 };
    if (!show || !item) return;
    editForm.value = buildDynamoEditForm(item, props.attributeTypes ?? {}, [
      { name: props.partitionKeyName, type: props.partitionKeyType },
      ...(props.sortKeyName ? [{ name: props.sortKeyName, type: props.sortKeyType ?? 'S' }] : []),
    ]);
    originalAttributes.value = editForm.value.attributes.map(attr => ({ ...attr }));
    errors.value = { attributes: [] };
  },
  { immediate: true },
);

const addAttribute = () => {
  editForm.value.attributes = [...editForm.value.attributes, { key: '', value: '', type: 'S' }];
  errors.value.attributes = [...errors.value.attributes, {}];
};

const removeAttribute = (index: number) => {
  structuredEditor.value = { open: false, index: -1 };
  editForm.value.attributes = editForm.value.attributes.filter((_, i) => i !== index);
  errors.value.attributes = errors.value.attributes.filter((_, i) => i !== index);
};

const handleClose = () => {
  structuredEditor.value = { open: false, index: -1 };
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

    const duplicates = [...editForm.value.keys, ...editForm.value.attributes].filter(
      entry => entry.key === attr.key,
    );
    if (duplicates.length > 1) {
      attrErrors.key = lang.t('editor.dynamo.duplicateAttribute');
      isValid = false;
    }
    const issue = validateAttributeValue(attr.type, attr.value);
    if (issue) {
      attrErrors.value =
        issue.kind === 'required'
          ? lang.t('editor.dynamo.attributeValueRequired')
          : issue.kind === 'emptySet'
            ? lang.t('editor.dynamo.emptySetNotAllowed')
            : issue.kind === 'syntax'
              ? lang.t('editor.dynamo.jsonInvalidSyntax', { reason: issue.reason })
              : lang.t('editor.dynamo.jsonInvalidShape', { type: attr.type });
      isValid = false;
    }

    errors.value.attributes[index] = attrErrors;
  });

  return isValid;
};

const handleSubmit = async () => {
  if (!validateForm()) {
    return;
  }

  const attributes = changedDynamoAttributes(editForm.value.attributes, originalAttributes.value);
  const removed = removedDynamoAttributes(editForm.value.attributes, originalAttributes.value);
  if (!attributes.length && !removed.length) {
    handleClose();
    return;
  }
  loading.value = true;
  try {
    emit('submit', editForm.value.keys, attributes, removed);
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
