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
          label-placement="left"
          label-width="120"
          :model="formData"
          :rules="formRules"
        >
          <n-form-item :label="$t('connection.name')" path="name">
            <n-input
              v-model:value="formData.name"
              clearable
              :placeholder="$t('connection.name')"
              :input-props="inputProps"
            />
          </n-form-item>
          <n-form-item :label="$t('connection.tableName')" path="tableName">
            <n-input
              v-model:value="formData.tableName"
              clearable
              :placeholder="$t('connection.tableName')"
              :input-props="inputProps"
            />
          </n-form-item>
          <n-form-item :label="$t('connection.region')" path="region">
            <n-select
              v-model:value="formData.region"
              :options="regionOptions"
              :placeholder="$t('connection.selectRegion')"
            />
          </n-form-item>
          <n-form-item :label="$t('connection.accessKeyId')" path="accessKeyId">
            <n-input
              v-model:value="formData.accessKeyId"
              clearable
              :placeholder="$t('connection.accessKeyId')"
              :input-props="inputProps"
            />
          </n-form-item>
          <n-form-item :label="$t('connection.secretAccessKey')" path="secretAccessKey">
            <n-input
              v-model:value="formData.secretAccessKey"
              type="password"
              show-password-on="mousedown"
              :placeholder="$t('connection.secretAccessKey')"
              :input-props="inputProps"
            />
          </n-form-item>
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
import { computed, reactive, ref } from 'vue';
import { cloneDeep } from 'lodash';
import { inputProps } from '../../../common';
import { useLang } from '../../../lang';
import { useConnectionStore } from '../../../store';
import { DatabaseType, DynamoDBConnection } from '../../../store';

const connectionStore = useConnectionStore();

const { testConnection } = connectionStore;

const lang = useLang();

const showModal = ref(false);
const modalTitle = ref(lang.t('connection.new'));
const testLoading = ref(false);
const saveLoading = ref(false);

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

const defaultFormData = {
  name: '',
  type: DatabaseType.DYNAMODB,
  region: '',
  accessKeyId: '',
  secretAccessKey: '',
  tableName: '',
} as DynamoDBConnection;

const formData = ref<DynamoDBConnection>(cloneDeep(defaultFormData));

const formRules = reactive({
  name: [
    {
      required: true,
      message: lang.t('connection.formValidation.nameRequired'),
      trigger: ['input', 'blur'],
    },
  ],
  tableName: [
    {
      required: true,
      message: lang.t('connection.formValidation.tableNameRequired'),
      trigger: ['input', 'blur'],
    },
  ],
  region: [
    {
      required: true,
      message: lang.t('connection.formValidation.regionRequired'),
      trigger: ['input', 'blur'],
    },
  ],
  accessKeyId: [
    {
      required: true,
      message: lang.t('connection.formValidation.accessKeyIdRequired'),
      trigger: ['input', 'blur'],
    },
  ],
  secretAccessKey: [
    {
      required: true,
      message: lang.t('connection.formValidation.secretAccessKeyRequired'),
      trigger: ['input', 'blur'],
    },
  ],
});

const message = useMessage();

const showMedal = (con: DynamoDBConnection | null) => {
  showModal.value = true;
  if (con) {
    formData.value = { ...con };
    modalTitle.value = lang.t('connection.edit');
  }
};

const closeModal = () => {
  showModal.value = false;
  formData.value = cloneDeep(defaultFormData);
  modalTitle.value = lang.t('connection.new');
};

const validationPassed = computed(() => {
  return (
    formData.value.name &&
    formData.value.tableName &&
    formData.value.region &&
    formData.value.accessKeyId &&
    formData.value.secretAccessKey
  );
});

const testConnect = async () => {
  try {
    testLoading.value = true;
    await testConnection(formData.value);
    message.success(lang.t('connection.testSuccess'));
  } catch (error) {
    if (error instanceof Error) {
      message.error(error.message);
    } else {
      message.error(lang.t('connection.unknownError'));
    }
  } finally {
    testLoading.value = false;
  }
};

const saveConnect = async () => {
  saveLoading.value = true;
  const result = await connectionStore.saveConnection(formData.value);
  if (result.success) {
    message.success(lang.t('connection.saveSuccess'));
    closeModal();
  } else {
    message.error(result.message);
  }
  saveLoading.value = false;
};

defineExpose({ showMedal });
</script>
