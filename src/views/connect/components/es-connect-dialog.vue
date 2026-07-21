<template>
  <Dialog :open="showModal" @update:open="handleOpenChange">
    <DialogContent class="sm:max-w-[600px]" :show-close="false">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <component :is="dialogIcon" class="h-5 w-5" />
          {{ modalTitle }}
        </DialogTitle>
        <button
          class="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
          aria-label="Close"
          @click="closeModal"
        >
          <X class="h-4 w-4" />
        </button>
      </DialogHeader>

      <div class="modal-content">
        <Alert v-if="isSuccess" variant="success" class="mb-4">
          <AlertDescription class="flex items-center justify-between">
            {{ message }}
            <button
              class="ml-2 hover:opacity-70 cursor-pointer"
              aria-label="Dismiss"
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
              aria-label="Dismiss"
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

            <template
              v-if="
                formData.type === DatabaseType.ELASTICSEARCH ||
                formData.type === DatabaseType.OPENSEARCH ||
                formData.type === DatabaseType.EASYSEARCH
              "
            >
              <GridItem :span="5">
                <FormItem
                  :label="$t('connection.host')"
                  required
                  :error="getError('host', errors.host) || hostValidate.feedback"
                >
                  <div class="flex">
                    <Input
                      v-model="formData.host"
                      class="flex-1 rounded-r-none"
                      placeholder="http://localhost"
                      @input="handleHostInput"
                      @blur="handleBlur('host')"
                    />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger as-child>
                          <button
                            type="button"
                            class="inline-flex items-center justify-center px-3 border border-l-0 border-input rounded-r-md bg-muted hover:bg-accent"
                            @click="switchSSL(!formData.sslCertVerification)"
                          >
                            <span
                              :class="[
                                formData.sslCertVerification
                                  ? 'i-carbon-locked ssl-checked-icon'
                                  : 'i-carbon-unlocked ssl-unchecked-icon',
                                'h-6 w-6',
                              ]"
                            />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <span>{{ $t('connection.sslCertVerification') }}</span>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
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
                    :placeholder="$t('connection.port')"
                    @blur="handleBlur('port')"
                  />
                </FormItem>
              </GridItem>

              <GridItem :span="8">
                <FormItem :label="$t('connection.indexName')">
                  <Input
                    v-model="formData.selectedIndex"
                    :placeholder="$t('connection.indexName')"
                  />
                </FormItem>
              </GridItem>

              <GridItem :span="8">
                <FormItem :label="$t('connection.queryParameters')">
                  <Input
                    v-model="formData.queryParameters"
                    :placeholder="$t('connection.queryParameters')"
                  />
                </FormItem>
              </GridItem>

              <GridItem :span="8">
                <FormItem :label="$t('connection.authenticationType')">
                  <Tabs
                    :model-value="authType"
                    @update:model-value="value => onAuthTypeChange(value as string)"
                  >
                    <TabsList class="w-full">
                      <TabsTrigger class="flex-1" value="basic">
                        {{ $t('connection.authTypeBasic') }}
                      </TabsTrigger>
                      <TabsTrigger class="flex-1" value="apiKey">
                        {{ $t('connection.authTypeApiKey') }}
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </FormItem>
              </GridItem>

              <GridItem :span="8">
                <div class="auth-fields-container">
                  <template v-if="authType === 'basic'">
                    <FormItem :label="$t('connection.username')">
                      <Input v-model="formData.username" :placeholder="$t('connection.username')" />
                    </FormItem>
                    <FormItem :label="$t('connection.password')" class="mt-[10px]">
                      <Input
                        v-model="formData.password"
                        :type="showPassword ? 'text' : 'password'"
                        :placeholder="$t('connection.password')"
                      />
                    </FormItem>
                  </template>

                  <template v-else>
                    <FormItem
                      :label="$t('connection.apiKey')"
                      :error="getError('apiKey', errors.apiKey)"
                    >
                      <div class="relative">
                        <Input
                          v-model="formData.apiKey"
                          :type="showApiKey ? 'text' : 'password'"
                          :placeholder="$t('connection.apiKeyPlaceholder')"
                          class="pr-9"
                          @blur="handleBlur('apiKey')"
                        />
                        <button
                          type="button"
                          class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          @click="showApiKey = !showApiKey"
                        >
                          <EyeOff v-if="showApiKey" class="h-4 w-4" />
                          <Eye v-else class="h-4 w-4" />
                        </button>
                      </div>
                    </FormItem>
                    <div class="auth-fields-placeholder" />
                  </template>
                </div>
              </GridItem>
            </template>
          </Grid>

          <!-- Advanced Section -->
          <div class="advanced-section">
            <button type="button" class="advanced-toggle" @click="showAdvanced = !showAdvanced">
              <ChevronRight
                class="h-4 w-4 transition-transform duration-200"
                :class="{ 'rotate-90': showAdvanced }"
              />
              <span class="text-sm font-medium">{{ $t('connection.advanced') }}</span>
            </button>
            <div v-show="showAdvanced" class="advanced-content">
              <SshTunnelSection
                v-if="formData.type !== DatabaseType.EASYSEARCH"
                v-model="sshConfig"
                :remote-host="formData.host"
                :remote-port="formData.port"
                @create-profile="openSshProfileDialog(null)"
                @edit-profile="openSshProfileDialog($event)"
              />
            </div>
          </div>
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
  <SshProfileDialog ref="sshProfileDialogRef" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { X, Loader2, ChevronRight, Eye, EyeOff } from 'lucide-vue-next';
