<template>
  <Card class="create-item-container flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    <CardContent class="flex min-h-0 flex-1 flex-col p-3" :aria-busy="saving" :inert="writeBlocked">
      <div v-if="schemaLoading" class="flex flex-col gap-3">
        <p role="status" class="text-sm text-muted-foreground">
          {{ $t('editor.dynamo.loadingTableSchema') }}
        </p>
        <div v-if="showSchemaSkeleton" aria-hidden="true" class="primary-key-grid">
          <div v-for="key in 2" :key="key" class="flex flex-col gap-2">
            <div class="skeleton h-3 w-2/5" />
            <div class="skeleton h-8 w-full" />
          </div>
        </div>
      </div>
      <div v-else-if="schemaError" role="alert" class="text-sm text-destructive-text">
        <p class="break-words">
          {{ $t('editor.dynamo.tableSchemaFailed') }} {{ describeSchemaError(schemaError) }}
        </p>
        <Button type="button" variant="outline" class="mt-2" @click="retry">
          {{ $t('editor.dynamo.retryTableSchema') }}
        </Button>
      </div>
      <p
        v-else-if="!table"
        role="status"
        class="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-medium text-warning-text"
      >
        <span class="i-carbon-warning-alt h-4 w-4 shrink-0" aria-hidden="true" />
        {{ $t('editor.dynamo.selectTableFirst') }}
      </p>

      <form
        v-else
        :id="formId"
        ref="formElement"
        class="flex min-h-0 flex-1 flex-col gap-2"
        novalidate
        @submit.prevent="handleSubmit"
      >
        <section
          :aria-labelledby="`${formId}-primary`"
          class="shrink-0 space-y-1 rounded-md border border-border bg-muted/30 p-2"
        >
          <h3 :id="`${formId}-primary`" class="flex items-center gap-1.5 text-sm font-medium">
            <span class="i-lucide-key-round h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {{ $t('editor.dynamo.primaryKey') }}
          </h3>
          <div class="primary-key-grid">
            <FormItem
              v-for="key in primaryKeys"
              :key="key.field"
              :control-id="`${formId}-${key.field}`"
              :label="key.label"
              label-class="flex-wrap"
              required
              :error="key.error"
            >
              <template #label>
                <span class="sr-only">{{ key.label }}</span>
                <span
                  aria-hidden="true"
                  class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
                >
                  <span class="break-all font-mono font-semibold text-foreground">
                    {{ key.name }}
                  </span>
                  <span class="text-xs text-muted-foreground">{{ key.role }}</span>
                  <span class="schema-tag schema-type-tag text-caption font-medium">
                    {{ key.type }}
                  </span>
                </span>
              </template>
              <template #default="{ control }">
                <Input
                  v-bind="control"
                  v-model="draft[key.field]"
                  :inputmode="key.type === 'N' ? 'decimal' : 'text'"
                  :placeholder="key.placeholder"
                  @blur="touchedKeys[key.field] = true"
                />
              </template>
            </FormItem>
          </div>
        </section>

        <section
          :aria-labelledby="`${formId}-attributes`"
          class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border"
        >
          <div
            class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-2 py-1"
          >
            <h3 :id="`${formId}-attributes`" class="text-sm font-medium">
              {{ $t('editor.dynamo.itemAttributes') }}
            </h3>
            <Button
              :id="addButtonId"
              type="button"
              variant="outline"
              size="sm"
              @click="addAttribute"
            >
              <span class="i-carbon-add mr-1 h-4 w-4" aria-hidden="true" />
              {{ $t('editor.dynamo.addAttribute') }}
            </Button>
          </div>

          <div
            ref="attributeList"
            class="attribute-list flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2"
          >
            <div v-if="indexKeyRows.length" class="index-key-grid">
              <div
                v-for="({ item, indexNames, error }, index) in indexKeyRows"
                :key="item.key"
                class="index-key-row relative rounded-md bg-muted/50 p-2"
              >
                <div class="min-w-0 space-y-1">
                  <div class="index-key-heading flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span class="min-w-0 break-all font-mono text-sm font-semibold text-foreground">
                      {{ item.key }}
                    </span>
                    <span class="schema-tag schema-type-tag text-caption font-medium">
                      {{ $t(`editor.dynamo.attributeTypes.${item.type}`) }} ({{ item.type }})
                    </span>
                  </div>
                  <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span class="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <span class="i-lucide-list-tree h-3 w-3 shrink-0" aria-hidden="true" />
                      {{ $t('editor.dynamo.indexKey') }}
                    </span>
                    <ul v-if="indexNames.length" class="flex min-w-0 flex-wrap gap-1" role="list">
                      <li
                        v-for="name in indexNames"
                        :key="name"
                        class="schema-tag schema-index-tag font-mono text-caption font-medium"
                      >
                        {{ name }}
                      </li>
                    </ul>
                  </div>
                </div>
                <FormItem
                  v-slot="{ control }"
                  class="index-key-value min-w-0"
                  :control-id="fieldId('keyAttributes', index, 'value')"
                  :label="$t('editor.dynamo.optionalAttributeValue')"
                  :error="error"
                >
                  <div class="relative">
                    <Input
                      v-bind="control"
                      :model-value="(item.value as string) ?? ''"
                      :class="{ 'pr-9': item.type === 'B' }"
                      :inputmode="item.type === 'N' ? 'decimal' : 'text'"
                      :placeholder="$t('editor.dynamo.inputAttrValue')"
                      :aria-label="
                        $t('editor.dynamo.namedOptionalAttributeValue', { name: item.key })
                      "
                      @update:model-value="
                        value => (item.value = value === '' ? null : String(value))
                      "
                    />
                    <Button
                      v-if="item.type === 'B'"
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      class="absolute right-1 top-1"
                      :aria-label="$t('editor.dynamo.loadNamedBinaryFile', { name: item.key })"
                      @click="loadBinaryValue(item)"
                    >
                      <span class="i-carbon-upload h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </FormItem>
                <Button
                  :id="fieldId('keyAttributes', index, 'remove')"
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  class="index-key-remove text-muted-foreground"
                  :aria-label="$t('editor.dynamo.removeNamedAttribute', { name: item.key })"
                  :title="$t('editor.dynamo.removeNamedAttribute', { name: item.key })"
                  @click="removeAttribute('keyAttributes', index)"
                >
                  <span class="i-carbon-trash-can h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            </div>

            <div v-for="(item, index) in draft.attributes" :key="index" class="attribute-row">
              <FormItem
                v-slot="{ control }"
                :control-id="fieldId('attributes', index, 'name')"
                :label="$t('editor.dynamo.attributeName')"
                required
                :error="attributeErrors[index]?.name"
              >
                <Input v-bind="control" v-model="item.key" />
              </FormItem>
              <FormItem
                v-slot="{ control }"
                :control-id="fieldId('attributes', index, 'type')"
                :label="$t('editor.dynamo.attributeType')"
                required
                :error="attributeErrors[index]?.type"
              >
                <Select
                  :model-value="item.type"
                  @update:model-value="type => changeType(item, String(type))"
                >
                  <SelectTrigger v-bind="control">
                    <SelectValue
                      :class="{ 'schema-type-text': item.type }"
                      :placeholder="$t('editor.dynamo.type')"
                    />
                  </SelectTrigger>
                  <SelectContent
                    class="max-h-[min(24rem,var(--radix-select-content-available-height))]"
                    :collision-padding="8"
                  >
                    <SelectItem v-for="type in attributeTypes" :key="type" :value="type">
                      {{ $t(`editor.dynamo.attributeTypes.${type}`) }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
              <FormItem
                v-slot="{ control }"
                class="attribute-value"
                :control-id="fieldId('attributes', index, 'value')"
                :label="$t('editor.dynamo.attributeValue')"
                :error="attributeErrors[index]?.value"
              >
                <Button
                  v-if="isStructuredType(item.type)"
                  v-bind="control"
                  type="button"
                  variant="outline"
                  class="w-full min-w-0 justify-start"
                  aria-haspopup="dialog"
                  :aria-label="
                    $t('editor.dynamo.editNamedAttribute', { name: attributeName(item, index) })
                  "
                  @click="openStructuredEditor(item, $event)"
                >
                  <span class="i-carbon-code mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span class="truncate">
                    {{ item.value ?? $t('editor.dynamo.editStructuredValue') }}
                  </span>
                </Button>
                <Switch
                  v-else-if="item.type === 'BOOL'"
                  v-bind="control"
                  :checked="item.value as boolean"
                  @update:checked="value => (item.value = value)"
                />
                <div v-else class="flex items-center gap-1">
                  <Input
                    v-bind="control"
                    :model-value="item.type === 'NULL' ? 'null' : ((item.value as string) ?? '')"
                    :disabled="!item.type || item.type === 'NULL'"
                    :inputmode="item.type === 'N' ? 'decimal' : 'text'"
                    :placeholder="
                      item.type
                        ? $t('editor.dynamo.inputAttrValue')
                        : $t('editor.dynamo.selectTypeFirst')
                    "
                    class="min-w-0"
                    @update:model-value="value => (item.value = String(value))"
                  />
                  <Button
                    v-if="item.type === 'B'"
                    type="button"
                    variant="outline"
                    size="icon"
                    class="shrink-0"
                    :title="$t('editor.dynamo.loadBinaryFile')"
                    :aria-label="
                      $t('editor.dynamo.loadNamedBinaryFile', { name: attributeName(item, index) })
                    "
                    @click="loadBinaryValue(item)"
                  >
                    <span class="i-carbon-upload h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </FormItem>
              <Button
                :id="fieldId('attributes', index, 'remove')"
                type="button"
                variant="ghost"
                size="icon-xs"
                class="attribute-remove text-muted-foreground"
                :aria-label="
                  $t('editor.dynamo.removeNamedAttribute', { name: attributeName(item, index) })
                "
                :title="
                  $t('editor.dynamo.removeNamedAttribute', { name: attributeName(item, index) })
                "
                @click="removeAttribute('attributes', index)"
              >
                <span class="i-carbon-trash-can h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </section>
      </form>
    </CardContent>

    <StructuredValueDialog
      :open="!!structuredRow"
      :attribute-type="structuredRow?.type ?? 'L'"
      :value="(structuredRow?.value as string | null) ?? null"
      :return-focus="structuredTrigger"
      @update:open="closeStructuredEditor"
      @apply="applyStructuredValue"
    />

    <CardFooter class="card-footer shrink-0">
      <p
        role="status"
        :aria-live="showCreateSuccess ? 'off' : 'polite'"
        aria-atomic="true"
        class="write-status min-w-0 break-words text-sm"
        :class="
          status?.tone === 'error'
            ? 'text-destructive-text'
            : status?.tone === 'warning'
              ? 'text-warning-text'
              : 'text-foreground'
        "
      >
        {{ status?.text }}
      </p>
      <div class="ml-auto flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          :disabled="!table || writeBlocked"
          @click="handleReset"
        >
          <span class="i-carbon-reset mr-1.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {{ $t('dialogOps.reset') }}
        </Button>
        <Button
          type="submit"
          variant="action"
          :form="formId"
          :disabled="!table"
          :aria-disabled="writeBlocked || undefined"
          :class="{ 'opacity-50': writeBlocked }"
        >
          <span
            v-if="!saving"
            class="i-carbon-checkmark mr-1.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          {{ saving ? $t('editor.dynamo.creatingItem') : $t('dialogOps.create') }}
        </Button>
      </div>
    </CardFooter>
    <FeedbackOverlay :message="createFeedbackMessage" :success="showCreateSuccess" />
  </Card>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import { storeToRefs } from 'pinia';
import {
  DatabaseType,
  findTable,
  useConnectionStore,
  useTabStore,
  type DynamoDBConnection,
} from '@/store';
import type { DynamoAttributeItem } from '@/datasources';
import { SUCCESS_MESSAGE_DELAY } from '@/common';
import { useLang } from '@/lang';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { FeedbackOverlay } from '@/components/ui/feedback-overlay';
import { FormItem } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import StructuredValueDialog from './structured-value-dialog.vue';
import { useDynamoItemForm } from '../composables';
import {
  isStructuredType,
  pickBinaryFileAsBase64,
  defaultAttributeValue,
  validateDynamoItemForm,
  buildDynamoItemAttributes,
  describeSchemaError,
  type AttributeValueIssue,
} from '../utils';

type AttributeGroup = 'attributes' | 'keyAttributes';
type KeyField = 'partitionKey' | 'sortKey';
type Status = { text: string; tone: 'success' | 'warning' | 'error' };

const attributeTypes = ['S', 'N', 'BOOL', 'B', 'NULL', 'L', 'M', 'SS', 'NS', 'BS'];
const lang = useLang();
const connectionStore = useConnectionStore();
const tabStore = useTabStore();
const { activeConnection } = storeToRefs(tabStore);
const connection = computed(() =>
  activeConnection.value?.type === DatabaseType.DYNAMODB
    ? (activeConnection.value as DynamoDBConnection)
    : undefined,
);

const {
  table,
  form: draft,
  schemaLoading,
  showSchemaSkeleton,
  schemaError,
  reset,
  retry,
} = useDynamoItemForm(
  () => connection.value,
  () => tabStore.activePanel?.activeTable,
  async (connection, name) => {
    await connectionStore.fetchIndices(connection, name);
    const stored = connectionStore.connections.find(
      con => con.id === connection.id,
    ) as DynamoDBConnection;
    return findTable(stored, name);
  },
);

const formId = useId();
const formElement = ref<HTMLFormElement>();
const attributeList = ref<HTMLElement>();
const addButtonId = `${formId}-add`;
const submitted = ref(false);
const touchedKeys = ref({ partitionKey: false, sortKey: false });
const saving = ref(false);
const showCreateSuccess = ref(false);
const status = ref<Status>();
const writeBlocked = computed(() => saving.value || showCreateSuccess.value);
const createFeedbackMessage = computed(() => {
  if (saving.value) return lang.t('editor.dynamo.creatingItem');
  return showCreateSuccess.value ? status.value?.text : undefined;
});
let successTimer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
const structuredRow = ref<DynamoAttributeItem>();
const structuredTrigger = ref<HTMLElement>();
const validation = computed(() => validateDynamoItemForm(draft.value, table.value));

const valueError = (issue: AttributeValueIssue | null | undefined, type: string) => {
  if (!issue) return undefined;
  if (issue.kind === 'required') return lang.t('editor.dynamo.attributeValueRequired');
  if (issue.kind === 'emptySet') return lang.t('editor.dynamo.emptySetNotAllowed');
  if (issue.kind === 'syntax')
    return lang.t('editor.dynamo.jsonInvalidSyntax', { reason: issue.reason });
  if (type === 'N') return lang.t('editor.dynamo.invalidNumber');
  if (type === 'B') return lang.t('editor.dynamo.invalidBase64');
  return lang.t('editor.dynamo.jsonInvalidShape', { type });
};

const primaryKeys = computed(() =>
  (['partitionKey', 'sortKey'] as const).flatMap((field: KeyField) => {
    const key = table.value?.[field];
    if (!key?.name) return [];
    const role = lang.t(`editor.dynamo.${field}`);
    return [
      {
        field,
        name: key.name,
        role,
        label: `${key.name} (${role}, ${key.valueType})`,
        type: key.valueType,
        placeholder: lang.t(
          field === 'partitionKey'
            ? 'editor.dynamo.enterPartitionKey'
            : 'editor.dynamo.enterSortKey',
        ),
        error:
          submitted.value || touchedKeys.value[field]
            ? valueError(validation.value[field], key.valueType)
            : undefined,
      },
    ];
  }),
);

const indexKeyRows = computed(() =>
  draft.value.keyAttributes.map((item, index) => ({
    item,
    indexNames: (table.value?.indices ?? [])
      .filter(secondaryIndex =>
        secondaryIndex.keySchema.some(key => key.attributeName === item.key),
      )
      .map(secondaryIndex => secondaryIndex.name),
    error: valueError(validation.value.keyAttributes[index]?.value, item.type),
  })),
);

const attributeErrors = computed(() =>
  submitted.value
    ? validation.value.attributes.map((error, index) => ({
        name: error.key
          ? lang.t(
              error.key === 'duplicate'
                ? 'editor.dynamo.duplicateAttribute'
                : 'editor.dynamo.attributeNameRequired',
            )
          : undefined,
        type: error.type ? lang.t('editor.dynamo.attributeTypeRequired') : undefined,
        value: valueError(error.value, draft.value.attributes[index].type),
      }))
    : [],
);

const fieldId = (group: AttributeGroup, index: number, field: string) =>
  `${formId}-${group}-${index}-${field}`;
const attributeName = (item: DynamoAttributeItem, index: number) =>
  item.key || lang.t('editor.dynamo.unnamedAttribute', { number: index + 1 });

const addAttribute = async () => {
  const index = draft.value.attributes.length;
  draft.value.attributes = [...draft.value.attributes, { key: '', value: null, type: '' }];
  await nextTick();
  document.getElementById(fieldId('attributes', index, 'name'))?.focus();
};

const removeAttribute = async (group: AttributeGroup, index: number) => {
  draft.value[group] = draft.value[group].filter((_, row) => row !== index);
  await nextTick();
  const nextIndex = Math.min(index, draft.value[group].length - 1);
  const focusId = nextIndex >= 0 ? fieldId(group, nextIndex, 'remove') : addButtonId;
  document.getElementById(focusId)?.focus();
};

const changeType = (item: DynamoAttributeItem, type: string) => {
  if (item.type === type) return;
  item.type = type;
  item.value = defaultAttributeValue(type);
};

const loadBinaryValue = async (item: DynamoAttributeItem) => {
  const currentDraft = draft.value;
  try {
    const value = await pickBinaryFileAsBase64();
    if (value !== null && item.type === 'B') item.value = value;
  } catch (error) {
    if (draft.value === currentDraft) {
      status.value = { tone: 'error', text: describeSchemaError(error) };
    }
  }
};

const openStructuredEditor = (item: DynamoAttributeItem, event: MouseEvent) => {
  structuredTrigger.value = event.currentTarget as HTMLElement;
  structuredRow.value = item;
};
const closeStructuredEditor = (open: boolean) => {
  if (!open) structuredRow.value = undefined;
};
const applyStructuredValue = (value: string) => {
  if (structuredRow.value) structuredRow.value.value = value;
};
const clearFeedback = () => {
  clearTimeout(successTimer);
  showCreateSuccess.value = false;
  submitted.value = false;
  touchedKeys.value = { partitionKey: false, sortKey: false };
  structuredRow.value = undefined;
  status.value = undefined;
  if (attributeList.value) attributeList.value.scrollTop = 0;
};
watch(table, clearFeedback, { flush: 'sync' });
onBeforeUnmount(() => {
  disposed = true;
  clearTimeout(successTimer);
});

const handleSubmit = async () => {
  const target = table.value;
  const active = connection.value;
  if (!target?.partitionKey || !active || writeBlocked.value) return;
  submitted.value = true;
  status.value = undefined;
  if (!validation.value.valid) {
    await nextTick();
    formElement.value?.querySelector<HTMLElement>('[aria-invalid="true"]:not(:disabled)')?.focus();
    return;
  }

  saving.value = true;
  try {
    const result = await connectionStore.createItem(
      active,
      target.name,
      buildDynamoItemAttributes(draft.value, target),
      { skipExisting: true, partitionKey: target.partitionKey.name },
    );
    if (!disposed && table.value === target) {
      status.value = result.skipped
        ? { tone: 'warning', text: lang.t('editor.dynamo.itemAlreadyExists') }
        : { tone: 'success', text: lang.t('editor.dynamo.createItemSuccess') };
      if (!result.skipped) {
        showCreateSuccess.value = true;
        successTimer = setTimeout(() => {
          showCreateSuccess.value = false;
        }, SUCCESS_MESSAGE_DELAY);
      }
    }
  } catch (error) {
    if (!disposed && table.value === target) {
      status.value = {
        tone: 'error',
        text: lang.t('editor.dynamo.createItemFailed', { reason: describeSchemaError(error) }),
      };
    }
  } finally {
    saving.value = false;
  }
};

const handleReset = () => {
  clearFeedback();
  reset();
};
</script>

<style scoped>
.create-item-container {
  position: relative;
  isolation: isolate;
  container-type: inline-size;
}

.attribute-list {
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scroll-padding-block: 0.5rem;
}

.attribute-list::-webkit-scrollbar {
  width: 8px;
}

.attribute-list::-webkit-scrollbar-thumb {
  background: hsl(var(--muted-foreground) / 0.65);
  border: 2px solid hsl(var(--card));
  border-radius: 0.25rem;
}

.primary-key-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr));
  gap: 0.5rem;
}

