<template>
  <Dialog :open="showModal" @update:open="handleOpenChange">
    <DialogContent class="sm:max-w-[600px]" :show-close="false">
      <DialogHeader>
        <DialogTitle>{{ modalTitle }}</DialogTitle>
        <button
          class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
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
          <FormItem :label="$t('connection.name')" required>
            <Input v-model="formData.name" :placeholder="$t('connection.name')" />
            <p v-if="errors.name" class="text-sm text-destructive mt-1">
              {{ errors.name }}
            </p>
          </FormItem>
          <FormItem :label="$t('connection.tableName')" required>
            <Input v-model="formData.tableName" :placeholder="$t('connection.tableName')" />
            <p v-if="errors.tableName" class="text-sm text-destructive mt-1">
              {{ errors.tableName }}
            </p>
          </FormItem>
          <FormItem :label="$t('connection.region')" required>
            <Select v-model="formData.region">
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
            <p v-if="errors.region" class="text-sm text-destructive mt-1">
              {{ errors.region }}
            </p>
          </FormItem>
          <FormItem :label="$t('connection.accessKeyId')" required>
            <Input v-model="formData.accessKeyId" :placeholder="$t('connection.accessKeyId')" />
            <p v-if="errors.accessKeyId" class="text-sm text-destructive mt-1">
              {{ errors.accessKeyId }}
            </p>
          </FormItem>
          <FormItem :label="$t('connection.secretAccessKey')" required>
            <Input
              v-model="formData.secretAccessKey"
              type="password"
              :placeholder="$t('connection.secretAccessKey')"
            />
            <p v-if="errors.secretAccessKey" class="text-sm text-destructive mt-1">
              {{ errors.secretAccessKey }}
            </p>
          </FormItem>
        </Form>
      </div>

      <DialogFooter class="flex justify-between sm:justify-between">
        <div class="left">
          <Button variant="secondary" :disabled="!isFormValid || testLoading" @click="testConnect">
            <span v-if="testLoading" class="mr-2 h-4 w-4 animate-spin">⟳</span>
            {{ $t('connection.test') }}
          </Button>
        </div>
        <div class="right flex gap-2">
          <Button variant="outline" @click="closeModal">
            {{ $t('dialogOps.cancel') }}
          </Button>
          <Button :disabled="!isFormValid || saveLoading" @click="saveConnect">
            <span v-if="saveLoading" class="mr-2 h-4 w-4 animate-spin">⟳</span>
            {{ $t('dialogOps.confirm') }}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { X } from 'lucide-vue-next';
import { cloneDeep } from 'lodash';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { CustomError, MIN_LOADING_TIME } from '../../../common';
import { useLang } from '../../../lang';
import { useConnectionStore } from '../../../store';
import { DatabaseType, DynamoDBConnection } from '../../../store';
import { ApiClientError } from '../../../datasources/ApiClients';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const connectionStore = useConnectionStore();

const { freshConnection } = connectionStore;

const lang = useLang();

const showModal = ref(false);
const modalTitle = ref(lang.t('connection.new'));
const testLoading = ref(false);
const saveLoading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

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

// Zod validation schema
const formSchema = toTypedSchema(
  z.object({
    name: z.string().min(1, lang.t('connection.formValidation.nameRequired')),
    tableName: z.string().min(1, lang.t('connection.formValidation.tableNameRequired')),
    region: z.string().min(1, lang.t('connection.formValidation.regionRequired')),
    accessKeyId: z.string().min(1, lang.t('connection.formValidation.accessKeyIdRequired')),
    secretAccessKey: z.string().min(1, lang.t('connection.formValidation.secretAccessKeyRequired')),
    type: z.nativeEnum(DatabaseType),
  }),
);

const defaultFormData = {
  name: '',
  type: DatabaseType.DYNAMODB,
  region: '',
  accessKeyId: '',
  secretAccessKey: '',
  tableName: '',
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

// Watch formData changes and sync with vee-validate
watch(
  formData,
  newVal => {
    setValues(newVal);
  },
  { deep: true },
);

const handleOpenChange = (open: boolean) => {
  if (!open) {
    closeModal();
  }
};

const showMedal = (con: DynamoDBConnection | null) => {
  showModal.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  if (con) {
    formData.value = { ...con };
    veeResetForm({ values: { ...con } });
    modalTitle.value = lang.t('connection.edit');
  } else {
    formData.value = cloneDeep(defaultFormData);
    veeResetForm({ values: cloneDeep(defaultFormData) });
  }
};

const closeModal = () => {
  showModal.value = false;
  formData.value = cloneDeep(defaultFormData);
  veeResetForm({ values: cloneDeep(defaultFormData) });
  modalTitle.value = lang.t('connection.new');
  errorMessage.value = '';
  successMessage.value = '';
};

const isFormValid = computed(() => {
  return (
    formData.value.name &&
    formData.value.tableName &&
    formData.value.region &&
    formData.value.accessKeyId &&
    formData.value.secretAccessKey
  );
});

const testConnect = async () => {
  errorMessage.value = '';
  successMessage.value = '';

  const { valid } = await validate();
  if (!valid) {
    errorMessage.value = lang.t('connection.validationFailed');
    return;
  }

  testLoading.value = true;
  const startTime = Date.now();

  try {
    await freshConnection(formData.value);

    // Ensure minimum loading time before showing success
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    // Test successful - show success message
    successMessage.value = lang.t('connection.testSuccess');
  } catch (error: unknown) {
    // Ensure minimum loading time before showing error
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    // Handle both ApiClientError/CustomError (with status and details) and generic Error
    if (error instanceof CustomError) {
      errorMessage.value = `status: ${error.status}, details: ${error.details}`;
    } else if (error instanceof ApiClientError) {
      errorMessage.value = `status: ${error.status}, details: ${error.details}`;
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

  const { valid } = await validate();
  if (!valid) {
    errorMessage.value = lang.t('connection.validationFailed');
    return;
  }

  saveLoading.value = true;
  const result = await connectionStore.saveConnection(formData.value);
  if (result.success) {
    // Success - just close the modal without showing a message
    closeModal();
  } else {
    // Error - show in the popup and stay open
    errorMessage.value = result.message;
  }
  saveLoading.value = false;
};

defineExpose({ showMedal });
</script>
