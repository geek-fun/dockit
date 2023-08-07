<template>
  <n-modal v-model:show="showModal">
    <n-card
      style="width: 600px"
      role="dialog"
      aria-modal="true"
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
                />
              </n-form-item>
            </n-grid-item>
            <n-grid-item span="5">
              <n-form-item :label="$t('connection.host')" path="host">
                <n-input
                  v-model:value="formData.host"
                  clearable
                  :placeholder="$t('connection.host')"
                />
              </n-form-item>
            </n-grid-item>
            <n-grid-item span="3">
              <n-form-item :label="$t('connection.port')" path="port">
                <n-input
                  v-model:value="formData.port"
                  clearable
                  :placeholder="$t('connection.port')"
                />
              </n-form-item>
            </n-grid-item>
            <n-grid-item span="8">
              <n-form-item :label="$t('connection.username')" path="username">
                <n-input
                  v-model:value="formData.username"
                  clearable
                  :placeholder="$t('connection.username')"
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
                />
              </n-form-item>
            </n-grid-item>
            <n-grid-item span="8">
              <n-form-item :label="$t('connection.queryParameters')" path="queryParameters">
                <n-input
                  v-model:value="formData.queryParameters"
                  clearable
                  :placeholder="$t('connection.queryParameters')"
                />
              </n-form-item>
            </n-grid-item>
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
import { Close } from '@vicons/carbon';
import { CustomError } from '../../../common/customError';
import { Connection, useConnectionStore } from '../../../store/connectionStore';
import { useLang } from '../../../lang';
import { FormValidationError } from 'naive-ui';

const { testConnection, saveConnection } = useConnectionStore();
const lang = useLang();
// DOM
const connectFormRef = ref();

const showModal = ref(false);
const modalTitle = ref(lang.t('connection.add'));
const testLoading = ref(false);
const saveLoading = ref(false);

const formData = ref<Connection>({
  name: '',
  host: '',
  port: '9200',
  username: '',
  password: '',
  queryParameters: '',
});
const formRules = reactive({
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
      renderMessage: () => lang.t('connection.formValidation.hostRequired'),
      trigger: ['input', 'blur'],
    },
  ],
  port: [
    {
      required: true,
      renderMessage: () => lang.t('connection.formValidation.portRequired'),
      trigger: ['input', 'blur'],
    },
  ],
});
const message = useMessage();

const showMedal = (con: Connection | null) => {
  showModal.value = true;
  if (con) {
    formData.value = con;
  }
};
const closeModal = () => {
  showModal.value = false;
};

const validationPassed = watch(formData.value, async () => {
  try {
    return await connectFormRef.value?.validate((errors: Array<FormValidationError>) => !errors);
  } catch (e) {
    return false;
  }
});

const testConnect = async (event: MouseEvent) => {
  event.preventDefault();
  testLoading.value = !testLoading.value;
  try {
    await testConnection({ ...formData.value, port: parseInt(formData.value.port as string) });
    message.success(lang.t('connection.testSuccess'));
  } catch (e) {
    const error = e as CustomError;
    message.error(`status: ${error.status}, details: ${error.details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 36000000,
    });
  } finally {
    testLoading.value = !testLoading.value;
  }
};

const saveConnect = async (event: MouseEvent) => {
  event.preventDefault();
  saveLoading.value = !saveLoading.value;
  saveConnection({ ...formData.value, port: parseInt(formData.value.port as string) });
  saveLoading.value = !saveLoading.value;
  showModal.value = false;
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
