<template>
  <Dialog :open="showModal" @update:open="handleOpenChange">
    <DialogContent class="sm:max-w-[600px]" :show-close="false">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <component :is="mongodbIcon" class="h-5 w-5" />
          {{ modalTitle }}
        </DialogTitle>
        <button
          class="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
          :aria-label="$t('dialogOps.close')"
          @click="closeModal"
        >
          <X class="h-4 w-4" />
        </button>
      </DialogHeader>

      <div class="modal-content min-h-[320px]">
        <Alert v-if="isSuccess" variant="success" class="mb-4">
          <AlertDescription class="flex items-center justify-between">
            {{ message }}
            <button
              class="ml-2 hover:opacity-70 cursor-pointer"
              :aria-label="$t('dialogOps.dismiss')"
              @click="resetResult()"
            >
              <X class="w-4 h-4" />
            </button>
          </AlertDescription>
        </Alert>
        <Alert v-if="isError" variant="destructive" class="mb-4">
          <AlertDescription class="flex items-center justify-between">
            {{ message }}
            <button
              class="ml-2 hover:opacity-70 cursor-pointer"
              :aria-label="$t('dialogOps.dismiss')"
              @click="resetResult()"
            >
              <X class="w-4 h-4" />
            </button>
          </AlertDescription>
        </Alert>

        <Form @submit.prevent="saveConnect">
          <Grid :cols="8" :x-gap="10" :y-gap="10">
            <GridItem :span="8">
              <FormItem
                :label="$t('connection.name')"
                required
                :error="getError('name', errors.name)"
              >
                <Input
                  v-model="formData.name"
                  :placeholder="$t('connection.name')"
                  @blur="handleBlur('name')"
                />
              </FormItem>
            </GridItem>

            <GridItem :span="8">
              <FormItem :label="$t('connection.connectionMethod')">
                <Tabs
                  :model-value="authMode"
                  @update:model-value="value => onAuthModeChange(value as string)"
                >
                  <TabsList class="w-full">
                    <TabsTrigger class="flex-1" value="none">
                      {{ $t('connection.mongodb.authNone') }}
                    </TabsTrigger>
                    <TabsTrigger class="flex-1" value="uri">
                      {{ $t('connection.mongodb.authUri') }}
                    </TabsTrigger>
                    <TabsTrigger class="flex-1" value="scram">
                      {{ $t('connection.mongodb.authScram') }}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </FormItem>
            </GridItem>

            <template v-if="authMode === 'uri'">
              <GridItem :span="8">
                <FormItem
                  :label="$t('connection.mongodb.uri')"
                  required
                  :error="getError('uri', errors.uri)"
                >
                  <Input
                    v-model="uriValue"
                    :placeholder="$t('connection.mongodb.uriPlaceholder')"
                    @blur="handleBlur('uri')"
                  />
                </FormItem>
              </GridItem>
            </template>

            <template v-else>
              <GridItem :span="5">
                <FormItem
                  :label="$t('connection.host')"
                  required
                  :error="getError('host', errors.host)"
                >
                  <Input
                    v-model="formData.host"
                    placeholder="localhost"
                    @blur="handleBlur('host')"
                  />
                </FormItem>
              </GridItem>

              <GridItem :span="3">
                <FormItem
                  :label="$t('connection.port')"
                  required
                  :error="getError('port', errors.port)"
                >
                  <InputNumber
                    v-model="formData.port"
                    :show-button="false"
                    placeholder="27017"
                    @blur="handleBlur('port')"
                  />
                </FormItem>
              </GridItem>

              <template v-if="authMode === 'scram'">
                <GridItem :span="8">
                  <FormItem
                    :label="$t('connection.username')"
                    required
                    :error="getError('username', errors.username)"
                  >
                    <Input
                      v-model="usernameValue"
                      :placeholder="$t('connection.username')"
                      @blur="handleBlur('username')"
                    />
                  </FormItem>
                </GridItem>

                <GridItem :span="8">
                  <FormItem
                    :label="$t('connection.password')"
                    required
                    :error="getError('password', errors.password)"
                  >
                    <Input
                      v-model="passwordValue"
                      type="password"
                      :placeholder="$t('connection.password')"
                      @blur="handleBlur('password')"
                    />
                  </FormItem>
                </GridItem>

                <GridItem :span="8">
                  <FormItem :label="$t('connection.mongodb.authSource')">
                    <Input
                      v-model="authSourceValue"
                      :placeholder="$t('connection.mongodb.authSourcePlaceholder')"
                    />
                  </FormItem>
                </GridItem>

                <GridItem :span="8">
                  <FormItem :label="$t('connection.mongodb.authMechanism')">
                    <Select v-model="authMechanismValue">
                      <SelectTrigger>
                        <SelectValue :placeholder="$t('connection.mongodb.authMechanism')" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SCRAM-SHA-256">SCRAM-SHA-256</SelectItem>
                        <SelectItem value="SCRAM-SHA-1">SCRAM-SHA-1</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                </GridItem>
              </template>
            </template>

            <template v-if="authMode !== 'uri'">
              <GridItem :span="8">
                <FormItem :label="$t('connection.mongodb.database')">
                  <Input
                    v-model="formData.database"
                    :placeholder="$t('connection.mongodb.databasePlaceholder')"
                  />
                </FormItem>
              </GridItem>

              <GridItem :span="8">
                <FormItem :label="$t('connection.mongodb.tls')">
                  <Switch v-model:checked="tlsChecked" />
                </FormItem>
              </GridItem>
            </template>
          </Grid>
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
import { cloneDeep } from 'lodash';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { CustomError, MIN_LOADING_TIME } from '../../../common';
import mongodbIcon from '../../../assets/svg/mongodb.svg';
import { DatabaseType, MongoDBConnection, useConnectionStore } from '../../../store';
import { useLang } from '../../../lang';
import { useFormValidation, useDialogResult } from '@/composables';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Form, FormItem } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { InputNumber } from '@/components/ui/input-number';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Grid, GridItem } from '@/components/ui/grid';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const { freshConnection, saveConnection } = useConnectionStore();
const lang = useLang();

