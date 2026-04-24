<template>
  <Dialog :open="showModal" @update:open="handleOpenChange">
    <DialogContent class="sm:max-w-[600px]" :show-close="false">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <img :src="dynamoDBIcon" class="h-5 w-5" />
          {{ modalTitle }}
        </DialogTitle>
        <button
          class="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
          @click="closeModal"
        >
          <X class="h-4 w-4" />
        </button>
      </DialogHeader>

      <div class="modal-content">
        <Alert v-if="successMessage" variant="success" class="mb-4">
          <AlertDescription class="flex items-center justify-between">
            {{ successMessage }}
            <button class="ml-2 hover:opacity-70 cursor-pointer" @click="successMessage = ''">
              <X class="w-4 h-4" />
            </button>
          </AlertDescription>
        </Alert>
        <Alert v-if="errorMessage" variant="destructive" class="mb-4">
          <AlertDescription class="flex items-center justify-between">
            {{ errorMessage }}
            <button class="ml-2 hover:opacity-70 cursor-pointer" @click="errorMessage = ''">
              <X class="w-4 h-4" />
            </button>
          </AlertDescription>
        </Alert>

        <Form @submit.prevent="saveConnect">
          <FormItem :label="$t('connection.name')" required :error="getError('name', errors.name)">
            <Input
              v-model="formData.name"
              :placeholder="$t('connection.name')"
              @blur="handleBlur('name')"
            />
          </FormItem>
          <FormItem :label="$t('connection.connectionTarget')">
            <Tabs
              :model-value="connectionTarget"
              @update:model-value="value => onTargetChange(value as string)"
            >
              <TabsList class="w-full">
                <TabsTrigger class="flex-1" value="cloud">
                  {{ $t('connection.cloudTarget') }}
                </TabsTrigger>
                <TabsTrigger class="flex-1" value="local">
                  {{ $t('connection.localTarget') }}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </FormItem>
          <template v-if="isLocal">
            <Alert variant="info" class="mb-4">
              <AlertDescription>{{ $t('connection.localLimitations') }}</AlertDescription>
            </Alert>
            <FormItem
              :label="$t('connection.endpointUrl')"
              required
              :error="getError('endpointUrl', errors.endpointUrl)"
            >
              <Input
                v-model="formData.endpointUrl"
                placeholder="http://localhost:8000"
                @blur="handleBlur('endpointUrl')"
              />
            </FormItem>
          </template>
          <template v-else>
            <FormItem
              :label="$t('connection.region')"
              required
              :error="getError('region', errors.region)"
            >
              <Select
                v-model="formData.region"
                @update:open="(open: boolean) => !open && handleBlur('region')"
              >
                <SelectTrigger>
                  <SelectValue :placeholder="$t('connection.selectRegion')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="option in regionOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
            <FormItem
              :label="$t('connection.accessKeyId')"
              required
              :error="getError('accessKeyId', errors.accessKeyId)"
            >
              <Input
                v-model="formData.accessKeyId"
                :placeholder="$t('connection.accessKeyId')"
                @blur="handleBlur('accessKeyId')"
              />
            </FormItem>
            <FormItem
              :label="$t('connection.secretAccessKey')"
              required
              :error="getError('secretAccessKey', errors.secretAccessKey)"
            >
              <Input
                v-model="formData.secretAccessKey"
                type="password"
                :placeholder="$t('connection.secretAccessKey')"
                @blur="handleBlur('secretAccessKey')"
              />
            </FormItem>
          </template>

          <FormItem :label="$t('connection.tableFilter.label')">
            <RadioGroup
              class="flex flex-row flex-wrap gap-x-5 gap-y-1.5"
              :model-value="filterKind"
              @update:model-value="onFilterKindChange"
            >
              <label
                v-for="opt in filterKindOptions"
                :key="opt.value"
                class="flex items-center gap-1.5 cursor-pointer text-sm select-none"
              >
                <RadioGroupItem :value="opt.value" />
                {{ opt.label }}
              </label>
            </RadioGroup>

            <div class="mt-2.5 space-y-2">
              <template v-if="filterKind === 'explicit' || filterKind === 'exclude'">
                <div class="relative">
                  <Input
                    v-model="filterTableNameInput"
                    :placeholder="$t('connection.tableFilter.searchPlaceholder')"
                    autocomplete="off"
                    @focus="showSuggestions = true"
                    @blur="onInputBlur"
                    @keydown.enter.prevent="addFromInputOrFirst"
                    @keydown.escape="showSuggestions = false"
                  />
                  <div
                    v-if="showSuggestions && filteredSuggestions.length"
                    class="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-md max-h-48 overflow-y-auto"
                  >
                    <button
                      v-for="name in filteredSuggestions"
                      :key="name"
                      type="button"
                      class="w-full text-left px-3 py-1.5 text-sm hover:bg-accent cursor-pointer"
                      @mousedown.prevent="addFilterTableName(name)"
                    >
                      {{ name }}
                    </button>
                  </div>
                </div>
                <div v-if="filterTableNames.length" class="flex flex-wrap gap-1.5">
                  <Badge
                    v-for="name in filterTableNames"
                    :key="name"
                    variant="secondary"
                    class="flex items-center gap-1 cursor-pointer hover:opacity-70"
                    @click="removeFilterTableName(name)"
                  >
                    {{ name }}
                    <X class="h-3 w-3" />
                  </Badge>
                </div>
                <p v-if="matchPreview" class="text-xs text-muted-foreground">
                  {{ matchPreview }}
                </p>
              </template>

              <template v-else-if="filterKind === 'regex'">
                <Input
                  :model-value="filterRegex"
                  :placeholder="$t('connection.tableFilter.regexPlaceholder')"
                  @update:model-value="v => onFilterStringChange('regex', v as string)"
                />
                <p v-if="matchPreview" class="text-xs text-muted-foreground">
                  {{ matchPreview }}
                </p>
              </template>

              <template v-else>
                <p v-if="matchPreview" class="text-xs text-muted-foreground">
                  {{ matchPreview }}
                </p>
              </template>
            </div>
          </FormItem>
        </Form>
      </div>

      <DialogFooter class="flex justify-between sm:justify-between">
        <div class="left">
          <Button variant="secondary" :disabled="!isFormValid || testLoading" @click="testConnect">
            <Loader2 v-if="testLoading" class="mr-2 h-4 w-4 animate-spin" />
            {{ $t('connection.test') }}
          </Button>
        </div>
        <div class="right flex gap-2">
          <Button variant="outline" @click="closeModal">
            {{ $t('dialogOps.cancel') }}
          </Button>
          <Button :disabled="!isFormValid || saveLoading" @click="saveConnect">
            <Loader2 v-if="saveLoading" class="mr-2 h-4 w-4 animate-spin" />
            {{ $t('dialogOps.confirm') }}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { X, Loader2 } from 'lucide-vue-next';
