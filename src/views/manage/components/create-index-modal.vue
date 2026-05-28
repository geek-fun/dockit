<template>
  <Dialog :open="props.show" @update:open="val => emit('update:show', val)">
    <DialogContent class="sm:max-w-[700px]">
      <DialogHeader>
        <DialogTitle>{{ lang.t('manage.dynamo.createGsiTitle') }}</DialogTitle>
      </DialogHeader>
      <ScrollArea class="max-h-[65vh] pr-4">
        <Form id="create-gsi-form" @submit.prevent="handleSubmit">
          <!-- Index Details Section -->
          <div class="section-divider">
            <Separator />
            <span class="section-title">{{ lang.t('manage.dynamo.indexDetails') }}</span>
          </div>

          <FormItem
            :label="lang.t('manage.dynamo.indexName')"
            required
            :error="getError('indexName', veeErrors.indexName || errors.indexName)"
          >
            <Input
              v-model="formValue.indexName"
              :placeholder="lang.t('manage.dynamo.indexNamePlaceholder')"
              autocapitalize="off"
              autocomplete="off"
              :spellcheck="false"
              autocorrect="off"
              @blur="handleBlur('indexName')"
            />
          </FormItem>

          <!-- Partition Key Attributes -->
          <FormItem
            :label="lang.t('manage.dynamo.partitionKey')"
            required
            :error="getError('partitionKey', errors.partitionKey)"
          >
            <div class="w-full flex flex-col gap-2 key-attribute-group partition-key">
              <div
                v-for="(attr, index) in formValue.partitionKeyAttributes"
                :key="index"
                class="flex gap-2 items-center"
              >
                <Input
                  v-model="attr.name"
                  :placeholder="lang.t('manage.dynamo.keyAttributeName')"
                  autocapitalize="off"
                  autocomplete="off"
                  :spellcheck="false"
                  autocorrect="off"
                  class="flex-1"
                />
                <Select v-model="attr.type">
                  <SelectTrigger class="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="opt in keyTypeOptions" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  :disabled="formValue.partitionKeyAttributes.length === 1"
                  @click="removePartitionKeyAttribute(index)"
                >
                  <span class="i-carbon-trash-can h-4 w-4 text-destructive" />
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                class="w-full border-dashed"
                @click="addPartitionKeyAttribute"
              >
                {{ lang.t('manage.dynamo.addAttribute') }}
              </Button>
            </div>
          </FormItem>

          <!-- Sort Key Attributes (Optional) -->
          <FormItem :label="lang.t('manage.dynamo.sortKey')">
            <div class="w-full flex flex-col gap-2 key-attribute-group sort-key">
              <div
                v-for="(attr, index) in formValue.sortKeyAttributes"
                :key="index"
                class="flex gap-2 items-center"
              >
                <Input
                  v-model="attr.name"
                  :placeholder="lang.t('manage.dynamo.keyAttributeNameOptional')"
                  autocapitalize="off"
                  autocomplete="off"
                  :spellcheck="false"
                  autocorrect="off"
                  class="flex-1"
                />
                <Select v-model="attr.type">
                  <SelectTrigger class="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="opt in keyTypeOptions" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" @click="removeSortKeyAttribute(index)">
                  <span class="i-carbon-trash-can h-4 w-4 text-destructive" />
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                class="w-full border-dashed"
                @click="addSortKeyAttribute"
              >
                {{ lang.t('manage.dynamo.addAttribute') }}
              </Button>
            </div>
          </FormItem>

          <!-- Attribute Projections -->
          <FormItem :label="lang.t('manage.dynamo.projection')">
            <Select v-model="formValue.projectionType">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in projectionOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </FormItem>

          <FormItem
            v-if="formValue.projectionType === 'INCLUDE'"
            :label="lang.t('manage.dynamo.projectedAttributes')"
          >
            <div class="w-full flex flex-col gap-2">
              <div class="flex flex-wrap gap-2">
                <Badge
                  v-for="(attr, index) in formValue.projectedAttributes"
                  :key="index"
                  variant="secondary"
                  class="flex items-center gap-1"
                >
                  {{ attr }}
                  <button
                    type="button"
                    class="ml-1 hover:text-destructive cursor-pointer"
                    aria-label="Remove attribute"
                    @click="removeProjectedAttribute(index)"
                  >
                    <X class="w-3 h-3" />
                  </button>
                </Badge>
              </div>
              <div class="flex gap-2">
                <Input
                  v-model="newProjectedAttribute"
                  placeholder="Add attribute"
                  autocapitalize="off"
                  autocomplete="off"
                  :spellcheck="false"
                  autocorrect="off"
                  class="flex-1"
                  @keyup.enter="addProjectedAttribute"
                />
                <Button type="button" variant="outline" @click="addProjectedAttribute">Add</Button>
              </div>
            </div>
          </FormItem>

          <!-- Index Capacity Section -->
          <div class="section-divider">
            <Separator />
            <span class="section-title">{{ lang.t('manage.dynamo.indexCapacity') }}</span>
          </div>

          <!-- Capacity Mode - inline key-value display -->
          <div class="rounded-lg border border-border/60 bg-card/50 px-4 py-3 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium">{{ lang.t('manage.dynamo.capacityMode') }}</span>
              <Badge
                :variant="baseTableCapacityMode === 'PAY_PER_REQUEST' ? 'secondary' : 'outline'"
                class="font-medium tracking-wide"
              >
                {{
                  baseTableCapacityMode === 'PAY_PER_REQUEST'
                    ? lang.t('manage.dynamo.onDemand')
                    : lang.t('manage.dynamo.provisioned')
                }}
              </Badge>
            </div>
            <p class="text-xs text-muted-foreground/70 leading-relaxed">
              {{ lang.t('manage.dynamo.capacityModeNotice') }}
            </p>
          </div>

          <FormItem
            v-if="baseTableCapacityMode === 'PROVISIONED'"
            :label="lang.t('manage.dynamo.maxTableThroughput')"
          >
            <RadioGroup v-model="formValue.throughputMode" class="grid grid-cols-2 gap-3">
              <div
                class="relative flex items-start gap-3 rounded-lg border-2 p-3 cursor-pointer transition-all"
                :class="
                  formValue.throughputMode === 'copy'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/40'
                "
                @click="formValue.throughputMode = 'copy'"
              >
                <RadioGroupItem id="copy" value="copy" class="mt-0.5" />
                <label for="copy" class="text-sm cursor-pointer leading-snug">
                  {{ lang.t('manage.dynamo.copyFromBaseTable') }}
                </label>
              </div>
              <div
                class="relative flex items-start gap-3 rounded-lg border-2 p-3 cursor-pointer transition-all"
                :class="
                  formValue.throughputMode === 'customize'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/40'
                "
                @click="formValue.throughputMode = 'customize'"
              >
                <RadioGroupItem id="customize" value="customize" class="mt-0.5" />
                <label for="customize" class="text-sm cursor-pointer leading-snug">
                  {{ lang.t('manage.dynamo.customizeSettings') }}
                </label>
              </div>
            </RadioGroup>
          </FormItem>

          <div
            v-if="
              baseTableCapacityMode === 'PROVISIONED' && formValue.throughputMode === 'customize'
            "
            class="grid grid-cols-2 gap-4 pl-1"
          >
            <FormItem :label="lang.t('manage.dynamo.rcu')">
              <InputNumber v-model="formValue.readCapacityUnits" :min="1" class="w-full" />
            </FormItem>
            <FormItem :label="lang.t('manage.dynamo.wcu')">
              <InputNumber v-model="formValue.writeCapacityUnits" :min="1" class="w-full" />
            </FormItem>
          </div>

          <!-- Warm Throughput Section -->
          <div class="section-divider">
            <Separator />
            <span class="section-title">{{ lang.t('manage.dynamo.warmThroughput') }}</span>
          </div>

          <FormItem :label="lang.t('manage.dynamo.warmThroughputMode')">
            <RadioGroup v-model="formValue.warmThroughputMode" class="grid grid-cols-2 gap-3">
              <div
                class="relative flex items-start gap-3 rounded-lg border-2 p-3 cursor-pointer transition-all"
                :class="
                  formValue.warmThroughputMode === 'default'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/40'
                "
                @click="formValue.warmThroughputMode = 'default'"
              >
                <RadioGroupItem id="default" value="default" class="mt-0.5" />
                <label for="default" class="text-sm cursor-pointer leading-snug">
                  {{ warmThroughputDefaultLabel }}
                </label>
              </div>
              <div
                class="relative rounded-lg border-2 p-3 transition-all cursor-pointer"
                :class="
                  formValue.warmThroughputMode === 'increase'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/40'
                "
                @click="formValue.warmThroughputMode = 'increase'"
              >
                <div class="flex items-start gap-3">
                  <RadioGroupItem id="increase" value="increase" class="mt-0.5" />
                  <label for="increase" class="text-sm cursor-pointer leading-snug">
                    {{ lang.t('manage.dynamo.increaseWarmThroughput') }}
                  </label>
                </div>
                <div
                  v-if="formValue.warmThroughputMode === 'increase'"
                  class="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-primary/20"
                >
                  <div>
                    <label class="text-xs text-muted-foreground mb-1 block">
                      {{ lang.t('manage.dynamo.warmReadUnits') }}
                    </label>
                    <InputNumber
                      v-model="formValue.warmReadUnits"
                      :min="1"
                      :placeholder="String(warmThroughputDefaults.read)"
                      class="w-full"
                      @click.stop
                    />
                    <p v-if="errors.warmReadUnits" class="text-xs text-destructive mt-1">
                      {{ errors.warmReadUnits }}
                    </p>
                  </div>
                  <div>
                    <label class="text-xs text-muted-foreground mb-1 block">
                      {{ lang.t('manage.dynamo.warmWriteUnits') }}
                    </label>
                    <InputNumber
                      v-model="formValue.warmWriteUnits"
                      :min="1"
                      :placeholder="String(warmThroughputDefaults.write)"
                      class="w-full"
                      @click.stop
                    />
                    <p v-if="errors.warmWriteUnits" class="text-xs text-destructive mt-1">
                      {{ errors.warmWriteUnits }}
                    </p>
                  </div>
                </div>
              </div>
            </RadioGroup>
          </FormItem>
        </Form>
        <!-- Hidden submit button to enable keyboard Enter submission -->
        <button type="submit" form="create-gsi-form" hidden />
      </ScrollArea>

      <Alert v-if="errorMessage" variant="destructive" class="mt-3">
        <AlertDescription class="flex items-center justify-between">
          {{ errorMessage }}
          <button
            type="button"
            class="ml-2 hover:opacity-70 cursor-pointer"
            aria-label="Dismiss error"
            @click="errorMessage = ''"
          >
            <X class="w-4 h-4" />
          </button>
        </AlertDescription>
      </Alert>

      <DialogFooter>
        <Button variant="outline" :disabled="loading" @click="handleCancel">
          {{ lang.t('dialogOps.cancel') }}
        </Button>
        <Button type="button" :disabled="loading" @click="handleSubmit">
          <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
          {{ lang.t('dialogOps.create') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue';
import { X, Loader2 } from 'lucide-vue-next';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { MIN_LOADING_TIME } from '../../../common';
import { useLang } from '../../../lang';
import { useClusterManageStore, DatabaseType } from '../../../store';
import { storeToRefs } from 'pinia';
import { useFormValidation } from '@/composables';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputNumber } from '@/components/ui/input-number';
import { Form, FormItem } from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const lang = useLang();
const clusterManageStore = useClusterManageStore();
const { connection } = storeToRefs(clusterManageStore);

interface Props {
  show: boolean;
  tableName: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  (e: 'created'): void;
}>();

type KeyAttribute = {
  name: string;
  type: string;
};

const loading = ref(false);
const errorMessage = ref('');
const baseTableInfo = ref<any>(null);
const newProjectedAttribute = ref('');
const { handleBlur, getError, markSubmitted, resetValidation } = useFormValidation();

const errors = ref<{
  indexName?: string;
  partitionKey?: string;
  warmReadUnits?: string;
  warmWriteUnits?: string;
}>({});

const formValue = ref({
  indexName: '',
  partitionKeyAttributes: [{ name: '', type: 'S' }] as KeyAttribute[],
  sortKeyAttributes: [{ name: '', type: 'S' }] as KeyAttribute[],
  projectionType: 'ALL',
  projectedAttributes: [] as string[],
  throughputMode: 'copy' as 'copy' | 'customize',
  readCapacityUnits: 5,
  writeCapacityUnits: 5,
  warmThroughputMode: 'default' as 'default' | 'increase',
  warmReadUnits: 0,
  warmWriteUnits: 0,
});

// Zod validation schema for basic fields
const formSchema = toTypedSchema(
  z.object({
    indexName: z.string().min(1, lang.t('manage.dynamo.indexNameRequired')),
  }),
);

const {
  errors: veeErrors,
  validate,
  resetForm: veeResetForm,
  setValues,
} = useForm({
  validationSchema: formSchema,
  initialValues: { indexName: '' },
});

// Watch indexName changes and sync with vee-validate
watch(
  () => formValue.value.indexName,
  newVal => {
    setValues({ indexName: newVal });
  },
);

const baseTableCapacityMode = computed(() => {
  return baseTableInfo.value?.billingMode || 'PAY_PER_REQUEST';
});

const warmThroughputDefaults = computed(() => {
  const warmRead = baseTableInfo.value?.warmThroughput?.readUnitsPerSecond || 0;
  const warmWrite = baseTableInfo.value?.warmThroughput?.writeUnitsPerSecond || 0;
  return { read: warmRead, write: warmWrite };
});

const warmThroughputDefaultLabel = computed(() => {
  const { read, write } = warmThroughputDefaults.value;
  if (read > 0 || write > 0) {
    return `${lang.t('manage.dynamo.keepDefaultValues')} (${read} RCU/S, ${write} WCU/S)`;
  }
  return lang.t('manage.dynamo.keepDefaultValues');
});

const keyTypeOptions = [
  { label: 'String (S)', value: 'S' },
  { label: 'Number (N)', value: 'N' },
  { label: 'Binary (B)', value: 'B' },
];

const projectionOptions = [
  { label: 'ALL', value: 'ALL' },
  { label: 'KEYS_ONLY', value: 'KEYS_ONLY' },
  { label: 'INCLUDE', value: 'INCLUDE' },
];

const validateForm = async (): Promise<boolean> => {
  errors.value = {};

  // Validate with vee-validate
  const { valid } = await validate();

  // Copy vee-validate errors to our errors object
  if (veeErrors.value.indexName) {
    errors.value.indexName = veeErrors.value.indexName;
  }

  const hasValidPartitionKey = formValue.value.partitionKeyAttributes.some(
    attr => attr.name && attr.name.trim() !== '',
  );

  if (!hasValidPartitionKey) {
    errors.value.partitionKey = lang.t('manage.dynamo.partitionKeyRequired');
  }

  // Validate warm throughput
  validateWarmThroughput();

  return valid && Object.keys(errors.value).length === 0;
};

// Validate warm throughput
const validateWarmThroughput = (): void => {
  if (formValue.value.warmThroughputMode !== 'increase') {
    delete errors.value.warmReadUnits;
    delete errors.value.warmWriteUnits;
    return;
  }

  if (formValue.value.warmReadUnits < 1) {
    errors.value.warmReadUnits = lang.t('manage.dynamo.warmReadUnitsMin');
  }
  if (formValue.value.warmWriteUnits < 1) {
    errors.value.warmWriteUnits = lang.t('manage.dynamo.warmWriteUnitsMin');
  }
};

const addPartitionKeyAttribute = () => {
  formValue.value.partitionKeyAttributes.push({ name: '', type: 'S' });
};

const removePartitionKeyAttribute = (index: number) => {
  formValue.value.partitionKeyAttributes.splice(index, 1);
};

const addSortKeyAttribute = () => {
  formValue.value.sortKeyAttributes.push({ name: '', type: 'S' });
};

const removeSortKeyAttribute = (index: number) => {
  formValue.value.sortKeyAttributes.splice(index, 1);
};

const addProjectedAttribute = () => {
  if (newProjectedAttribute.value.trim()) {
    formValue.value.projectedAttributes.push(newProjectedAttribute.value.trim());
    newProjectedAttribute.value = '';
  }
};

const removeProjectedAttribute = (index: number) => {
  formValue.value.projectedAttributes.splice(index, 1);
};

// Fetch base table info when modal opens
const fetchBaseTableInfo = async () => {
  if (!connection.value || connection.value.type !== DatabaseType.DYNAMODB) return;

  try {
    baseTableInfo.value = await clusterManageStore.describeTable(props.tableName);

    // Set default throughput values from base table if PROVISIONED
    if (baseTableInfo.value?.billingMode === 'PROVISIONED') {
      const baseReadCapacity = baseTableInfo.value?.provisionedThroughput?.readCapacityUnits || 5;
      const baseWriteCapacity = baseTableInfo.value?.provisionedThroughput?.writeCapacityUnits || 5;
      formValue.value.readCapacityUnits = baseReadCapacity;
      formValue.value.writeCapacityUnits = baseWriteCapacity;
    }

    // Set default warm throughput values from base table
    const warmRead = baseTableInfo.value?.warmThroughput?.readUnitsPerSecond || 0;
    const warmWrite = baseTableInfo.value?.warmThroughput?.writeUnitsPerSecond || 0;
    formValue.value.warmReadUnits = warmRead;
    formValue.value.warmWriteUnits = warmWrite;
  } catch {
    // Failed to fetch base table info - continue with default values
  }
};

// Reset form when modal opens
watch(
  () => props.show,
  newVal => {
    if (newVal) {
      formValue.value = {
        indexName: '',
        partitionKeyAttributes: [{ name: '', type: 'S' }],
        sortKeyAttributes: [{ name: '', type: 'S' }],
        projectionType: 'ALL',
        projectedAttributes: [],
        throughputMode: 'copy',
        readCapacityUnits: 5,
        writeCapacityUnits: 5,
        warmThroughputMode: 'default',
        warmReadUnits: 0,
        warmWriteUnits: 0,
      };
      veeResetForm({ values: { indexName: '' } });
      errors.value = {};
      errorMessage.value = '';
      loading.value = false;
      newProjectedAttribute.value = '';
      resetValidation();
      fetchBaseTableInfo();
    }
  },
);

onMounted(() => {
  if (props.show) {
    fetchBaseTableInfo();
  }
});

const handleCancel = () => {
  emit('update:show', false);
};

const handleSubmit = async () => {
  markSubmitted();
  const isValid = await validateForm();
  if (!isValid) {
    return;
  }

  if (!connection.value || connection.value.type !== DatabaseType.DYNAMODB) return;

  const startTime = Date.now();

  try {
    loading.value = true;

    // Prepare key schema - combine partition and sort keys
    const keySchema: Array<{
      attributeName: string;
      keyType: 'HASH' | 'RANGE';
      attributeType: string;
    }> = [];

    // Add partition key(s)
    formValue.value.partitionKeyAttributes.forEach(attr => {
      if (attr.name && attr.name.trim()) {
        keySchema.push({
          attributeName: attr.name.trim(),
          keyType: 'HASH',
          attributeType: attr.type,
        });
      }
    });

    // Add sort key(s) if provided
    formValue.value.sortKeyAttributes.forEach(attr => {
      if (attr.name && attr.name.trim()) {
        keySchema.push({
          attributeName: attr.name.trim(),
          keyType: 'RANGE',
          attributeType: attr.type,
        });
      }
    });

    // Determine throughput settings
    let readCapacity = undefined;
    let writeCapacity = undefined;

    if (baseTableCapacityMode.value === 'PROVISIONED') {
      if (formValue.value.throughputMode === 'copy') {
        readCapacity = baseTableInfo.value?.provisionedThroughput?.readCapacityUnits || 5;
        writeCapacity = baseTableInfo.value?.provisionedThroughput?.writeCapacityUnits || 5;
      } else {
        readCapacity = formValue.value.readCapacityUnits;
        writeCapacity = formValue.value.writeCapacityUnits;
      }
    }

    // Prepare warm throughput settings
    const warmThroughput =
      formValue.value.warmThroughputMode === 'increase'
        ? {
            readUnits: formValue.value.warmReadUnits,
            writeUnits: formValue.value.warmWriteUnits,
          }
        : undefined;

    // Call backend API to create GSI with enhanced configuration
    await clusterManageStore.createGlobalSecondaryIndex(props.tableName, {
      indexName: formValue.value.indexName,
      keySchema,
      projectionType: formValue.value.projectionType,
      projectedAttributes:
        formValue.value.projectionType === 'INCLUDE'
          ? formValue.value.projectedAttributes
          : undefined,
      readCapacityUnits: readCapacity,
      writeCapacityUnits: writeCapacity,
      warmThroughput,
    });

    // Ensure minimum loading time
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    emit('update:show', false);
    emit('created');
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

<style scoped>
.section-divider {
  position: relative;
  margin: 24px 0 16px 0;
}

.section-title {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  background: hsl(var(--background));
  padding-right: 12px;
  font-size: 14px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
}

/* Visual differentiation for key attribute groups */
.key-attribute-group {
  padding: 12px;
  border-radius: 8px;
  background: hsl(var(--card) / 0.5);
  border: 1px solid hsl(var(--border));
}

.key-attribute-group.partition-key {
  border-color: hsl(var(--primary) / 0.3);
  background: hsl(var(--primary) / 0.05);
}

.key-attribute-group.sort-key {
  border-color: hsl(var(--muted-foreground) / 0.2);
  background: hsl(var(--muted) / 0.3);
}
</style>
