<template>
  <Card class="create-item-container flex flex-col overflow-hidden" :aria-busy="schemaLoading">
    <CardHeader class="flex flex-row items-center justify-between pb-2">
      <CardTitle>{{ $t('editor.dynamo.addAttributesTitle') }}</CardTitle>
    </CardHeader>
    <CardContent class="form-container">
      <div v-if="schemaLoading" class="flex flex-col h-full gap-3">
        <p role="status" aria-live="polite" class="text-sm text-muted-foreground">
          {{ $t('editor.dynamo.loadingTableSchema') }}
        </p>
        <div aria-hidden="true" class="border border-border rounded-lg p-3 shrink-0">
          <div class="text-sm font-medium text-muted-foreground mb-3">Primary Key</div>
          <div class="grid grid-cols-2 gap-3">
            <div v-for="key in 2" :key="key" class="flex flex-col gap-2">
              <div class="skeleton h-3 w-2/5" />
              <div class="skeleton h-8 w-full" />
            </div>
          </div>
        </div>
        <div
          aria-hidden="true"
          class="border border-border rounded-lg p-3 flex-1 min-h-0 flex flex-col gap-3"
        >
          <div class="text-sm font-medium text-muted-foreground">Additional Attributes</div>
          <div v-for="row in 3" :key="row" class="skeleton-attribute-row">
            <div class="skeleton h-8" />
            <div class="skeleton h-8" />
            <div class="skeleton h-8" />
            <div class="skeleton h-8" />
          </div>
        </div>
      </div>
      <Form v-else class="flex flex-col h-full gap-3" @submit.prevent>
        <!-- Top box: Partition Key + Sort Key (fixed) -->
        <div class="border border-border rounded-lg p-3 shrink-0">
          <div class="text-sm font-medium text-muted-foreground mb-2">Primary Key</div>
          <div v-if="schemaError" role="alert" class="text-sm text-destructive">
            <p>{{ $t('editor.dynamo.tableSchemaFailed') }} {{ schemaErrorDetails }}</p>
            <Button variant="outline" class="mt-2" @click="retry">
              {{ $t('editor.dynamo.retryTableSchema') }}
            </Button>
          </div>
          <p v-else-if="!table" class="text-sm text-muted-foreground">
            {{ $t('editor.dynamo.selectTableFirst') }}
          </p>
          <Grid v-else :cols="24" :x-gap="12">
            <GridItem :span="10">
              <FormItem
                v-if="selectedTable.partitionKeyLabel"
                :label="selectedTable.partitionKeyLabel"
                :required="true"
                :error="errors.partitionKey"
              >
                <Input
                  v-model="dynamoRecordForm.partitionKey"
                  :placeholder="$t('editor.dynamo.enterPartitionKey')"
                  autocomplete="off"
                  autocorrect="off"
                  autocapitalize="off"
                  spellcheck="false"
                />
              </FormItem>
            </GridItem>

            <GridItem :span="12">
              <FormItem
                v-if="selectedTable.sortKeyLabel"
                :label="selectedTable.sortKeyLabel"
                :required="true"
                :error="errors.sortKey"
              >
                <Input
                  v-model="dynamoRecordForm.sortKey"
                  :placeholder="$t('editor.dynamo.enterSortKey')"
                  autocomplete="off"
                  autocorrect="off"
                  autocapitalize="off"
                  spellcheck="false"
                />
              </FormItem>
            </GridItem>
          </Grid>
        </div>

        <!-- Key Attributes box -->
        <div
          v-if="dynamoRecordForm.keyAttributes.length > 0"
          class="border border-border rounded-lg p-3 shrink-0 flex flex-col"
          style="max-height: 35%"
        >
          <div class="text-sm font-medium text-muted-foreground mb-2 shrink-0">Key Attributes</div>
          <ScrollArea class="flex-1 min-h-0">
            <Grid
              v-for="(item, index) in dynamoRecordForm.keyAttributes"
              :key="index"
              :cols="24"
              :x-gap="12"
            >
              <GridItem :span="8">
                <FormItem>
                  <Input
                    v-model="item.key"
                    :placeholder="$t('editor.dynamo.inputAttrName')"
                    disabled
                  />
                </FormItem>
              </GridItem>
              <GridItem :span="4">
                <FormItem>
                  <Select v-model="item.type" disabled>
                    <SelectTrigger>
                      <SelectValue :placeholder="$t('editor.dynamo.type')" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        v-for="option in attributeType"
                        :key="option.value"
                        :value="option.value"
                      >
                        {{ option.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              </GridItem>
              <GridItem :span="10">
                <FormItem :error="valueError(validation.keyAttributes[index]?.value, item.type)">
                  <div v-if="item.type === 'B'" class="flex w-full items-center gap-1">
                    <Input
                      v-model="item.value as string"
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
                      @click="loadBinaryValue(item)"
                    >
                      <span class="i-carbon-upload h-4 w-4" />
                    </Button>
                  </div>
                  <Input
                    v-else-if="item.type === 'N'"
                    v-model="item.value as string"
                    inputmode="decimal"
                    :placeholder="$t('editor.dynamo.inputAttrValue')"
                  />
                  <Input v-else-if="item.type === 'NULL'" model-value="null" disabled />
                  <Switch
                    v-else-if="item.type === 'BOOL'"
                    :checked="item.value as boolean"
                    @update:checked="val => (item.value = val)"
                  />
                  <Input
                    v-else
                    v-model="item.value as string"
                    :placeholder="$t('editor.dynamo.inputAttrValue')"
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="off"
                    spellcheck="false"
                  />
                </FormItem>
              </GridItem>
              <GridItem :span="2" class="flex items-end mb-px">
                <Button variant="ghost" size="icon" @click="removeKeyAttributeItem(index)">
                  <span class="i-carbon-trash-can h-4 w-4" />
                </Button>
              </GridItem>
            </Grid>
          </ScrollArea>
        </div>

        <!-- Additional Attributes box -->
        <div class="border border-border rounded-lg p-3 flex-1 min-h-0 flex flex-col">
          <div class="flex items-center justify-between mb-2 shrink-0">
            <div class="text-sm font-medium text-muted-foreground">Additional Attributes</div>
            <Button variant="ghost" size="icon" class="h-6 w-6" @click="addAttributeItem">
              <span class="i-carbon-add h-4 w-4" />
            </Button>
          </div>
          <ScrollArea class="flex-1 min-h-0">
            <Grid
              v-for="(item, index) in dynamoRecordForm.attributes"
              :key="index"
              :cols="24"
              :x-gap="12"
            >
              <GridItem :span="8">
                <FormItem :error="getAttributeError(index, 'key')">
                  <Input
                    v-model="item.key"
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
                    :model-value="item.type"
                    @update:model-value="val => onAttributeTypeChange(item, val as string)"
                  >
                    <SelectTrigger>
                      <SelectValue :placeholder="$t('editor.dynamo.type')" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        v-for="option in attributeType"
                        :key="option.value"
                        :value="option.value"
                      >
                        {{ option.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              </GridItem>
              <GridItem :span="10">
                <FormItem :error="getAttributeError(index, 'value')">
                  <div v-if="item.type === 'B'" class="flex w-full items-center gap-1">
                    <Input
                      v-model="item.value as string"
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
                      @click="loadBinaryValue(item)"
                    >
                      <span class="i-carbon-upload h-4 w-4" />
                    </Button>
                  </div>
                  <Input
                    v-else-if="isStructuredType(item.type)"
                    :model-value="(item.value as string) ?? ''"
                    readonly
                    class="cursor-pointer"
                    :placeholder="typeValueTemplate(item.type)"
                    @click="openStructuredEditor(index)"
                  />
                  <Input
                    v-else-if="item.type === 'N'"
                    v-model="item.value as string"
                    inputmode="decimal"
                    :placeholder="$t('editor.dynamo.inputAttrValue')"
                  />
                  <Input v-else-if="item.type === 'NULL'" model-value="null" disabled />
                  <Switch
                    v-else-if="item.type === 'BOOL'"
                    :checked="item.value as boolean"
                    @update:checked="val => (item.value = val)"
                  />
                  <Input
                    v-else
                    v-model="item.value as string"
                    :placeholder="$t('editor.dynamo.inputAttrValue')"
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="off"
                    spellcheck="false"
                  />
                </FormItem>
              </GridItem>
              <GridItem :span="2" class="flex items-end mb-px">
                <Button variant="ghost" size="icon" @click="removeAttributeItem(index)">
                  <span class="i-carbon-trash-can h-4 w-4" />
                </Button>
              </GridItem>
            </Grid>
          </ScrollArea>
        </div>
      </Form>
      <StructuredValueDialog
        :open="structuredEditor.open"
        :attribute-type="structuredEditorType"
        :value="structuredEditorValue"
        @update:open="structuredEditor.open = $event"
        @apply="handleStructuredApply"
      />
    </CardContent>
    <CardFooter class="card-footer shrink-0">
      <Button
        variant="outline"
        :disabled="schemaLoading || loadingRef.createItem"
        @click="handleReset"
      >
        {{ $t('dialogOps.reset') }}
      </Button>
      <Button :disabled="!validationPassed || loadingRef.createItem" @click="handleSubmit">
        <Loader2 v-if="loadingRef.createItem" class="mr-2 h-4 w-4 animate-spin" />
        {{ $t('dialogOps.create') }}
      </Button>
    </CardFooter>
  </Card>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Loader2 } from 'lucide-vue-next';
import { useMessageService } from '@/composables';
import {
  DynamoDBConnection,
  DatabaseType,
  useConnectionStore,
  useTabStore,
  findTable,
} from '../../../../store';
import { CustomError, withLoadingDelay } from '../../../../common';
import { useLang } from '../../../../lang';

import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Form, FormItem } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import StructuredValueDialog from './structured-value-dialog.vue';
import {
  isStructuredType,
  pickBinaryFileAsBase64,
  resolveTableKeyLabels,
  typeValueTemplate,
  defaultAttributeValue,
  validateDynamoItemForm,
  buildDynamoItemAttributes,
  type AttributeValueIssue,
} from '../utils';
import { useDynamoItemForm } from '../composables';
import { Button } from '@/components/ui/button';
import { Grid, GridItem } from '@/components/ui/grid';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const connectionStore = useConnectionStore();

const { fetchIndices, createItem } = connectionStore;

const tabStore = useTabStore();
const { activeConnection } = storeToRefs(tabStore);

const loadingRef = ref({ createItem: false });

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

const message = useMessageService();
const lang = useLang();

const {
  table,
  form: dynamoRecordForm,
  schemaLoading,
  schemaError,
  reset,
  retry,
} = useDynamoItemForm(
  () =>
    activeConnection.value?.type === DatabaseType.DYNAMODB
      ? (activeConnection.value as DynamoDBConnection)
      : undefined,
  () => tabStore.activePanel?.activeTable,
  async (connection, name) => {
    await withLoadingDelay(fetchIndices(connection, name));
    const stored = connectionStore.connections.find(
      con => con.id === connection.id,
    ) as DynamoDBConnection;
    return findTable(stored, name);
  },
);

const validation = computed(() => validateDynamoItemForm(dynamoRecordForm.value, table.value));
const valueError = (issue: AttributeValueIssue | null | undefined, type: string) => {
  if (!issue) return undefined;
  if (issue.kind === 'required') return lang.t('editor.dynamo.attributeValueRequired');
  if (issue.kind === 'emptySet') return lang.t('editor.dynamo.emptySetNotAllowed');
  if (issue.kind === 'syntax')
    return lang.t('editor.dynamo.jsonInvalidSyntax', { reason: issue.reason });
  return lang.t('editor.dynamo.jsonInvalidShape', { type });
};
const errors = computed(() => ({
  partitionKey: valueError(
    validation.value.partitionKey,
    table.value?.partitionKey?.valueType ?? '',
  ),
  sortKey: valueError(validation.value.sortKey, table.value?.sortKey?.valueType ?? ''),
  attributes: validation.value.attributes.map((attr, index) => ({
    key: attr.key
      ? lang.t(
          attr.key === 'duplicate'
            ? 'editor.dynamo.duplicateAttribute'
            : 'editor.dynamo.attributeNameRequired',
        )
      : undefined,
    type: attr.type ? lang.t('editor.dynamo.attributeTypeRequired') : undefined,
    value: valueError(attr.value, dynamoRecordForm.value.attributes[index].type),
  })),
}));
const schemaErrorDetails = computed(() => {
  const error = schemaError.value as CustomError | Error | null;
  return error && ('details' in error ? error.details : (error.message ?? String(error)));
});

const addAttributeItem = () => {
  dynamoRecordForm.value.attributes = [
    ...dynamoRecordForm.value.attributes,
    { key: '', value: null, type: '' },
  ];
};

const removeAttributeItem = (index: number) => {
  structuredEditor.value = { open: false, index: -1 };
  dynamoRecordForm.value.attributes = dynamoRecordForm.value.attributes.filter(
    (_, i) => i !== index,
  );
};

const removeKeyAttributeItem = (index: number) => {
  dynamoRecordForm.value.keyAttributes = dynamoRecordForm.value.keyAttributes.filter(
    (_, i) => i !== index,
  );
};

const getAttributeError = (index: number, field: 'key' | 'type' | 'value') => {
  return errors.value.attributes[index]?.[field];
};

const onAttributeTypeChange = (
  item: { type: string; value: string | number | boolean | null },
  type: string,
) => {
  item.type = type;
  item.value = defaultAttributeValue(type);
};

const loadBinaryValue = async (item: { value: string | number | boolean | null }) => {
  try {
    const base64 = await pickBinaryFileAsBase64();
    if (base64 !== null) item.value = base64;
  } catch (error) {
    message.error(String(error));
  }
};

const structuredEditor = ref<{ open: boolean; index: number }>({ open: false, index: -1 });
const structuredEditorType = computed(
  () => dynamoRecordForm.value.attributes[structuredEditor.value.index]?.type ?? 'L',
);
const structuredEditorValue = computed(
  () => (dynamoRecordForm.value.attributes[structuredEditor.value.index]?.value as string) ?? null,
);

const openStructuredEditor = (index: number) => {
  structuredEditor.value = { open: true, index };
};

const handleStructuredApply = (value: string) => {
  const target = dynamoRecordForm.value.attributes[structuredEditor.value.index];
  if (target) target.value = value;
};

const selectedTable = computed(() => resolveTableKeyLabels(table.value));
const validationPassed = computed(
  () => !schemaLoading.value && !schemaError.value && validation.value.valid,
);

watch(
  table,
  () => {
    structuredEditor.value = { open: false, index: -1 };
  },
  { flush: 'sync' },
);

const handleSubmit = async (event: MouseEvent) => {
  event.preventDefault();
  if (!activeConnection.value) {
    message.error(`status: 500, ${lang.t('connection.selectIndex')}`);
    return;
  }
  if (loadingRef.value.createItem) return;
  if (!validationPassed.value || !table.value) {
    message.error(lang.t('connection.validationFailed'));
    return;
  }

  try {
    loadingRef.value.createItem = true;
    const tableName = tabStore.activePanel?.activeTable;
    if (!tableName) {
      message.error(lang.t('dialogOps.noActiveTable'));
      return;
    }
    const partitionKey = table.value.partitionKey!;
    const attributes = buildDynamoItemAttributes(dynamoRecordForm.value, table.value);

    // Guard against silently overwriting an existing item: the Rust side adds
    // an attribute_not_exists(pk) condition when skipExisting is set, so a
    // duplicate key leaves the existing record intact.
    const result = await createItem(
      activeConnection.value as DynamoDBConnection,
      tableName,
      attributes,
      {
        skipExisting: true,
        partitionKey: partitionKey.name,
      },
    );
    if (result.skipped) {
      message.warning(lang.t('editor.dynamo.itemAlreadyExists'));
    } else {
      message.success(lang.t('editor.dynamo.createItemSuccess'));
    }
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
  structuredEditor.value = { open: false, index: -1 };
  reset();
};
</script>

<style scoped>
.create-item-container {
  width: 100%;
  flex: 1;
  min-height: 0;
}

.form-container {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.card-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 12px 16px;
}

.skeleton {
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    hsl(var(--muted) / 0.6) 25%,
    hsl(var(--muted) / 0.9) 50%,
    hsl(var(--muted) / 0.6) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}

.skeleton-attribute-row {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 2.5fr) 2rem;
  gap: 12px;
}

@keyframes shimmer {
  from {
    background-position: -200% 0;
  }
  to {
    background-position: 200% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
  }
}
</style>