import { cloneDeep } from 'lodash';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { CustomError, MIN_LOADING_TIME } from '../../../common';
import elasticsearchIcon from '../../../assets/svg/elasticsearch.svg';
import opensearchIcon from '../../../assets/svg/db-opensearch.svg';
import easysearchIcon from '../../../assets/svg/easysearch.svg';
import { Connection, DatabaseType, SearchConnection, useConnectionStore } from '../../../store';
import type { SshConnectionConfig } from '../../../store';
import { useSshProfileStore } from '../../../store';
import { useLang } from '../../../lang';
import { useFormValidation, useDialogResult } from '@/composables';
import { SshTunnelSection } from '@/components/ssh';
import SshProfileDialog from './ssh-profile-dialog.vue';

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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const { freshConnection, saveConnection } = useConnectionStore();
const lang = useLang();

const showModal = ref(false);
const modalTitle = ref(lang.t('connection.new'));
const testLoading = ref(false);
const saveLoading = ref(false);
const { message, isSuccess, isError, succeed, fail, reset: resetResult } = useDialogResult();
const showPassword = ref(false);
const showApiKey = ref(false);
const authType = ref<'basic' | 'apiKey'>('basic');
const { handleBlur, getError, markSubmitted, resetValidation } = useFormValidation();
const sshConfig = ref<SshConnectionConfig>({ enabled: false });
const sshProfileDialogRef = ref<InstanceType<typeof SshProfileDialog> | null>(null);
const showAdvanced = ref(false);

function openSshProfileDialog(profileId: string | null) {
  if (sshProfileDialogRef.value) {
    const profile = profileId
      ? (useSshProfileStore().profiles.find(p => p.id === profileId) ?? null)
      : null;
    sshProfileDialogRef.value.show(profile);
  }
}

const defaultFormData = {
  name: '',
  host: '',
  port: 9200,
  username: '',
  password: '',
  apiKey: '',
  authType: 'basic' as 'basic' | 'apiKey',
  selectedIndex: '',
  queryParameters: '',
  sslCertVerification: true,
  type: DatabaseType.ELASTICSEARCH,
} as SearchConnection & { selectedIndex: string };

const formData = ref<SearchConnection & { selectedIndex: string }>(cloneDeep(defaultFormData));

const dialogIcon = computed(() => {
  if (formData.value.type === DatabaseType.OPENSEARCH) return opensearchIcon;
  if (formData.value.type === DatabaseType.EASYSEARCH) return easysearchIcon;
  return elasticsearchIcon;
});

const hostValidate = ref<{
  status: 'error' | undefined;
  feedback: string;
}>({ status: undefined, feedback: '' });

// Zod validation schema
const formSchema = toTypedSchema(
  z
    .object({
      name: z.string().min(1, lang.t('connection.formValidation.nameRequired')),
      host: z.string().min(1, lang.t('connection.formValidation.hostRequired')),
      port: z.number({ required_error: lang.t('connection.formValidation.portRequired') }).min(1),
      authType: z.enum(['basic', 'apiKey']).default('basic'),
      username: z.string().optional(),
      password: z.string().optional(),
      apiKey: z.string().optional(),
      selectedIndex: z.string().optional(),
      queryParameters: z.string().optional(),
      sslCertVerification: z.boolean().optional(),
      type: z.nativeEnum(DatabaseType),
    })
    .superRefine((data, ctx) => {
      if (data.authType === 'apiKey' && !data.apiKey?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['apiKey'],
          message: lang.t('connection.formValidation.apiKeyRequired'),
        });
      }
    }),
);

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

const isFormValid = computed(() => {
  const hasName = formData.value.name && formData.value.name.trim() !== '';
  const hasHost = formData.value.host && formData.value.host.trim() !== '';
  const hasPort = formData.value.port !== null && formData.value.port !== undefined;

  if (
    formData.value.type === DatabaseType.ELASTICSEARCH ||
    formData.value.type === DatabaseType.OPENSEARCH ||
    formData.value.type === DatabaseType.EASYSEARCH
  ) {
    return hasName && hasHost && hasPort;
  }
  return hasName;
});

