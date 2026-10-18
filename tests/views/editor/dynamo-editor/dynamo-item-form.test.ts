import { effectScope, ref } from 'vue';
import { useDynamoItemForm } from '../../../../src/views/editor/dynamo-editor/composables';
import {
  buildDynamoItemAttributes,
  createDynamoItemForm,
  validateDynamoItemForm,
  defaultAttributeValue,
} from '../../../../src/views/editor/dynamo-editor/utils';
import type { DynamoDBConnection, DynamoTableSummary } from '../../../../src/store';

jest.mock('@tauri-apps/plugin-dialog', () => ({ open: jest.fn() }));
jest.mock('@tauri-apps/plugin-fs', () => ({ readFile: jest.fn() }));

const table = (name: string, composite = false): DynamoTableSummary => ({
  name,
  partitionKey: { name: 'id', type: 'HASH', valueType: 'N' },
  ...(composite ? { sortKey: { name: 'sk', type: 'RANGE', valueType: 'S' } } : {}),
  attributeDefinitions: [
    { attributeName: 'id', attributeType: 'N' },
    { attributeName: 'gsi', attributeType: 'S' },
  ],
});
const deferred = <T>() => {
  let resolve!: (_value: T) => void;
  let reject!: (_reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('Create Item table selection', () => {
  it('loads a newly selected empty table after mounting without a table', async () => {
    const connection = ref({ id: 1 } as DynamoDBConnection);
    const name = ref<string>();
    const load = jest.fn().mockResolvedValue(table('new-empty'));
    const scope = effectScope();
    const state = scope.run(() =>
      useDynamoItemForm(
        () => connection.value,
        () => name.value,
        load,
      ),
    )!;
    expect(load).not.toHaveBeenCalled();
    expect(validateDynamoItemForm(state.form.value, state.table.value).valid).toBe(false);
    name.value = 'new-empty';
    expect(state.schemaLoading.value).toBe(true);
    await flush();
    expect(load).toHaveBeenCalledWith(connection.value, 'new-empty');
    expect(state.table.value?.partitionKey?.name).toBe('id');
    state.form.value.partitionKey = '42';
    expect(validateDynamoItemForm(state.form.value, state.table.value).valid).toBe(true);
    expect(buildDynamoItemAttributes(state.form.value, state.table.value!)).toEqual([
      { key: 'id', type: 'N', value: '42' },
    ]);
    scope.stop();
  });

  it('clears old keys/drafts immediately and ignores out-of-order schema responses', async () => {
    const first = deferred<DynamoTableSummary>();
    const second = deferred<DynamoTableSummary>();
    const name = ref('a');
    const scope = effectScope();
    const load = jest.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const state = scope.run(() =>
      useDynamoItemForm(
        () => ({ id: 1 }) as DynamoDBConnection,
        () => name.value,
        load,
      ),
    )!;
    state.form.value.partitionKey = 'old';
    name.value = 'b';
    expect(state.form.value.partitionKey).toBe('');
    expect(state.table.value).toBeUndefined();
    second.resolve(table('b', true));
    await flush();
    first.resolve(table('a'));
    await flush();
    expect(state.table.value?.name).toBe('b');
    expect(state.table.value?.sortKey?.name).toBe('sk');
    expect(state.schemaLoading.value).toBe(false);
    scope.stop();
  });

  it('reloads the same table name on a connection switch and resets index fields', async () => {
    const connection = ref({ id: 1 } as DynamoDBConnection);
    const load = jest.fn().mockResolvedValue(table('same'));
    const scope = effectScope();
    const state = scope.run(() =>
      useDynamoItemForm(
        () => connection.value,
        () => 'same',
        load,
      ),
    )!;
    await flush();
    state.form.value.keyAttributes = [];
    state.reset();
    expect(state.form.value.keyAttributes).toEqual([{ key: 'gsi', type: 'S', value: null }]);
    connection.value = { id: 2 } as DynamoDBConnection;
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
    scope.stop();
  });

  it('handles schema failures, retries, and rejects incomplete metadata', async () => {
    const load = jest
      .fn()
      .mockRejectedValueOnce(new Error('denied'))
      .mockResolvedValueOnce({ name: 'a' })
      .mockResolvedValueOnce(table('a'));
    const scope = effectScope();
    const state = scope.run(() =>
      useDynamoItemForm(
        () => ({ id: 1 }) as DynamoDBConnection,
        () => 'a',
        load,
      ),
    )!;
    await flush();
    expect(state.schemaError.value).toEqual(new Error('denied'));
    expect(state.schemaLoading.value).toBe(false);
    state.retry();
    await flush();
    expect(String(state.schemaError.value)).toContain('no primary key metadata');
    state.retry();
    await flush();
    expect(state.schemaError.value).toBeNull();
    expect(state.table.value?.name).toBe('a');
    scope.stop();
  });

  it('does not update an unmounted form', async () => {
    const request = deferred<DynamoTableSummary>();
    const scope = effectScope();
    const state = scope.run(() =>
      useDynamoItemForm(
        () => ({ id: 1 }) as DynamoDBConnection,
        () => 'a',
        () => request.promise,
      ),
    )!;
    scope.stop();
    request.resolve(table('a'));
    await flush();
    expect(state.table.value).toBeUndefined();
  });

  it('ignores a rejected schema request after the selected table changes', async () => {
    const request = deferred<DynamoTableSummary>();
    const selected = ref('old');
    const load = jest.fn().mockReturnValueOnce(request.promise).mockResolvedValueOnce(table('new'));
    const scope = effectScope();
    const state = scope.run(() =>
      useDynamoItemForm(
        () => ({ id: 1 }) as DynamoDBConnection,
        () => selected.value,
        load,
      ),
    )!;
    selected.value = 'new';
    await flush();
    request.reject(new Error('stale schema failure'));
    await flush();
    expect(state.table.value?.name).toBe('new');
    expect(state.schemaError.value).toBeNull();
    expect(state.schemaLoading.value).toBe(false);
    scope.stop();
  });
});

describe('Create Item validation and payload', () => {
  const validForm = () => ({ ...createDynamoItemForm(table('a')), partitionKey: '42' });
  it('reports missing attribute names and types without accepting an incomplete form', () => {
    const validation = validateDynamoItemForm(
      { ...validForm(), attributes: [{ key: '', type: '', value: null }] },
      table('a'),
    );
    expect(validation.valid).toBe(false);
    expect(validation.attributes).toEqual([
      { key: 'required', type: 'required', value: { kind: 'required' } },
    ]);
  });

  it.each([
    ['S', ''],
    ['B', ''],
    ['BOOL', false],
    ['NULL', null],
    ['N', '9007199254740993'],
    ['N', '9223372036854775808'],
    ['N', '+5'],
    ['N', '.5'],
    ['N', '5.'],
    ['N', '1e2'],
    ['SS', '["a", ""]'],
    ['NS', '[1,"2.5"]'],
    ['BS', '[""]'],
    ['L', '[]'],
    ['M', '{}'],
  ])('accepts and preserves %s value %p', (type, value) => {
    const form = {
      ...validForm(),
      attributes: [{ key: 'value', type: type as string, value: value as string | boolean | null }],
    };
    expect(validateDynamoItemForm(form, table('a')).valid).toBe(true);
    expect(buildDynamoItemAttributes(form, table('a'))[0]).toEqual(form.attributes[0]);
  });
  it.each([
    ['N', 'Infinity'],
    ['N', 'NaN'],
    ['N', '1e400'],
    ['N', '0x10'],
    ['B', 'aGVsbG8'],
    ['SS', '[]'],
    ['NS', '["Infinity"]'],
    ['L', '[1e400]'],
    ['M', '[]'],
  ])('rejects invalid %s value %s', (type, value) => {
    expect(
      validateDynamoItemForm(
        { ...validForm(), attributes: [{ key: 'x', type, value }] },
        table('a'),
      ).valid,
    ).toBe(false);
  });
  it('requires nonempty primary keys and validates optional index keys when provided', () => {
    const form = createDynamoItemForm(table('a', true));
    expect(validateDynamoItemForm(form, table('a', true)).valid).toBe(false);
    form.partitionKey = '0';
    form.sortKey = 's';
    expect(validateDynamoItemForm(form, table('a', true)).valid).toBe(true);
    form.keyAttributes[0].value = 'g';
    expect(buildDynamoItemAttributes(form, table('a', true))).toHaveLength(3);
  });
  it('rejects duplicate names and collisions with primary/index keys', () => {
    ['id', 'gsi', 'x'].forEach(key => {
      const attributes =
        key === 'x'
          ? [
              { key, type: 'S', value: 'a' },
              { key, type: 'S', value: 'b' },
            ]
          : [{ key, type: 'S', value: 'a' }];
      const result = validateDynamoItemForm({ ...validForm(), attributes }, table('a'));
      expect(result.valid).toBe(false);
      expect(result.attributes[0].key).toBe('duplicate');
    });
  });
  it('uses real false/null and clears old structured values on a type change', () => {
    expect(defaultAttributeValue('BOOL')).toBe(false);
    expect(defaultAttributeValue('NULL')).toBeNull();
    expect(defaultAttributeValue('M')).toBeNull();
  });
});
