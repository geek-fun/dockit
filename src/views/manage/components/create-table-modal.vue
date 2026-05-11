<template>
  <Dialog :open="props.show" @update:open="val => emit('update:show', val)">
    <DialogContent class="max-w-[700px]">
      <DialogHeader>
        <DialogTitle>{{ lang.t('manage.dynamo.createTableTitle') }}</DialogTitle>
      </DialogHeader>

      <div v-if="resultType === 'success' && resultMessage" class="text-center py-4">
        <div class="text-green-500 text-4xl mb-2">✓</div>
        <p class="text-sm font-medium">{{ lang.t('manage.dynamo.createTableSuccess') }}</p>
      </div>

      <Alert v-else-if="resultMessage && resultType === 'error'" variant="destructive" class="mb-3">
        <AlertDescription class="flex items-center justify-between">
          <span>{{ resultMessage }}</span>
          <button class="ml-2 text-sm hover:opacity-70 cursor-pointer" @click="resultMessage = ''">
            <X class="w-4 h-4" />
          </button>
        </AlertDescription>
      </Alert>

      <div v-else class="wizard-container">
        <div class="step-indicators flex justify-between mb-6">
          <div
            v-for="(step, index) in steps"
            :key="index"
            :class="[
              'step-indicator flex items-center gap-2',
              { active: currentStep === index, completed: index < currentStep },
            ]"
          >
            <div
              :class="[
                'step-circle w-6 h-6 rounded-full flex items-center justify-center text-xs',
                currentStep === index
                  ? 'bg-blue-500 text-white'
                  : index < currentStep
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-500',
              ]"
            >
              {{ index < currentStep ? '✓' : index + 1 }}
            </div>
            <span
              :class="[
                'step-label text-sm',
                currentStep === index ? 'font-medium' : 'text-gray-500',
              ]"
            >
              {{ step.label }}
            </span>
          </div>
        </div>

        <ScrollArea class="max-h-[45vh] pr-4">
          <Form class="space-y-4">
            <template v-if="currentStep === 0">
              <FormItem
                :label="lang.t('manage.dynamo.tableName')"
                required
                :error="errors.tableName"
              >
                <Input
                  v-model="formValue.tableName"
                  :placeholder="lang.t('manage.dynamo.tableNamePlaceholder')"
                  autocapitalize="off"
                  autocomplete="off"
                  :spellcheck="false"
                  autocorrect="off"
                  @blur="validateTableName"
                />
              </FormItem>

              <Separator />

              <FormItem
                :label="lang.t('manage.dynamo.partitionKey')"
                required
                :error="errors.partitionKey"
              >
                <div class="flex gap-2">
                  <Input
                    v-model="formValue.partitionKey.name"
                    :placeholder="lang.t('manage.dynamo.keyAttributeName')"
                    autocapitalize="off"
                    autocomplete="off"
                    :spellcheck="false"
                    autocorrect="off"
                    class="flex-1"
                  />
                  <Select v-model="formValue.partitionKey.type">
                    <SelectTrigger class="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="opt in keyTypeOptions" :key="opt.value" :value="opt.value">
                        {{ opt.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </FormItem>

              <FormItem :label="lang.t('manage.dynamo.sortKey')">
                <div class="flex gap-2">
                  <Input
                    v-model="formValue.sortKey.name"
                    :placeholder="lang.t('manage.dynamo.sortKeyPlaceholder')"
                    autocapitalize="off"
                    autocomplete="off"
                    :spellcheck="false"
                    autocorrect="off"
                    class="flex-1"
                  />
                  <Select v-model="formValue.sortKey.type">
                    <SelectTrigger class="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="opt in keyTypeOptions" :key="opt.value" :value="opt.value">
                        {{ opt.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </FormItem>
            </template>

            <template v-else-if="currentStep === 1">
              <FormItem :label="lang.t('manage.dynamo.billingMode')">
                <Select v-model="formValue.billingMode">
                  <SelectTrigger class="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PAY_PER_REQUEST">
                      {{ lang.t('manage.dynamo.billingOnDemand') }}
                    </SelectItem>
                    <SelectItem value="PROVISIONED">
                      {{ lang.t('manage.dynamo.billingProvisioned') }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>

              <template v-if="formValue.billingMode === 'PROVISIONED'">
                <div class="grid grid-cols-2 gap-4">
                  <FormItem
                    :label="lang.t('manage.dynamo.readCapacity')"
                    :error="errors.readCapacity"
                  >
                    <Input
                      v-model.number="formValue.readCapacity"
                      type="number"
                      min="1"
                      :placeholder="'5'"
                    />
                  </FormItem>
                  <FormItem
                    :label="lang.t('manage.dynamo.writeCapacity')"
                    :error="errors.writeCapacity"
                  >
                    <Input
                      v-model.number="formValue.writeCapacity"
                      type="number"
                      min="1"
                      :placeholder="'5'"
                    />
                  </FormItem>
                </div>
              </template>
            </template>

            <template v-else-if="currentStep === 2">
              <div class="indexes-header flex justify-between items-center mb-4">
                <span class="text-sm font-medium">
                  {{ lang.t('manage.dynamo.globalSecondaryIndexes') }}
                </span>
                <Button variant="outline" size="sm" @click="addGsi">
                  {{ lang.t('manage.dynamo.addGsi') }}
                </Button>
              </div>

              <div
                v-if="formValue.globalSecondaryIndexes.length === 0"
                class="text-sm text-gray-500 py-4"
              >
                {{ lang.t('manage.dynamo.noIndexes') }}
              </div>

              <div v-else class="space-y-4">
                <div
                  v-for="(gsi, index) in formValue.globalSecondaryIndexes"
                  :key="index"
                  class="index-card p-4 bg-gray-50 rounded-lg space-y-3"
                >
                  <div class="flex justify-between items-center">
                    <span class="text-sm font-medium">
                      {{ lang.t('manage.dynamo.gsiIndex') }} {{ index + 1 }}
                    </span>
                    <Button variant="ghost" size="sm" @click="removeGsi(index)">
                      <span class="i-carbon-trash-can h-4 w-4" />
                    </Button>
                  </div>

                  <FormItem :label="lang.t('manage.dynamo.indexName')">
                    <Input
                      v-model="gsi.indexName"
                      :placeholder="lang.t('manage.dynamo.indexNamePlaceholder')"
                      autocapitalize="off"
                      autocomplete="off"
                    />
                  </FormItem>

                  <FormItem :label="lang.t('manage.dynamo.partitionKey')">
                    <div class="flex gap-2">
                      <Input
                        v-model="gsi.partitionKey.name"
                        :placeholder="lang.t('manage.dynamo.keyAttributeName')"
                        class="flex-1"
                      />
                      <Select v-model="gsi.partitionKey.type">
                        <SelectTrigger class="w-[80px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem
                            v-for="opt in keyTypeOptions"
                            :key="opt.value"
                            :value="opt.value"
                          >
                            {{ opt.label }}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </FormItem>

                  <FormItem :label="lang.t('manage.dynamo.sortKey')">
                    <div class="flex gap-2">
                      <Input
                        v-model="gsi.sortKey.name"
                        :placeholder="lang.t('manage.dynamo.sortKeyPlaceholderCreate')"
                        class="flex-1"
                      />
                      <Select v-model="gsi.sortKey.type">
                        <SelectTrigger class="w-[80px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem
                            v-for="opt in keyTypeOptions"
                            :key="opt.value"
                            :value="opt.value"
                          >
                            {{ opt.label }}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </FormItem>

                  <FormItem :label="lang.t('manage.dynamo.projectionType')">
                    <Select v-model="gsi.projectionType">
                      <SelectTrigger class="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">
                          {{ lang.t('manage.dynamo.projectionAll') }}
                        </SelectItem>
                        <SelectItem value="KEYS_ONLY">
                          {{ lang.t('manage.dynamo.projectionKeysOnly') }}
                        </SelectItem>
                        <SelectItem value="INCLUDE">
                          {{ lang.t('manage.dynamo.projectionInclude') }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>

                  <template v-if="formValue.billingMode === 'PROVISIONED'">
                    <div class="grid grid-cols-2 gap-4">
                      <FormItem :label="lang.t('manage.dynamo.readCapacity')">
                        <Input
                          v-model.number="gsi.readCapacity"
                          type="number"
                          min="1"
                          :placeholder="'5'"
                        />
                      </FormItem>
                      <FormItem :label="lang.t('manage.dynamo.writeCapacity')">
                        <Input
                          v-model.number="gsi.writeCapacity"
                          type="number"
                          min="1"
                          :placeholder="'5'"
                        />
                      </FormItem>
                    </div>
                  </template>
                </div>
              </div>

              <Separator class="my-4" />

              <div class="stream-section space-y-4">
                <FormItem :label="lang.t('manage.dynamo.enableStreams')">
                  <Switch
                    :checked="formValue.streamSpecification.streamEnabled"
                    @update:checked="val => (formValue.streamSpecification.streamEnabled = val)"
                  />
                </FormItem>

                <FormItem
                  v-if="formValue.streamSpecification.streamEnabled"
                  :label="lang.t('manage.dynamo.streamViewType')"
                >
                  <Select v-model="formValue.streamSpecification.streamViewType">
                    <SelectTrigger class="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NEW_AND_OLD_IMAGES">
                        {{ lang.t('manage.dynamo.streamNewAndOld') }}
                      </SelectItem>
                      <SelectItem value="NEW_IMAGE">
                        {{ lang.t('manage.dynamo.streamNewImage') }}
                      </SelectItem>
                      <SelectItem value="OLD_IMAGE">
                        {{ lang.t('manage.dynamo.streamOldImage') }}
                      </SelectItem>
                      <SelectItem value="KEYS_ONLY">
                        {{ lang.t('manage.dynamo.streamKeysOnly') }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              </div>
            </template>

            <template v-else-if="currentStep === 3">
              <div class="review-section space-y-4">
                <div class="review-card p-4 bg-gray-50 rounded-lg space-y-2">
                  <div class="flex justify-between">
                    <span class="text-gray-500">{{ lang.t('manage.dynamo.tableName') }}</span>
                    <span class="font-medium">{{ formValue.tableName }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-500">{{ lang.t('manage.dynamo.partitionKey') }}</span>
                    <span class="font-medium">
                      {{ formValue.partitionKey.name }} ({{ formValue.partitionKey.type }})
                    </span>
                  </div>
                  <div v-if="formValue.sortKey.name" class="flex justify-between">
                    <span class="text-gray-500">{{ lang.t('manage.dynamo.sortKey') }}</span>
                    <span class="font-medium">
                      {{ formValue.sortKey.name }} ({{ formValue.sortKey.type }})
                    </span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-500">{{ lang.t('manage.dynamo.billingMode') }}</span>
                    <span class="font-medium">
                      {{
                        formValue.billingMode === 'PAY_PER_REQUEST'
                          ? lang.t('manage.dynamo.billingOnDemand')
                          : lang.t('manage.dynamo.billingProvisioned')
                      }}
                    </span>
                  </div>
                  <template v-if="formValue.billingMode === 'PROVISIONED'">
                    <div class="flex justify-between">
                      <span class="text-gray-500">{{ lang.t('manage.dynamo.readCapacity') }}</span>
                      <span class="font-medium">{{ formValue.readCapacity }}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-gray-500">{{ lang.t('manage.dynamo.writeCapacity') }}</span>
                      <span class="font-medium">{{ formValue.writeCapacity }}</span>
                    </div>
                  </template>
                  <div
                    v-if="formValue.globalSecondaryIndexes.length > 0"
                    class="flex justify-between"
                  >
                    <span class="text-gray-500">{{ lang.t('manage.dynamo.gsiCount') }}</span>
                    <span class="font-medium">{{ formValue.globalSecondaryIndexes.length }}</span>
                  </div>
                  <div
                    v-if="formValue.streamSpecification.streamEnabled"
                    class="flex justify-between"
                  >
                    <span class="text-gray-500">{{ lang.t('manage.dynamo.streams') }}</span>
                    <span class="font-medium">
                      {{ formValue.streamSpecification.streamViewType }}
                    </span>
                  </div>
                </div>
              </div>
            </template>
          </Form>
        </ScrollArea>
      </div>

      <DialogFooter class="mt-4">
        <Button
          v-if="currentStep > 0 && !resultMessage"
          variant="outline"
          :disabled="loading"
          @click="prevStep"
        >
          {{ lang.t('manage.dynamo.back') }}
        </Button>
        <Button
          v-if="resultType === 'error'"
          variant="destructive"
          :disabled="loading"
          @click="handleRetry"
        >
          <Spinner v-if="loading" class="mr-2 h-4 w-4" />
          {{ lang.t('dialogOps.retry') }}
        </Button>
        <Button
          v-else-if="currentStep < steps.length - 1 && !resultMessage"
          :disabled="loading || !canProceed"
          @click="nextStep"
        >
          {{ lang.t('manage.dynamo.next') }}
        </Button>
        <Button
          v-else-if="!resultMessage"
          :disabled="loading || !canProceed"
          @click="handleConfirm"
        >
          <Spinner v-if="loading" class="mr-2 h-4 w-4" />
          {{ lang.t('manage.dynamo.createTable') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed, reactive } from 'vue';
import { X } from 'lucide-vue-next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Form, FormItem } from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { MIN_LOADING_TIME, SUCCESS_MESSAGE_DELAY } from '../../../common';
import { useLang } from '../../../lang';
import {
  useDynamoManageStore,
  DynamoDBConnection,
  CreateTableConfig,
  DatabaseType,
} from '../../../store';

const lang = useLang();
const dynamoManageStore = useDynamoManageStore();

interface Props {
  show: boolean;
  connection: DynamoDBConnection;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  (e: 'created', tableName: string): void;
}>();

const steps = [
  { label: lang.t('manage.dynamo.stepBasic'), value: 0 },
  { label: lang.t('manage.dynamo.stepCapacity'), value: 1 },
  { label: lang.t('manage.dynamo.stepIndexes'), value: 2 },
  { label: lang.t('manage.dynamo.stepReview'), value: 3 },
];

const keyTypeOptions = [
  { label: 'String', value: 'S' },
  { label: 'Number', value: 'N' },
  { label: 'Binary', value: 'B' },
];

const currentStep = ref(0);
const loading = ref(false);
const resultMessage = ref('');
const resultType = ref<'success' | 'error'>('success');
const errors = reactive({
  tableName: '',
  partitionKey: '',
  readCapacity: '',
  writeCapacity: '',
});

const formValue = reactive({
  tableName: '',
  partitionKey: { name: '', type: 'S' as 'S' | 'N' | 'B' },
  sortKey: { name: '', type: 'S' as 'S' | 'N' | 'B' },
  billingMode: 'PAY_PER_REQUEST' as 'PAY_PER_REQUEST' | 'PROVISIONED',
  readCapacity: 5,
  writeCapacity: 5,
  globalSecondaryIndexes: [] as Array<{
    indexName: string;
    partitionKey: { name: string; type: 'S' | 'N' | 'B' };
    sortKey: { name: string; type: 'S' | 'N' | 'B' };
    projectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE';
    readCapacity: number;
    writeCapacity: number;
  }>,
  streamSpecification: {
    streamEnabled: false,
    streamViewType: 'NEW_AND_OLD_IMAGES' as
      | 'KEYS_ONLY'
      | 'NEW_IMAGE'
      | 'OLD_IMAGE'
      | 'NEW_AND_OLD_IMAGES',
  },
});

const canProceed = computed(() => {
  if (currentStep.value === 0) {
    return formValue.tableName.length >= 3 && formValue.partitionKey.name.length > 0;
  }
  if (currentStep.value === 1) {
    if (formValue.billingMode === 'PROVISIONED') {
      return formValue.readCapacity >= 1 && formValue.writeCapacity >= 1;
    }
    return true;
  }
  if (currentStep.value === 2) {
    return true;
  }
  if (currentStep.value === 3) {
    return formValue.tableName.length >= 3 && formValue.partitionKey.name.length > 0;
  }
  return true;
});

watch(
  () => props.show,
  newVal => {
    if (newVal) {
      currentStep.value = 0;
      resultMessage.value = '';
      resultType.value = 'success';
      loading.value = false;
      formValue.tableName = '';
      formValue.partitionKey = { name: '', type: 'S' as 'S' | 'N' | 'B' };
      formValue.sortKey = { name: '', type: 'S' as 'S' | 'N' | 'B' };
      formValue.billingMode = 'PAY_PER_REQUEST' as 'PAY_PER_REQUEST' | 'PROVISIONED';
      formValue.readCapacity = 5;
      formValue.writeCapacity = 5;
      formValue.globalSecondaryIndexes = [];
      formValue.streamSpecification = {
        streamEnabled: false,
        streamViewType: 'NEW_AND_OLD_IMAGES',
      };
      errors.tableName = '';
      errors.partitionKey = '';
      errors.readCapacity = '';
      errors.writeCapacity = '';
    }
  },
);

const validateTableName = () => {
  if (formValue.tableName.length < 3) {
    errors.tableName = lang.t('manage.dynamo.tableNameMinLength');
  } else if (!/^[a-zA-Z0-9_.-]+$/.test(formValue.tableName)) {
    errors.tableName = lang.t('manage.dynamo.tableNameInvalidChars');
  } else if (formValue.tableName.length > 255) {
    errors.tableName = lang.t('manage.dynamo.tableNameMaxLength');
  } else {
    errors.tableName = '';
  }
};

const addGsi = () => {
  formValue.globalSecondaryIndexes.push({
    indexName: '',
    partitionKey: { name: '', type: 'S' },
    sortKey: { name: '', type: 'S' },
    projectionType: 'ALL',
    readCapacity: 5,
    writeCapacity: 5,
  });
};

const removeGsi = (index: number) => {
  formValue.globalSecondaryIndexes.splice(index, 1);
};

const prevStep = () => {
  if (currentStep.value > 0) {
    currentStep.value--;
  }
};

const nextStep = () => {
  if (currentStep.value < steps.length - 1) {
    if (currentStep.value === 0) {
      validateTableName();
      if (errors.tableName) return;
    }
    currentStep.value++;
  }
};

const handleRetry = async () => {
  resultMessage.value = '';
  await handleConfirm();
};

const handleConfirm = async () => {
  if (props.connection.type !== DatabaseType.DYNAMODB) return;

  validateTableName();
  if (errors.tableName) return;

  const startTime = Date.now();

  try {
    loading.value = true;

    const config: CreateTableConfig = {
      tableName: formValue.tableName,
      partitionKey: formValue.partitionKey,
      sortKey: formValue.sortKey.name ? formValue.sortKey : undefined,
      billingMode: formValue.billingMode,
      readCapacity: formValue.billingMode === 'PROVISIONED' ? formValue.readCapacity : undefined,
      writeCapacity: formValue.billingMode === 'PROVISIONED' ? formValue.writeCapacity : undefined,
      globalSecondaryIndexes: formValue.globalSecondaryIndexes
        .filter(gsi => gsi.indexName && gsi.partitionKey.name)
        .map(gsi => ({
          indexName: gsi.indexName,
          keySchema: [
            {
              attributeName: gsi.partitionKey.name,
              keyType: 'HASH' as const,
              attributeType: gsi.partitionKey.type,
            },
            ...(gsi.sortKey.name
              ? [
                  {
                    attributeName: gsi.sortKey.name,
                    keyType: 'RANGE' as const,
                    attributeType: gsi.sortKey.type,
                  },
                ]
              : []),
          ],
          projectionType: gsi.projectionType,
          readCapacityUnits: formValue.billingMode === 'PROVISIONED' ? gsi.readCapacity : undefined,
          writeCapacityUnits:
            formValue.billingMode === 'PROVISIONED' ? gsi.writeCapacity : undefined,
        })),
      streamSpecification: formValue.streamSpecification.streamEnabled
        ? formValue.streamSpecification
        : undefined,
    };

    const result = await dynamoManageStore.createTable(props.connection, config);

    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    resultType.value = 'success';
    resultMessage.value = 'success';

    setTimeout(() => {
      emit('update:show', false);
      emit('created', result.tableName);
    }, SUCCESS_MESSAGE_DELAY);
  } catch (error: unknown) {
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    resultType.value = 'error';
    const err = error as { details?: string; status?: number; message?: string };
    resultMessage.value = err?.details
      ? `status: ${err?.status ?? 'unknown'}, details: ${err.details}`
      : err?.message || String(error);
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.wizard-container {
  min-height: 300px;
}

.step-indicator {
  flex: 1;
}

.step-indicator:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 50%;
  width: 50%;
  height: 2px;
  background: var(--gray-200);
}

.index-card {
  border: 1px solid var(--gray-200);
}

.review-card {
  border: 1px solid var(--gray-200);
}
</style>