import { cloneDeep, debounce } from 'lodash';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { CustomError, MIN_LOADING_TIME } from '../../../common';
import dynamoDBIcon from '../../../assets/svg/dynamoDB.svg';
import { useLang } from '../../../lang';
import { useConnectionStore } from '../../../store';
import {
  DatabaseType,
  DynamoDBConnection,
  type DynamoTableFilter,
  applyTableFilter,
} from '../../../store';
import { ApiClientError } from '../../../datasources/ApiClients';
import { dynamoApi } from '../../../datasources/dynamoApi';
import { useFormValidation } from '@/composables';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Form, FormItem } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';

const connectionStore = useConnectionStore();
const { freshConnection } = connectionStore;
const lang = useLang();

const showModal = ref(false);
const modalTitle = ref(lang.t('connection.new'));
const testLoading = ref(false);
const saveLoading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const connectionTarget = ref<'cloud' | 'local'>('cloud');
const { handleBlur, getError, markSubmitted, resetValidation } = useFormValidation();

const isLocal = computed(() => connectionTarget.value === 'local');

const regionOptions = [
  { label: 'US East (N. Virginia)', value: 'us-east-1' },
  { label: 'US East (Ohio)', value: 'us-east-2' },
  { label: 'US West (N. California)', value: 'us-west-1' },
  { label: 'US West (Oregon)', value: 'us-west-2' },
  { label: 'Asia Pacific (Mumbai)', value: 'ap-south-1' },
  { label: 'Asia Pacific (Seoul)', value: 'ap-northeast-2' },
  { label: 'Asia Pacific (Singapore)', value: 'ap-southeast-1' },
  { label: 'Asia Pacific (Sydney)', value: 'ap-southeast-2' },
  { label: 'Asia Pacific (Tokyo)', value: 'ap-northeast-1' },
  { label: 'Canada (Central)', value: 'ca-central-1' },
  { label: 'Europe (Frankfurt)', value: 'eu-central-1' },
  { label: 'Europe (Ireland)', value: 'eu-west-1' },
];

