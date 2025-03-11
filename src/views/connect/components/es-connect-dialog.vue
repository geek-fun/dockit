<template>
  <n-modal v-model:show="showModal" @after-leave="closeModal">
    <n-card
      style="width: 600px"
      role="dialog"
      :title="modalTitle"
      :bordered="false"
      class="add-connect-modal-card"
    >
      <template #header-extra>
        <n-icon size="26" @click="closeModal">
          <Close />
        </n-icon>
      </template>
      <div class="modal-content">
        <n-form
          ref="connectFormRef"
          label-placement="left"
          label-width="100"
          :model="formData"
          :rules="formRules"
        >
          <n-grid cols="8" item-responsive responsive="screen" x-gap="10" y-gap="10">
            <n-grid-item span="8">
              <n-form-item :label="$t('connection.name')" path="name">
                <n-input
                  v-model:value="formData.name"
                  clearable
                  :placeholder="$t('connection.name')"
                  :input-props="inputProps"
                />
              </n-form-item>
            </n-grid-item>
            <template v-if="formData.type === DatabaseType.ELASTICSEARCH">
              <n-grid-item span="5">
                <n-form-item
                  :label="$t('connection.host')"
                  path="host"
                  :validation-status="hostValidate.status"
                  :feedback="hostValidate.feedback"
                >
                  <n-input-group>
                    <n-input
                      :style="{ width: '80%' }"
                      clearable
                      v-model:value="formData.host"
                      placeholder="http://localhost"
                      :input-props="inputProps"
                    />
                    <n-popover trigger="hover" placement="top-start">
                      <template #trigger>
                        <n-input-group-label
                          style="cursor: pointer"
                          @click="switchSSL(!formData.sslCertVerification)"
                        >
                          <n-icon
                            :class="
                              formData.sslCertVerification
                                ? `ssl-checked-icon`
                                : `ssl-unchecked-icon`
                            "
                            size="24"
                            :component="formData.sslCertVerification ? Locked : Unlocked"
                          />
                        </n-input-group-label>
                      </template>
                      <span>{{ $t('connection.sslCertVerification') }}</span>
                    </n-popover>
                  </n-input-group>
                </n-form-item>
              </n-grid-item>
              <n-grid-item span="3">
                <n-form-item :label="$t('connection.port')" path="port">
                  <n-input-number
                    v-model:value="formData.port"
                    clearable
                    :show-button="false"
                    :placeholder="$t('connection.port')"
                  />
                </n-form-item>
              </n-grid-item>
              <n-grid-item span="8">
                <n-form-item :label="$t('connection.indexName')" path="indexName">
                  <n-input
                    v-model:value="formData.indexName"
                    clearable
                    :placeholder="$t('connection.indexName')"
                    :input-props="inputProps"
                  />
                </n-form-item>
              </n-grid-item>
              <n-grid-item span="8">
                <n-form-item :label="$t('connection.queryParameters')" path="queryParameters">
                  <n-input
                    v-model:value="formData.queryParameters"
                    clearable
                    :placeholder="$t('connection.queryParameters')"
                    :input-props="inputProps"
                  />
                </n-form-item>
              </n-grid-item>
              <n-grid-item span="8">
                <n-form-item :label="$t('connection.username')" path="username">
                  <n-input
                    v-model:value="formData.username"
                    clearable
                    :placeholder="$t('connection.username')"
                    :input-props="inputProps"
                  />
                </n-form-item>
              </n-grid-item>
              <n-grid-item span="8">
                <n-form-item :label="$t('connection.password')" path="password">
                  <n-input
                    v-model:value="formData.password"
                    type="password"
                    show-password-on="mousedown"
                    :placeholder="$t('connection.password')"
                    :input-props="inputProps"
                  />
                </n-form-item>
              </n-grid-item>
            </template>
          </n-grid>
        </n-form>
      </div>
      <template #footer>
        <div class="card-footer">
          <div class="left">
            <n-button
              type="info"
              :loading="testLoading"
              :disabled="!validationPassed"
              @click="testConnect"
            >
              {{ $t('connection.test') }}
            </n-button>
          </div>
          <div class="right">
            <n-button @click="closeModal">{{ $t('dialogOps.cancel') }}</n-button>
            <n-button
              type="primary"
              :loading="saveLoading"
              :disabled="!validationPassed"
              @click="saveConnect"
            >
              {{ $t('dialogOps.confirm') }}
            </n-button>
          </div>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { Close, Locked, Unlocked } from '@vicons/carbon';
import { cloneDeep } from 'lodash';
import { CustomError, inputProps } from '../../../common';
import {
  Connection,
  DatabaseType,
  ElasticsearchConnection,
  useConnectionStore,
} from '../../../store';
import { useLang } from '../../../lang';
import { FormItemRule, FormRules, FormValidationError } from 'naive-ui';

const { testElasticsearchConnection, testDynamoDBConnection, saveConnection } =
  useConnectionStore();