.schema-tag {
  max-width: 100%;
  border-radius: 0.25rem;
  padding-inline: 0.375rem;
  overflow-wrap: anywhere;
}

.schema-type-tag,
.schema-type-text {
  color: hsl(var(--schema-type-foreground));
}

.schema-type-tag {
  background: hsl(var(--schema-type));
  border: 1px solid hsl(var(--primary) / 0.45);
}

.schema-index-tag {
  background: hsl(var(--schema-index));
  color: hsl(var(--schema-index-foreground));
}

.index-key-grid {
  display: grid;
  flex-shrink: 0;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.5rem;
}

.index-key-row {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.375rem;
}

.index-key-heading {
  padding-inline-end: 1.5rem;
}

.index-key-value {
  margin-top: auto;
}

.index-key-remove {
  position: absolute;
  inset-block-start: 0.25rem;
  inset-inline-end: 0.25rem;
}

.attribute-row {
  display: grid;
  flex-shrink: 0;
  grid-template-columns: minmax(0, 2fr) minmax(10rem, 1fr) minmax(0, 2fr) 1.5rem;
  gap: 0.5rem;
  align-items: start;
}

.attribute-remove {
  margin-top: 1.375rem;
}

.card-footer {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.25rem 0.75rem;
  padding: 0.5rem 0.75rem;
  border-top: 1px solid hsl(var(--border));
}

.write-status {
  flex: 1 1 15rem;
  max-height: 4rem;
  overflow: auto;
}

.write-status:empty {
  flex: none;
}

.skeleton {
  border-radius: 0.25rem;
  background: hsl(var(--muted));
}

@container (min-width: 32rem) {
  .index-key-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container (min-width: 48rem) {
  .index-key-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@container (max-width: 38rem) {
  .attribute-row {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 1.5rem;
    gap: 0.25rem 0.5rem;
  }

  .attribute-value {
    grid-column: 1 / 3;
  }

  .attribute-remove {
    grid-column: 3;
    grid-row: 1;
  }
}

@container (max-width: 23rem) {
  .attribute-row {
    grid-template-columns: minmax(0, 1fr) 1.5rem;
  }

  .attribute-value {
    grid-column: 1;
  }

  .attribute-remove {
    grid-column: 2;
  }
}
</style>