const formSchema = toTypedSchema(
  z.object({
    name: z.string().min(1, lang.t('connection.formValidation.nameRequired')),
    region: z.string().min(1, lang.t('connection.formValidation.regionRequired')),
    accessKeyId: z.string().min(1, lang.t('connection.formValidation.accessKeyIdRequired')),
    secretAccessKey: z.string().min(1, lang.t('connection.formValidation.secretAccessKeyRequired')),
    endpointUrl: z.string().optional(),
    type: z.nativeEnum(DatabaseType),
  }),
);

const defaultFormData = {
  name: '',
  type: DatabaseType.DYNAMODB,
  region: '',
  accessKeyId: '',
  secretAccessKey: '',
  endpointUrl: '',
} as DynamoDBConnection;

const formData = ref<DynamoDBConnection>(cloneDeep(defaultFormData));

const {
  errors,
  validate,
  resetForm: veeResetForm,
  setValues,
} = useForm({
  validationSchema: formSchema,
  initialValues: cloneDeep(defaultFormData),
});

watch(formData, newVal => setValues(newVal), { deep: true });

const onTargetChange = (value: string) => {
  connectionTarget.value = value as 'cloud' | 'local';
  if (value === 'local') {
    formData.value.accessKeyId = 'dummy';
    formData.value.secretAccessKey = 'dummy';
    formData.value.region = 'us-east-1';
    formData.value.endpointUrl = formData.value.endpointUrl || 'http://localhost:8000';
  } else {
    formData.value.accessKeyId = '';
    formData.value.secretAccessKey = '';
    formData.value.region = '';
    formData.value.endpointUrl = '';
  }
};

const handleOpenChange = (open: boolean) => {
  if (!open) closeModal();
};

const showMedal = (con: DynamoDBConnection | null) => {
  showModal.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  if (con) {
    formData.value = { ...con };
    veeResetForm({ values: { ...con } });
    connectionTarget.value = con.endpointUrl ? 'local' : 'cloud';
    modalTitle.value = lang.t('connection.edit');
  } else {
    formData.value = cloneDeep(defaultFormData);
    veeResetForm({ values: cloneDeep(defaultFormData) });
    connectionTarget.value = 'cloud';
  }
  resetValidation();
};

const closeModal = () => {
  showModal.value = false;
  formData.value = cloneDeep(defaultFormData);
  veeResetForm({ values: cloneDeep(defaultFormData) });
  modalTitle.value = lang.t('connection.new');
  errorMessage.value = '';
  successMessage.value = '';
  connectionTarget.value = 'cloud';
  availableTables.value = [];
  filterTableNameInput.value = '';
  showSuggestions.value = false;
  resetValidation();
};

const isFormValid = computed(() => {
  if (isLocal.value) {
    return !!formData.value.name && !!formData.value.endpointUrl;
  }
  return !!(
    formData.value.name &&
    formData.value.region &&
    formData.value.accessKeyId &&
    formData.value.secretAccessKey
  );
});

const testConnect = async () => {
  errorMessage.value = '';
  successMessage.value = '';
  markSubmitted();

  const { valid } = await validate();
  if (!valid) {
    errorMessage.value = lang.t('connection.validationFailed');
    return;
  }

  testLoading.value = true;
  const startTime = Date.now();

  try {
    await freshConnection(formData.value);

    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) await new Promise(resolve => setTimeout(resolve, remainingTime));

    successMessage.value = lang.t('connection.testSuccess');
  } catch (error: unknown) {
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) await new Promise(resolve => setTimeout(resolve, remainingTime));

    if (error instanceof CustomError) {
      errorMessage.value = error.details || `Connection failed (status: ${error.status})`;
    } else if (error instanceof ApiClientError) {
      errorMessage.value = error.details || `Connection failed (status: ${error.status})`;
    } else if (error instanceof Error) {
      errorMessage.value = error.message;
    } else {
      errorMessage.value = lang.t('connection.unknownError');
    }
  } finally {
    testLoading.value = false;
  }
};

const saveConnect = async () => {
  errorMessage.value = '';
  successMessage.value = '';
  markSubmitted();

  const { valid } = await validate();
  if (!valid) {
    errorMessage.value = lang.t('connection.validationFailed');
    return;
  }

  saveLoading.value = true;
  const result = await connectionStore.saveConnection(formData.value);
  if (result.success) {
    closeModal();
  } else {
    errorMessage.value = result.message;
  }
  saveLoading.value = false;
};

// ── Table filter ─────────────────────────────────────────────────────────────

