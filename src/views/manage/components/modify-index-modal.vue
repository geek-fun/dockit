<template>
  <Dialog :open="props.show" @update:open="val => emit('update:show', val)">
    <DialogContent class="max-w-[500px]">
      <DialogHeader>
        <DialogTitle>{{ lang.t('manage.dynamo.modifyGsiTitle') }}</DialogTitle>
      </DialogHeader>

      <Form>
        <FormItem :label="lang.t('manage.dynamo.indexName')">
          <span class="text-sm">{{ props.indexName }}</span>
        </FormItem>

        <Separator class="my-4" />

        <FormItem :label="lang.t('manage.dynamo.rcu')" required>
          <InputNumber v-model:model-value="formValue.readCapacityUnits" :min="1" class="w-full" />
          <p v-if="errors.readCapacityUnits" class="text-sm text-destructive mt-1">
            {{ errors.readCapacityUnits }}
          </p>
        </FormItem>

        <FormItem :label="lang.t('manage.dynamo.wcu')" required>
          <InputNumber v-model:model-value="formValue.writeCapacityUnits" :min="1" class="w-full" />
          <p v-if="errors.writeCapacityUnits" class="text-sm text-destructive mt-1">
            {{ errors.writeCapacityUnits }}
          </p>
        </FormItem>
      </Form>

      <Alert v-if="errorMessage" variant="destructive" class="mt-3">
        <AlertDescription class="flex items-center justify-between">
          <span>{{ errorMessage }}</span>
          <button class="ml-2 text-sm hover:opacity-70 cursor-pointer" @click="errorMessage = ''">
            <X class="w-4 h-4" />
          </button>
        </AlertDescription>
      </Alert>

      <DialogFooter class="mt-4">
        <Button variant="outline" :disabled="loading" @click="handleCancel">
          {{ lang.t('dialogOps.cancel') }}
        </Button>
        <Button :disabled="loading" @click="handleSubmit">
          <Spinner v-if="loading" class="mr-2 h-4 w-4" />
          {{ lang.t('dialogOps.confirm') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, reactive } from 'vue';
import { X } from 'lucide-vue-next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Form, FormItem } from '@/components/ui/form';
import { InputNumber } from '@/components/ui/input-number';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { MIN_LOADING_TIME } from '../../../common';
import { useLang } from '../../../lang';
import type { DynamoIndex } from '../../../datasources';
import { dynamoApi } from '../../../datasources';
import { useClusterManageStore, DynamoDBConnection, DatabaseType } from '../../../store';
import { storeToRefs } from 'pinia';

const lang = useLang();
const clusterManageStore = useClusterManageStore();
const { connection } = storeToRefs(clusterManageStore);

interface Props {
  show: boolean;
  indexName: string;
  tableName: string;
  index: DynamoIndex | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  (e: 'modified'): void;
}>();

const loading = ref(false);
const errorMessage = ref('');

const formValue = ref({
  readCapacityUnits: 5,
  writeCapacityUnits: 5,
});

const errors = reactive({
  readCapacityUnits: '',
  writeCapacityUnits: '',
});

const validate = (): boolean => {
  errors.readCapacityUnits = '';
  errors.writeCapacityUnits = '';

  let isValid = true;

  if (!formValue.value.readCapacityUnits || formValue.value.readCapacityUnits < 1) {
    errors.readCapacityUnits = lang.t('manage.dynamo.rcuRequired');
    isValid = false;
  }

  if (!formValue.value.writeCapacityUnits || formValue.value.writeCapacityUnits < 1) {
    errors.writeCapacityUnits = lang.t('manage.dynamo.wcuRequired');
    isValid = false;
  }

  return isValid;
};

// Reset form when modal opens
watch(
  () => props.show,
  newVal => {
    if (newVal && props.index) {
      formValue.value = {
        readCapacityUnits: props.index.provisionedThroughput?.readCapacityUnits || 5,
        writeCapacityUnits: props.index.provisionedThroughput?.writeCapacityUnits || 5,
      };
      errorMessage.value = '';
      errors.readCapacityUnits = '';
      errors.writeCapacityUnits = '';
      loading.value = false;
    }
  },
);

const handleCancel = () => {
  emit('update:show', false);
};

const handleSubmit = async () => {
  if (!validate()) {
    return;
  }

  if (!props.indexName || !connection.value || connection.value.type !== DatabaseType.DYNAMODB)
    return;

  const startTime = Date.now();

  try {
    loading.value = true;

    // Call backend API to update GSI throughput
    await dynamoApi.updateGlobalSecondaryIndex(connection.value as DynamoDBConnection, {
      indexName: props.indexName,
      readCapacityUnits: formValue.value.readCapacityUnits,
      writeCapacityUnits: formValue.value.writeCapacityUnits,
    });

    // Ensure minimum loading time
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    emit('update:show', false);
    emit('modified');
  } catch (error: unknown) {
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    const err = error as { details?: string; status?: number; message?: string };
    errorMessage.value = err?.details
      ? `status: ${err?.status ?? 'unknown'}, details: ${err.details}`
      : err?.message || String(error);
  } finally {
    loading.value = false;
  }
};
</script>
