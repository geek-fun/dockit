import { ref, watch } from 'vue';
import type { DynamoDBConnection, DynamoTableSummary } from '@/store';
import { createDynamoItemForm, hasTableKeyMetadata } from '../utils';

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
  const schemaError = ref<unknown>(null);
  const revision = ref(0);
  const retry = () => {
    revision.value += 1;
  };
  const reset = () => {
    form.value = createDynamoItemForm(table.value);
  };

  watch(
    [() => connection()?.id, tableName, revision],
    async (_, __, onCleanup) => {
      let current = true;
      onCleanup(() => {
        current = false;
      });
      table.value = undefined;
      form.value = createDynamoItemForm();
      schemaError.value = null;
      schemaLoading.value = false;
      const con = connection();
      const name = tableName();
      if (!con || !name) return;
      schemaLoading.value = true;
      try {
        const loaded = await loadTable(con, name);
        if (!current) return;
        if (!hasTableKeyMetadata(loaded))
          throw new Error(`Table ${name} has no primary key metadata`);
        table.value = loaded;
        reset();
      } catch (error) {
        if (current) schemaError.value = error;
      } finally {
        if (current) schemaLoading.value = false;
      }
    },
    { immediate: true, flush: 'sync' },
  );

  return { table, form, schemaLoading, schemaError, reset, retry };
};
