import { ref, watch } from 'vue';
import type { DynamoDBConnection, DynamoTableSummary } from '@/store';
import { createDynamoItemForm, hasTableKeyMetadata, type DynamoItemForm } from '../utils';

type Draft = { form: DynamoItemForm; table: DynamoTableSummary };
type TableKey = DynamoTableSummary['partitionKey'];

const sameKey = (previous: TableKey, current: TableKey): boolean =>
  previous?.name === current?.name && previous?.valueType === current?.valueType;

const restoreDraft = (table: DynamoTableSummary, draft?: Draft): DynamoItemForm => {
  const fresh = createDynamoItemForm(table);
  if (!draft) return fresh;
  const previousKeys = createDynamoItemForm(draft.table).keyAttributes;
  return {
    partitionKey: sameKey(draft.table.partitionKey, table.partitionKey)
      ? draft.form.partitionKey
      : '',
    sortKey: sameKey(draft.table.sortKey, table.sortKey) ? draft.form.sortKey : '',
    attributes: draft.form.attributes,
    keyAttributes: fresh.keyAttributes.flatMap(key => {
      const matches = (previous: { key: string; type: string }) =>
        previous.key === key.key && previous.type === key.type;
      if (!previousKeys.some(matches)) return [key];
      const saved = draft.form.keyAttributes.find(matches);
      return saved ? [saved] : [];
    }),
  };
};

export const useDynamoItemForm = (
  connection: () => DynamoDBConnection | undefined,
  tableName: () => string | undefined,
  loadTable: (
    connection: DynamoDBConnection,
    name: string,
  ) => Promise<DynamoTableSummary | undefined>,
) => {
  const table = ref<DynamoTableSummary>();
  const form = ref(createDynamoItemForm());
  const schemaLoading = ref(false);
  const showSchemaSkeleton = ref(false);
  const schemaError = ref<unknown>(null);
  const drafts = new Map<string, Draft>();
  const revision = ref(0);
  const retry = () => {
    revision.value += 1;
  };
  const reset = () => {
    form.value = createDynamoItemForm(table.value);
  };

  watch(
    [() => connection()?.id, tableName, revision],
    async ([id, name], [previousId, previousName], onCleanup) => {
      let current = true;
      let skeletonTimer: ReturnType<typeof setTimeout> | undefined;
      onCleanup(() => {
        current = false;
        clearTimeout(skeletonTimer);
      });
      if (table.value && previousId !== undefined && previousName) {
        drafts.set(JSON.stringify([previousId, previousName]), {
          table: table.value,
          form: form.value,
        });
      }
      table.value = undefined;
      form.value = createDynamoItemForm();
      schemaError.value = null;
      schemaLoading.value = false;
      showSchemaSkeleton.value = false;
      const con = connection();
      if (!con || !name) return;
      schemaLoading.value = true;
      skeletonTimer = setTimeout(() => {
        showSchemaSkeleton.value = true;
      }, 150);
      try {
        const loaded = await loadTable(con, name);
        if (!current) return;
        if (!hasTableKeyMetadata(loaded))
          throw new Error(`Table ${name} has no primary key metadata`);
        table.value = loaded;
        form.value = restoreDraft(loaded!, drafts.get(JSON.stringify([id, name])));
      } catch (error) {
        if (current) schemaError.value = error;
      } finally {
        clearTimeout(skeletonTimer);
        if (current) {
          showSchemaSkeleton.value = false;
          schemaLoading.value = false;
        }
      }
    },
    { immediate: true, flush: 'sync' },
  );

  return { table, form, schemaLoading, showSchemaSkeleton, schemaError, reset, retry };
};
