<template>
  <Dialog :open="showModal" @update:open="handleOpenChange">
    <DialogContent class="sm:max-w-[600px]" :show-close="false">
      <DialogHeader>
        <DialogTitle>{{ modalTitle }}</DialogTitle>
        <button
          class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          @click="closeModal"
        >
          <Icon :size="20" :component="X" />
        </button>
      </DialogHeader>

      <div class="modal-content">
        <Alert v-if="errorMessage" variant="destructive" class="mb-4">
          <AlertDescription class="flex items-center justify-between">
            {{ errorMessage }}
            <button class="ml-2 hover:opacity-70" @click="errorMessage = ''">×</button>
          </AlertDescription>
        </Alert>

        <Form>
          <Grid :cols="8" :x-gap="10" :y-gap="10">
            <GridItem :span="8">
              <FormItem :label="$t('connection.name')" required>
                <Input
                  v-model="formData.name"
                  :placeholder="$t('connection.name')"
                />
                <p v-if="validationErrors.name" class="text-sm text-destructive mt-1">
                  {{ validationErrors.name }}
                </p>
              </FormItem>
            </GridItem>

            <template v-if="formData.type === DatabaseType.ELASTICSEARCH">
              <GridItem :span="5">
                <FormItem :label="$t('connection.host')" required>
                  <div class="flex">
                    <Input
                      v-model="formData.host"
                      class="flex-1 rounded-r-none"
                      placeholder="http://localhost"
                      @input="handleHostInput"
                    />
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <button
                          type="button"
                          class="inline-flex items-center justify-center px-3 border border-l-0 border-input rounded-r-md bg-muted hover:bg-accent"
                          @click="switchSSL(!formData.sslCertVerification)"
                        >
                          <Icon
                            :class="
                              formData.sslCertVerification
                                ? 'ssl-checked-icon'
                                : 'ssl-unchecked-icon'
                            "
                            :size="24"
                            :component="formData.sslCertVerification ? Locked : Unlocked"
                          />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <span>{{ $t('connection.sslCertVerification') }}</span>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p v-if="validationErrors.host || hostValidate.feedback" class="text-sm text-destructive mt-1">
                    {{ validationErrors.host || hostValidate.feedback }}
                  </p>
                </FormItem>
              </GridItem>

              <GridItem :span="3">
                <FormItem :label="$t('connection.port')" required>
                  <InputNumber
                    v-model="formData.port"
                    :show-button="false"
                    :placeholder="$t('connection.port')"
                  />
                  <p v-if="validationErrors.port" class="text-sm text-destructive mt-1">
                    {{ validationErrors.port }}
                  </p>
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
                <FormItem :label="$t('connection.username')">
                  <Input
                    v-model="formData.username"
                    :placeholder="$t('connection.username')"
                  />
                </FormItem>
              </GridItem>

              <GridItem :span="8">
                <FormItem :label="$t('connection.password')">
                  <Input
                    v-model="formData.password"
                    :type="showPassword ? 'text' : 'password'"
                    :placeholder="$t('connection.password')"
                  />
                </FormItem>
              </GridItem>
            </template>
          </Grid>
        </Form>
      </div>

      <DialogFooter class="flex justify-between sm:justify-between">
        <div class="left">
          <Button
            variant="secondary"
            :disabled="!validationPassed || testLoading"
            @click="testConnect"
          >
            <span v-if="testLoading" class="mr-2 h-4 w-4 animate-spin">⟳</span>
            {{ $t('connection.test') }}
          </Button>
        </div>
        <div class="right flex gap-2">
          <Button variant="outline" @click="closeModal">
            {{ $t('dialogOps.cancel') }}
          </Button>
          <Button
            :disabled="!validationPassed || saveLoading"
            @click="saveConnect"
          >
            <span v-if="saveLoading" class="mr-2 h-4 w-4 animate-spin">⟳</span>
            {{ $t('dialogOps.confirm') }}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { X } from 'lucide-vue-next';
import { Locked, Unlocked } from '@vicons/carbon';
import { cloneDeep } from 'lodash';
import { CustomError, MIN_LOADING_TIME } from '../../../common';
import {
  Connection,
  DatabaseType,
  ElasticsearchConnection,
  useConnectionStore,
} from '../../../store';
import { useLang } from '../../../lang';

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
import { Icon } from '@/components/ui/icon';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Grid, GridItem } from '@/components/ui/grid';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const { freshConnection, saveConnection } = useConnectionStore();
const lang = useLang();