const filterKindOptions = computed(() => [
  { value: 'all', label: lang.t('connection.tableFilter.kindAll') },
  { value: 'explicit', label: lang.t('connection.tableFilter.kindExplicit') },
  { value: 'exclude', label: lang.t('connection.tableFilter.kindExclude') },
  { value: 'regex', label: lang.t('connection.tableFilter.kindRegex') },
]);

const filterKind = computed<DynamoTableFilter['kind']>(
  () => formData.value.tableFilter?.kind ?? 'all',
);

const filterTableNames = computed<string[]>(() => {
  const f = formData.value.tableFilter;
  return f && (f.kind === 'explicit' || f.kind === 'exclude') ? f.tableNames : [];
});

const filterRegex = computed<string>(() => {
  const f = formData.value.tableFilter;
  return f?.kind === 'regex' ? f.pattern : '';
});

// Raw table list fetched silently from the connection
const availableTables = ref<string[]>([]);
let fetchAbortFlag = 0;

const silentFetchTables = async () => {
  const tick = ++fetchAbortFlag;
  try {
    const tables = await dynamoApi.listTables({
      region: formData.value.region,
      accessKeyId: formData.value.accessKeyId,
      secretAccessKey: formData.value.secretAccessKey,
      endpointUrl: formData.value.endpointUrl,
    });
    if (tick === fetchAbortFlag) availableTables.value = tables;
  } catch {
    // silently ignore — no credentials yet or invalid
  }
};

const debouncedFetchTables = debounce(silentFetchTables, 500);

watch(
  isFormValid,
  valid => {
    if (valid) debouncedFetchTables();
    else availableTables.value = [];
  },
  { immediate: true },
);

// Match preview (count + sample names, max 3)
const PREVIEW_SAMPLE = 3;
const matchedTables = computed(() =>
  applyTableFilter(availableTables.value, formData.value.tableFilter),
);

const matchPreview = computed(() => {
  if (!availableTables.value.length) return '';
  const matched = matchedTables.value;
  const sample = matched.slice(0, PREVIEW_SAMPLE).join(', ');
  const suffix =
    matched.length > PREVIEW_SAMPLE ? `, +${matched.length - PREVIEW_SAMPLE} more` : '';
  return lang.t('connection.tableFilter.matchPreview', {
    count: matched.length,
    sample: sample + suffix,
  });
});

// Autocomplete for explicit / exclude
const filterTableNameInput = ref('');
const showSuggestions = ref(false);

const filteredSuggestions = computed(() => {
  const q = filterTableNameInput.value.trim().toLowerCase();
  const selected = new Set(filterTableNames.value);
  return availableTables.value.filter(
    name => !selected.has(name) && (!q || name.toLowerCase().includes(q)),
  );
});

const onInputBlur = () => {
  setTimeout(() => {
    showSuggestions.value = false;
  }, 150);
};

const addFromInputOrFirst = () => {
  const name = filterTableNameInput.value.trim();
  if (name) {
    addFilterTableName(name);
  } else if (filteredSuggestions.value.length) {
    addFilterTableName(filteredSuggestions.value[0]);
  }
};

const onFilterKindChange = (kind: string) => {
  filterTableNameInput.value = '';
  showSuggestions.value = false;
  const k = kind as DynamoTableFilter['kind'];
  if (k === 'all') {
    formData.value = { ...formData.value, tableFilter: { kind: 'all' } };
  } else if (k === 'explicit' || k === 'exclude') {
    formData.value = { ...formData.value, tableFilter: { kind: k, tableNames: [] } };
  } else {
    formData.value = { ...formData.value, tableFilter: { kind: 'regex', pattern: '' } };
  }
};

const addFilterTableName = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return;
  const f = formData.value.tableFilter;
  if (!f || (f.kind !== 'explicit' && f.kind !== 'exclude')) return;
  if (f.tableNames.includes(trimmed)) {
    filterTableNameInput.value = '';
    return;
  }
  formData.value = {
    ...formData.value,
    tableFilter: { ...f, tableNames: [...f.tableNames, trimmed] },
  };
  filterTableNameInput.value = '';
  showSuggestions.value = false;
};

const removeFilterTableName = (name: string) => {
  const f = formData.value.tableFilter;
  if (!f || (f.kind !== 'explicit' && f.kind !== 'exclude')) return;
  formData.value = {
    ...formData.value,
    tableFilter: { ...f, tableNames: f.tableNames.filter(n => n !== name) },
  };
};

const onFilterStringChange = (_field: 'regex', value: string) => {
  formData.value = { ...formData.value, tableFilter: { kind: 'regex', pattern: value } };
};

defineExpose({ showMedal });
</script>
