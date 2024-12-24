<template>
  <n-modal v-model:show="showModal">
    <n-card
      style="width: 600px"
      role="dialog"
      aria-modal="true"
      :title="modalTitle"
      :bordered="false"
      class="add-connect-modal-card"
      @mask-click="closeModal"
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
import { ref, reactive } from 'vue';
import { Close } from '@vicons/carbon';
import { inputProps } from '../../../common';
import { DatabaseType, DynamoDBConnection } from '../../../common/constants';
import { useConnectionStore } from '../../../store';
import { useLang } from '../../../lang';

const connectionStore = useConnectionStore();
const lang = useLang();
const connectFormRef = ref();

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

const defaultFormData: DynamoDBConnection = {
  name: '',
  type: DatabaseType.DYNAMODB,
  region: '',
  accessKeyId: '',
  secretAccessKey: '',
};

const formData = ref<DynamoDBConnection>({ ...defaultFormData });

const formRules = reactive({
  name: [
    {
      required: true,
      message: lang.t('connection.formValidation.nameRequired'),
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

const cleanUp = () => {
  formData.value = { ...defaultFormData };
  modalTitle.value = lang.t('connection.new');
};

const showMedal = (con: DynamoDBConnection | null) => {
  cleanUp();
  showModal.value = true;
  if (con) {
    formData.value = { ...con };
    modalTitle.value = lang.t('connection.edit');
  }
};

const closeModal = () => {
  showModal.value = false;
  cleanUp();
};

const validationPassed = computed(() => {
  return (
    formData.value.name &&
    formData.value.region &&
    formData.value.accessKeyId &&
    formData.value.secretAccessKey
  );
});

const testConnect = async () => {
  try {
    testLoading.value = true;
    await connectionStore.testDynamoDBConnection(formData.value);
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