const showModal = ref(false);
const modalTitle = ref(lang.t('connection.new'));
const testLoading = ref(false);
const saveLoading = ref(false);
const errorMessage = ref('');
const showPassword = ref(false);

const defaultFormData = {
  name: '',
  host: '',
  port: 9200,
  username: '',
  password: '',
  selectedIndex: '',
  queryParameters: '',
  sslCertVerification: true,
  type: DatabaseType.ELASTICSEARCH,
} as ElasticsearchConnection & { selectedIndex: string };

const formData = ref<ElasticsearchConnection & { selectedIndex: string }>(
  cloneDeep(defaultFormData),
);

const validationErrors = ref<{
  name?: string;
  host?: string;
  port?: string;
}>({});

const hostValidate = ref<{
  status: 'error' | undefined;
  feedback: string;
}>({ status: undefined, feedback: '' });

const validateForm = (): boolean => {
  validationErrors.value = {};
  let isValid = true;

  if (!formData.value.name || formData.value.name.trim() === '') {
    validationErrors.value.name = lang.t('connection.formValidation.nameRequired');
    isValid = false;
  }

  if (formData.value.type === DatabaseType.ELASTICSEARCH) {
    if (!formData.value.host || formData.value.host.trim() === '') {
      validationErrors.value.host = lang.t('connection.formValidation.hostRequired');
      isValid = false;
    }

    if (formData.value.port === null || formData.value.port === undefined) {
      validationErrors.value.port = lang.t('connection.formValidation.portRequired');
      isValid = false;
    }
  }

  return isValid;
};

const validationPassed = computed(() => {
  const hasName = formData.value.name && formData.value.name.trim() !== '';
  const hasHost = formData.value.host && formData.value.host.trim() !== '';
  const hasPort = formData.value.port !== null && formData.value.port !== undefined;

  if (formData.value.type === DatabaseType.ELASTICSEARCH) {
    return hasName && hasHost && hasPort;
  }
  return hasName;
});

const handleHostInput = () => {
  if (formData.value.type === DatabaseType.ELASTICSEARCH) {
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
  if (formData.value.type === DatabaseType.ELASTICSEARCH) {
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

const handleOpenChange = (open: boolean) => {
  if (!open) {
    closeModal();
  }
};

const showMedal = (con: ElasticsearchConnection | null) => {
  showModal.value = true;
  errorMessage.value = '';
  validationErrors.value = {};
  if (con) {
    const selectedIndex = con.activeIndex?.index || '';
    formData.value = { ...cloneDeep(con), selectedIndex };
    modalTitle.value = lang.t('connection.edit');
  }
};

const closeModal = () => {
  showModal.value = false;
  formData.value = cloneDeep(defaultFormData);
  modalTitle.value = lang.t('connection.new');
  errorMessage.value = '';
  validationErrors.value = {};
};

const testConnect = (event: MouseEvent) => {
  event.preventDefault();
  errorMessage.value = '';
  if (validateForm()) {
    testConnectConfirm();
  } else {
    errorMessage.value = lang.t('connection.validationFailed');
  }
};

const testConnectConfirm = async () => {
  testLoading.value = true;
  errorMessage.value = '';
  const startTime = Date.now();

  try {
    await freshConnection({
      ...formData.value,
      activeIndex: formData.value.selectedIndex
        ? { index: formData.value.selectedIndex }
        : undefined,
    } as Connection);

    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }
  } catch (e) {
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    const error = e as CustomError;
    errorMessage.value = `status: ${error.status}, details: ${error.details}`;
  } finally {
    testLoading.value = false;
  }
};

const saveConnect = (event: MouseEvent) => {
  event.preventDefault();
  errorMessage.value = '';
  if (validateForm()) {
    saveConnectConfirm();
  } else {
    errorMessage.value = lang.t('connection.validationFailed');
  }
};

const saveConnectConfirm = async () => {
  saveLoading.value = true;
  try {
    await saveConnection({
      ...formData.value,
      activeIndex: formData.value.selectedIndex
        ? { index: formData.value.selectedIndex }
        : undefined,
    } as Connection);
    closeModal();
  } catch (e) {
    const error = e as CustomError;
    errorMessage.value = `status: ${error.status}, details: ${error.details}`;
  } finally {
    saveLoading.value = false;
  }
};

defineExpose({ showMedal });
</script>

<style scoped>
.modal-content .ssl-unchecked-icon {
  transition: 0.3s;
  overflow: hidden;
  color: var(--dange-color);
}

.modal-content .ssl-checked-icon {
  transition: 0.3s;
  overflow: hidden;
  color: var(--theme-color);
}
</style>
