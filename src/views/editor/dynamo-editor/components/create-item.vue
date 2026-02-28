<template>
  <Card class="create-item-container flex flex-col overflow-hidden">
    <CardHeader class="flex flex-row items-center justify-between pb-2">
      <CardTitle>{{ $t('editor.dynamo.addAttributesTitle') }}</CardTitle>
    </CardHeader>
    <CardContent class="form-container">
      <Form class="flex flex-col h-full gap-3" @submit.prevent>
        <!-- Top box: Partition Key + Sort Key (fixed) -->
        <div class="border border-border rounded-lg p-3 shrink-0">
          <div class="text-sm font-medium text-muted-foreground mb-2">Primary Key</div>
          <Grid :cols="24" :x-gap="12">
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
                <FormItem>
                  <InputNumber
                    v-if="calcType(item.type) === 'number'"
                    v-model:model-value="item.value as number"
                    :placeholder="$t('editor.dynamo.inputAttrValue')"
                    class="w-full"
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
                  <Select v-model="item.type">
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
                  <Input
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
    </CardContent>
    <CardFooter class="card-footer shrink-0">
      <Button variant="outline" @click="handleReset">
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
import { Connection, DynamoDBConnection, useConnectionStore, useTabStore } from '../../../../store';
import { CustomError } from '../../../../common';
import { useLang } from '../../../../lang';

import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Form, FormItem } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { InputNumber } from '@/components/ui/input-number';
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
const { getDynamoIndexOrTableOption } = storeToRefs(connectionStore);

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

const dynamoRecordForm = ref<{
  partitionKey: string;
  sortKey: string;
  attributes: Array<{ key: string; value: string | number | boolean | null; type: string }>;
  keyAttributes: Array<{ key: string; value: string | number | boolean | null; type: string }>;
}>({ partitionKey: '', sortKey: '', attributes: [], keyAttributes: [] });

const errors = ref<{
  partitionKey?: string;
  sortKey?: string;
  attributes: Array<{ key?: string; type?: string; value?: string }>;
}>({ attributes: [] });

const addAttributeItem = () => {
  dynamoRecordForm.value.attributes.push({ key: '', value: null, type: '' });
  errors.value.attributes.push({});
};

const removeAttributeItem = (index: number) => {
  dynamoRecordForm.value.attributes.splice(index, 1);
  errors.value.attributes.splice(index, 1);
};

const removeKeyAttributeItem = (index: number) => {
  dynamoRecordForm.value.keyAttributes.splice(index, 1);
};

const getAttributeError = (index: number, field: 'key' | 'type' | 'value') => {
  return errors.value.attributes[index]?.[field];
};

const selectedTable = computed(() => {
  const indexOrTableOptions = getDynamoIndexOrTableOption.value(
    activeConnection.value as DynamoDBConnection,
  );
  if (indexOrTableOptions?.length < 1) {
    return {
      partitionKeyName: undefined,
      sortKeyName: undefined,
      partitionKeyLabel: undefined,
      sortKeyLabel: undefined,
    };
  }

  const { partitionKeyName, sortKeyName } = indexOrTableOptions[0];

  return {
    partitionKeyName,
    sortKeyName,
    partitionKeyLabel: partitionKeyName ? `${partitionKeyName}  (Partition Key):` : undefined,
    sortKeyLabel: sortKeyName ? `${sortKeyName} (Sort Key):` : undefined,
  };
});

const calcType = (type: string) => {
  switch (type) {
    case 'S':
      return 'text';
    case 'N':
      return 'number';
    case 'BOOL':
      return 'checkbox';
    case 'B':
      return 'text';
    case 'NULL':
      return 'text';
    case 'L':
      return 'text';
    case 'M':
      return 'text';
    case 'SS':
      return 'text';
    case 'NS':
      return 'number';
    case 'BS':
      return 'text';
    default:
      return 'text';
  }
};

const validateForm = () => {
  let isValid = true;
  errors.value = { attributes: [] };

  // Validate partition key
  if (selectedTable.value.partitionKeyLabel && !dynamoRecordForm.value.partitionKey) {
    errors.value.partitionKey = lang.t('editor.dynamo.attributeValueRequired');
    isValid = false;
  }

  // Validate sort key
  if (selectedTable.value.sortKeyLabel && !dynamoRecordForm.value.sortKey) {
    errors.value.sortKey = lang.t('editor.dynamo.attributeValueRequired');
    isValid = false;
  }

  // Validate attributes
  dynamoRecordForm.value.attributes.forEach((attr, index) => {
    const attrErrors: { key?: string; type?: string; value?: string } = {};
    if (!attr.key) {
      attrErrors.key = lang.t('editor.dynamo.attributeNameRequired');
      isValid = false;
    }
    if (!attr.type) {
      attrErrors.type = lang.t('editor.dynamo.attributeTypeRequired');
      isValid = false;
    }
    if (attr.value === null || attr.value === '') {
      attrErrors.value = lang.t('editor.dynamo.attributeValueRequired');
      isValid = false;
    }
    errors.value.attributes[index] = attrErrors;
  });

  return isValid;
};

const validationPassed = computed(() => {
  // Simple validation check without setting error messages
  if (selectedTable.value.partitionKeyLabel && !dynamoRecordForm.value.partitionKey) {
    return false;
  }
  if (selectedTable.value.sortKeyLabel && !dynamoRecordForm.value.sortKey) {
    return false;
  }
  for (const attr of dynamoRecordForm.value.attributes) {
    if (!attr.key || !attr.type || attr.value === null || attr.value === '') {
      return false;
    }
  }
  return true;
});

const handleSubmit = async (event: MouseEvent) => {
  event.preventDefault();
  if (!activeConnection.value) {
    message.error(`status: 500, ${lang.t('connection.selectIndex')}`);
    return;
  }
  if (!validateForm()) {
    message.error(lang.t('connection.validationFailed'));
    return;
  }

  try {
    loadingRef.value.createItem = true;
    const { partitionKey, sortKey } = activeConnection.value as DynamoDBConnection;
    const pkRecord = {
      key: partitionKey.name,
      value: dynamoRecordForm.value.partitionKey,
      type: partitionKey.valueType,
    };
    const skRecord = {
      key: sortKey?.name,
      value: dynamoRecordForm.value.sortKey,
      type: sortKey?.valueType,
    };

    const attributes = [
      ...dynamoRecordForm.value.attributes,
      ...dynamoRecordForm.value.keyAttributes,
      pkRecord,
      ...(skRecord.key ? [skRecord] : []),
    ].filter(({ value }) => value !== null) as Array<{
      key: string;
      value: string | number | boolean | null;
      type: string;
    }>;

    await createItem(activeConnection.value as DynamoDBConnection, attributes);
    message.success(lang.t('editor.dynamo.createItemSuccess'));
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
  dynamoRecordForm.value = { partitionKey: '', sortKey: '', attributes: [], keyAttributes: [] };
  errors.value = { attributes: [] };
};

fetchIndices(activeConnection.value as Connection).then(() => {
  const { partitionKey, sortKey, attributeDefinitions } =
    activeConnection.value as DynamoDBConnection;

  dynamoRecordForm.value.keyAttributes = attributeDefinitions
    .map(({ attributeName, attributeType }) => ({
      key: attributeName,
      value: null,
      type: attributeType,
    }))
    .filter(({ key }) => ![partitionKey.name, sortKey?.name].filter(Boolean).includes(key));
});
</script>

<style scoped>
.create-item-container {
  width: 100%;
  height: 100%;
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
</style>
