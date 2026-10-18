import type { DynamoAttributeItem } from '@/datasources';
import type { DynamoTableSummary } from '@/store';
import { validateAttributeValue } from './dynamo-attribute';

export type DynamoItemForm = {
  partitionKey: string;
  sortKey: string;
  attributes: DynamoAttributeItem[];
  keyAttributes: DynamoAttributeItem[];
};

export const hasTableKeyMetadata = (table?: DynamoTableSummary): boolean =>
  !!table?.partitionKey?.name &&
  ['S', 'N', 'B'].includes(table.partitionKey.valueType) &&
  (!table.sortKey?.name || ['S', 'N', 'B'].includes(table.sortKey.valueType));

export const createDynamoItemForm = (table?: DynamoTableSummary): DynamoItemForm => ({
  partitionKey: '',
  sortKey: '',
  attributes: [],
  keyAttributes: (table?.attributeDefinitions ?? [])
    .filter(attr => ![table?.partitionKey?.name, table?.sortKey?.name].includes(attr.attributeName))
    .map(attr => ({ key: attr.attributeName, type: attr.attributeType, value: null })),
});

export const validateDynamoItemForm = (form: DynamoItemForm, table?: DynamoTableSummary) => {
  const keyNames = [table?.partitionKey?.name, table?.sortKey?.name].filter(Boolean);
  const names = [
    ...keyNames,
    ...form.keyAttributes.map(attr => attr.key),
    ...form.attributes.map(attr => attr.key),
  ];
  const attributeErrors = (attributes: DynamoAttributeItem[], optional: boolean) =>
    attributes.map(attr => ({
      key: !attr.key
        ? 'required'
        : names.filter(name => name === attr.key).length > 1
          ? 'duplicate'
          : undefined,
      type: !attr.type ? 'required' : undefined,
      value:
        optional && attr.value === null
          ? null
          : validateAttributeValue(attr.type, attr.value, optional),
    }));
  const errors = {
    partitionKey: validateAttributeValue(
      table?.partitionKey?.valueType ?? '',
      form.partitionKey,
      true,
    ),
    sortKey: table?.sortKey?.name
      ? validateAttributeValue(table.sortKey.valueType, form.sortKey, true)
      : null,
    attributes: attributeErrors(form.attributes, false),
    keyAttributes: attributeErrors(form.keyAttributes, true),
  };
  return {
    ...errors,
    valid:
      hasTableKeyMetadata(table) &&
      !errors.partitionKey &&
      !errors.sortKey &&
      [...errors.attributes, ...errors.keyAttributes].every(
        attr => !attr.key && !attr.type && !attr.value,
      ),
  };
};

export const buildDynamoItemAttributes = (
  form: DynamoItemForm,
  table: DynamoTableSummary,
): DynamoAttributeItem[] => [
  ...form.attributes,
  ...form.keyAttributes.filter(attr => attr.value !== null),
  { key: table.partitionKey!.name, type: table.partitionKey!.valueType, value: form.partitionKey },
  ...(table.sortKey?.name
    ? [{ key: table.sortKey.name, type: table.sortKey.valueType, value: form.sortKey }]
    : []),
];