const handleHostInput = () => {
  if (
    formData.value.type === DatabaseType.ELASTICSEARCH ||
    formData.value.type === DatabaseType.OPENSEARCH ||
    formData.value.type === DatabaseType.EASYSEARCH
  ) {
    const value = formData.value.host;
    if (value.length >= 'http://'.length) {
      if (value.startsWith('http://') && formData.value.sslCertVerification) {
        formData.value.sslCertVerification = false;
      }
      switchSSL(formData.value.sslCertVerification as boolean);
    }
  }
};

const switchSSL = (target: boolean) => {
  if (
    formData.value.type === DatabaseType.ELASTICSEARCH ||
    formData.value.type === DatabaseType.OPENSEARCH ||
    formData.value.type === DatabaseType.EASYSEARCH
  ) {
    if (formData.value.host.startsWith('https') || !target) {
      formData.value.sslCertVerification = target;
      hostValidate.value.status = undefined;
      hostValidate.value.feedback = '';
    } else {
      hostValidate.value.status = 'error';
      hostValidate.value.feedback = lang.t('connection.formValidation.sslCertOnlyHttps');
    }
  }
};

const onAuthTypeChange = (value: string) => {
  authType.value = value as 'basic' | 'apiKey';
  formData.value.authType = authType.value;
  if (value === 'apiKey') {
    formData.value.username = '';
    formData.value.password = '';
  } else {
    formData.value.apiKey = '';
  }
  resetValidation();
};

const handleOpenChange = (open: boolean) => {
  if (!open) {
    closeModal();
  }
};

const showMedal = (
  con: SearchConnection | null,
  initialType?: DatabaseType.ELASTICSEARCH | DatabaseType.OPENSEARCH | DatabaseType.EASYSEARCH,
) => {
  showModal.value = true;
  resetResult();
  hostValidate.value = { status: undefined, feedback: '' };
  if (con) {
    const selectedIndex = con.activeIndex?.index || '';
    const resolvedAuthType = (con.authType as 'basic' | 'apiKey' | undefined) || 'basic';
    formData.value = { ...cloneDeep(con), selectedIndex, authType: resolvedAuthType };
    authType.value = resolvedAuthType;
    sshConfig.value = con.sshTunnel ? { ...con.sshTunnel } : { enabled: false };
    veeResetForm({ values: { ...cloneDeep(con), selectedIndex, authType: resolvedAuthType } });
    modalTitle.value = lang.t('connection.edit');
  } else {
    const type = initialType ?? DatabaseType.ELASTICSEARCH;
    const typeDefaults =
      type === DatabaseType.EASYSEARCH
        ? { host: 'https://localhost', username: 'admin', sslCertVerification: false }
        : {};
    const initialFormData = { ...cloneDeep(defaultFormData), type, ...typeDefaults };
    formData.value = initialFormData;
    authType.value = 'basic';
    sshConfig.value = { enabled: false };
    veeResetForm({ values: initialFormData });
  }
  resetValidation();
};

const closeModal = () => {
  showModal.value = false;
  formData.value = cloneDeep(defaultFormData);
  veeResetForm({ values: cloneDeep(defaultFormData) });
  modalTitle.value = lang.t('connection.new');
  resetResult();
  hostValidate.value = { status: undefined, feedback: '' };
  authType.value = 'basic';
  sshConfig.value = { enabled: false };
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
    await freshConnection({
      ...formData.value,
      activeIndex: formData.value.selectedIndex
        ? { index: formData.value.selectedIndex }
        : undefined,
      sshTunnel: { ...sshConfig.value },
    } as Connection);

    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    succeed(lang.t('connection.testSuccess'));
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
    await saveConnection({
      ...formData.value,
      activeIndex: formData.value.selectedIndex
        ? { index: formData.value.selectedIndex }
        : undefined,
      sshTunnel: { ...sshConfig.value },
    } as Connection);
    closeModal();
  } catch (e) {
    const error = e as CustomError;
    fail(error.details || `Connection failed (status: ${error.status})`);
  } finally {
    saveLoading.value = false;
  }
};

defineExpose({ showMedal });
</script>

<style scoped>
.modal-content .auth-fields-placeholder {
  height: 70px;
}

.modal-content .ssl-unchecked-icon {
  transition: 0.3s;
  overflow: hidden;
  color: hsl(var(--destructive));
}

.modal-content .ssl-checked-icon {
  transition: 0.3s;
  overflow: hidden;
  color: hsl(var(--primary));
}

.advanced-section {
  margin-top: 16px;
  border-top: 1px solid hsl(var(--border));
  padding-top: 12px;
}

.advanced-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 0;
  color: hsl(var(--muted-foreground));
  transition: color 0.15s ease;
}

.advanced-toggle:hover {
  color: hsl(var(--foreground));
}

.advanced-content {
  padding-top: 12px;
}
</style>