const showModal = ref(false);
const modalTitle = ref(lang.t('connection.new'));
const testLoading = ref(false);
const saveLoading = ref(false);
const { isSuccess, isError, succeed, fail, reset: resetResult } = useDialogResult();
const authMode = ref<'none' | 'scram' | 'uri'>('none');
const { handleBlur, getError, markSubmitted, resetValidation } = useFormValidation();

const defaultFormData = {
  name: '',
  host: 'localhost',
  port: 27017,
  auth: { kind: 'none' as const },
  database: '',
  tls: false,
  type: DatabaseType.MONGODB,
} as MongoDBConnection;

const formData = ref<MongoDBConnection>(cloneDeep(defaultFormData));
const uriValue = ref('');
const usernameValue = ref('');
const passwordValue = ref('');
const authSourceValue = ref('');
const authMechanismValue = ref('');
const tlsChecked = ref(false);

const formSchema = toTypedSchema(
  z
    .object({
      name: z.string().min(1, lang.t('connection.formValidation.nameRequired')),
      host: z.string().optional(),
      port: z.number().optional(),
      authMode: z.enum(['none', 'scram', 'uri']),
      uri: z.string().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
      authSource: z.string().optional(),
      database: z.string().optional(),
      tls: z.boolean().optional(),
      type: z.nativeEnum(DatabaseType),
    })
    .superRefine((data, ctx) => {
      if (data.authMode === 'uri') {
        if (!data.uri?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uri'],
            message: lang.t('connection.formValidation.uriRequired'),
          });
        } else if (!data.uri.startsWith('mongodb://') && !data.uri.startsWith('mongodb+srv://')) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uri'],
            message: lang.t('connection.formValidation.invalidUri'),
          });
        }
      }
      if (data.authMode === 'scram') {
        if (!data.username?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['username'],
            message: lang.t('connection.formValidation.usernameRequired'),
          });
        }
        if (!data.password?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['password'],
            message: lang.t('connection.formValidation.passwordRequired'),
          });
        }
      }
      if (data.authMode !== 'uri') {
        if (!data.host?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['host'],
            message: lang.t('connection.formValidation.hostRequired'),
          });
        }
        if (data.port == null || data.port < 1 || data.port > 65535) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['port'],
            message: lang.t('connection.formValidation.portRequired'),
          });
        }
      }
    }),
);

const {
  errors,
  validate,
  resetForm: _veeResetForm,
  setValues,
} = useForm({
  validationSchema: formSchema,
  initialValues: {
    ...cloneDeep(defaultFormData),
    authMode: 'none' as const,
    uri: '',
    username: '',
    password: '',
    authSource: '',
  },
});

watch(
  formData,
  () => {
    setValues({
      ...formData.value,
      authMode: authMode.value,
      uri: uriValue.value,
      username: usernameValue.value,
      password: passwordValue.value,
      authSource: authSourceValue.value,
      tls: tlsChecked.value,
    });
  },
  { deep: true },
);

// Sync separate input refs with vee-validate to clear validation errors on input
watch([usernameValue, passwordValue, uriValue, authSourceValue], () => {
  setValues({
    ...formData.value,
    authMode: authMode.value,
    uri: uriValue.value,
    username: usernameValue.value,
    password: passwordValue.value,
    authSource: authSourceValue.value,
    tls: tlsChecked.value,
  });
});