const lang = useLang();
// DOM
const connectFormRef = ref();

const showModal = ref(false);
const modalTitle = ref(lang.t('connection.new'));
const testLoading = ref(false);
const saveLoading = ref(false);

const defaultFormData = {
  name: '',
  host: '',
  port: 9200,
  username: '',
  password: '',
  indexName: undefined,
  queryParameters: '',
  sslCertVerification: true,
  type: DatabaseType.ELASTICSEARCH as const,
};
const formData = ref<Connection>(cloneDeep(defaultFormData));
const formRules = reactive<FormRules>({
  // @ts-ignore
  name: [
    {
      required: true,
      renderMessage: () => lang.t('connection.formValidation.nameRequired'),
      trigger: ['input', 'blur'],
    },
  ],
  host: [
    {
      required: true,
      validator: (_: FormItemRule, value: string) => {
        if (formData.value.type === DatabaseType.ELASTICSEARCH) {
          if (value.length >= 'http://'.length) {
            if (value.startsWith('http://') && formData.value.sslCertVerification) {
              formData.value.sslCertVerification = false;
            }
            switchSSL(formData.value.sslCertVerification);
          }

          return value !== '';
        }
      },
      renderMessage: () => lang.t('connection.formValidation.hostRequired'),
      trigger: ['input', 'blur'],
    },
  ],
  port: [
    {
      type: 'number',
      required: true,
      renderMessage: () => lang.t('connection.formValidation.portRequired'),
      trigger: ['input', 'blur'],
    },
  ],
});

const hostValidate = ref<{
  status: 'error' | undefined;
  feedback: string;
}>({ status: undefined, feedback: '' });

const switchSSL = (target: boolean) => {
  if (formData.value.type === DatabaseType.ELASTICSEARCH) {
    const elasticsearchConnection = formData.value as ElasticsearchConnection;
    if (elasticsearchConnection.host.startsWith('https') || !target) {
      elasticsearchConnection.sslCertVerification = target;
      hostValidate.value.status = undefined;
      hostValidate.value.feedback = '';
    } else {
      hostValidate.value.status = 'error';
      hostValidate.value.feedback = lang.t('connection.formValidation.sslCertOnlyHttps');
    }
  }
};

const message = useMessage();

const showMedal = (con: Connection | null) => {
  showModal.value = true;
  if (con) {
    formData.value = con;
    modalTitle.value = lang.t('connection.edit');
  }
};

const closeModal = () => {
  showModal.value = false;
  formData.value = cloneDeep(defaultFormData);
  modalTitle.value = lang.t('connection.new');
};

const validationPassed = watch(formData.value, async () => {
  try {
    return await connectFormRef.value?.validate((errors: Array<FormValidationError>) => !errors);
  } catch (e) {
    return false;
  }
});

const testConnect = (event: MouseEvent) => {
  event.preventDefault();
  connectFormRef.value?.validate((errors: boolean) =>
    !errors ? testConnectConfirm() : message.error(lang.t('connection.validationFailed')),
  );
};

const testConnectConfirm = async () => {
  testLoading.value = !testLoading.value;
  try {
    if (formData.value.type === DatabaseType.ELASTICSEARCH) {
      await testElasticsearchConnection(formData.value);
    } else if (formData.value.type === DatabaseType.DYNAMODB) {
      await testDynamoDBConnection(formData.value);
    }
    message.success(lang.t('connection.testSuccess'));
  } catch (e) {
    const error = e as CustomError;
    message.error(`status: ${error.status}, details: ${error.details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 10000,
    });
  } finally {
    testLoading.value = !testLoading.value;
  }
};
const saveConnect = (event: MouseEvent) => {
  event.preventDefault();
  connectFormRef.value?.validate((errors: boolean) =>
    !errors ? saveConnectConfirm() : message.error(lang.t('connection.validationFailed')),
  );
};

const saveConnectConfirm = async () => {
  saveLoading.value = !saveLoading.value;
  try {
    await saveConnection(formData.value);
    message.success(lang.t('connection.saveSuccess'));
  } catch (e) {
    const error = e as CustomError;
    message.error(`status: ${error.status}, details: ${error.details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 10000,
    });
  } finally {
    saveLoading.value = !saveLoading.value;
    showModal.value = false;
  }
};

defineExpose({ showMedal });
</script>
<style lang="scss">
.add-connect-modal-card {
  .n-card-header {
    .n-card-header__extra {
      cursor: pointer;
    }
  }

  .modal-content {
    .ssl-unchecked-icon {
      transition: 0.3s;
      margin-top: 4px;
      overflow: hidden;
      color: var(--dange-color);
    }

    .ssl-checked-icon {
      transition: 0.3s;
      margin-top: 4px;
      overflow: hidden;
      color: var(--theme-color);
    }
  }

  .n-card__footer {
    .card-footer {
      display: flex;
      justify-content: space-between;

      .n-button + .n-button {
        margin-left: 10px;
      }
    }
  }
}
</style>