const isFormValid = computed(() => {
  const hasName = formData.value.name && formData.value.name.trim() !== '';

  if (authMode.value === 'uri') {
    return hasName && uriValue.value.trim() !== '';
  }

  const hasHost = formData.value.host && formData.value.host.trim() !== '';
  if (authMode.value === 'scram') {
    return (
      hasName && hasHost && usernameValue.value.trim() !== '' && passwordValue.value.trim() !== ''
    );
  }

  return hasName && hasHost;
});

const onAuthModeChange = (value: string) => {
  authMode.value = value as 'none' | 'scram' | 'uri';
  if (value === 'uri') {
    formData.value.host = '';
    formData.value.port = 27017;
    formData.value.database = '';
    tlsChecked.value = false;
    usernameValue.value = '';
    passwordValue.value = '';
    authSourceValue.value = '';
    authMechanismValue.value = '';
  } else if (value === 'scram') {
    uriValue.value = '';
  } else {
    uriValue.value = '';
    usernameValue.value = '';
    passwordValue.value = '';
    authSourceValue.value = '';
    authMechanismValue.value = '';
  }
  resetValidation();
};

const handleOpenChange = (open: boolean) => {
  if (!open) {
    closeModal();
  }
};

const buildConnection = (): MongoDBConnection => {
  const base = {
    ...formData.value,
    tls: tlsChecked.value,
    database: formData.value.database || undefined,
  };

  if (authMode.value === 'uri') {
    return {
      ...base,
      host: '',
      port: 0,
      database: undefined,
      tls: undefined,
      auth: { kind: 'uri', uri: uriValue.value },
    };
  }

  if (authMode.value === 'scram') {
    return {
      ...base,
      auth: {
        kind: 'scram',
        username: usernameValue.value,
        password: passwordValue.value,
        authSource: authSourceValue.value || undefined,
        authMechanism: authMechanismValue.value || undefined,
      },
    };
  }

  return {
    ...base,
    auth: { kind: 'none' },
  };
};

const showMedal = (con: MongoDBConnection | null) => {
  showModal.value = true;
  resetResult();

  if (con) {
    formData.value = cloneDeep(con);
    tlsChecked.value = con.tls ?? false;

    if (con.auth.kind === 'uri') {
      authMode.value = 'uri';
      uriValue.value = con.auth.uri;
      formData.value.database = '';
      tlsChecked.value = false;
    } else if (con.auth.kind === 'scram') {
      authMode.value = 'scram';
      usernameValue.value = con.auth.username;
      passwordValue.value = con.auth.password;
      authSourceValue.value = con.auth.authSource ?? '';
      authMechanismValue.value = con.auth.authMechanism ?? '';
    } else {
      authMode.value = 'none';
    }

    modalTitle.value = lang.t('connection.edit');
  } else {
    formData.value = cloneDeep(defaultFormData);
    authMode.value = 'none';
    uriValue.value = '';
    usernameValue.value = '';
    passwordValue.value = '';
    authSourceValue.value = '';
    tlsChecked.value = false;
    modalTitle.value = lang.t('connection.new');
  }
  resetValidation();
};

const closeModal = () => {
  showModal.value = false;
  formData.value = cloneDeep(defaultFormData);
  authMode.value = 'none';
  uriValue.value = '';
  usernameValue.value = '';
  passwordValue.value = '';
  authSourceValue.value = '';
  authMechanismValue.value = '';
  tlsChecked.value = false;
  modalTitle.value = lang.t('connection.new');
  resetResult();
  resetValidation();
};

const testConnect = async (event: MouseEvent) => {
  event.preventDefault();
  resetResult();
  markSubmitted();

  const { valid } = await validate();
  if (!valid) {
    fail(lang.t('connection.validationFailed'));
    return;
  }

  testConnectConfirm();
};

const testConnectConfirm = async () => {
  testLoading.value = true;
  resetResult();
  const startTime = Date.now();

  try {
    await freshConnection(buildConnection());

    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    succeed(lang.t('connection.mongodb.connectSuccess'));
  } catch (e) {
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    const error = e as CustomError;
    fail(error.details || `Connection failed (status: ${error.status})`);
  } finally {
    testLoading.value = false;
  }
};

const saveConnect = async (event: MouseEvent) => {
  event.preventDefault();
  resetResult();
  markSubmitted();

  const { valid } = await validate();
  if (!valid) {
    fail(lang.t('connection.validationFailed'));
    return;
  }

  saveConnectConfirm();
};

const saveConnectConfirm = async () => {
  saveLoading.value = true;
  try {
    const result = await saveConnection(buildConnection());
    if (result.success) {
      closeModal();
    } else {
      fail(result.message);
    }
  } catch (e) {
    const error = e as CustomError;
    fail(error.details || `Connection failed (status: ${error.status})`);
  } finally {
    saveLoading.value = false;
  }
};

defineExpose({ showMedal });
</script>
