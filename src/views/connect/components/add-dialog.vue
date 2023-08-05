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
        <n-form label-placement="left" label-width="100">
          <n-grid cols="8" item-responsive responsive="screen" x-gap="10" y-gap="10">
            <n-grid-item span="8">
              <n-form-item :label="$t('connection.name')">
                <n-input
                  v-model:value="formData.name"
                  clearable
                  :placeholder="$t('connection.name')"
                />
              </n-form-item>
            </n-grid-item>
            <n-grid-item span="5">
              <n-form-item :label="$t('connection.host')">
                <n-input
                  v-model:value="formData.host"
                  clearable
                  :placeholder="$t('connection.host')"
                />
              </n-form-item>
            </n-grid-item>
            <n-grid-item span="3">
              <n-form-item :label="$t('connection.port')">
                <n-input
                  v-model:value="formData.port"
                  clearable
                  :placeholder="$t('connection.port')"
                />
              </n-form-item>
            </n-grid-item>
            <n-grid-item span="8">
              <n-form-item :label="$t('connection.username')">
                <n-input
                  v-model:value="formData.userName"
                  clearable
                  :placeholder="$t('connection.username')"
                />
              </n-form-item>
            </n-grid-item>
            <n-grid-item span="8">
              <n-form-item :label="$t('connection.password')">
                <n-input
                  v-model:value="formData.userPwd"
                  type="password"
                  show-password-on="mousedown"
                  :placeholder="$t('connection.password')"
                />
              </n-form-item>
            </n-grid-item>
            <n-grid-item span="8">
              <n-form-item :label="$t('connection.finalUrl')">
                <n-input
                  v-model:value="formData.linkUrl"
                  clearable
                  :placeholder="$t('connection.finalUrl')"
                />
              </n-form-item>
            </n-grid-item>
          </n-grid>
        </n-form>
      </div>
      <template #footer>
        <div class="card-footer">
          <div class="left">
            <n-button type="info" :loading="testLoading" @click="testConnect">
              {{ $t('connection.test') }}
            </n-button>
          </div>
          <div class="right">
            <n-button @click="closeModal">{{ $t('form.cancel') }}</n-button>
            <n-button type="primary" :loading="saveLoading" @click="saveConnect">
              {{ $t('form.confirm') }}
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

const showModal = ref(false);
const modalTitle = ref('添加连接');
const testLoading = ref(false);
const saveLoading = ref(false);
const formOriginData = ref({
  name: '',
  host: '',
  port: '9200',
  userName: '',
  userPwd: '',
  database: '',
  linkUrl: '',
});
const formData = ref(formOriginData.value);
const message = useMessage();
const showMedal = () => {
  showModal.value = true;
};
const closeModal = () => {
  showModal.value = false;
};

const testConnect = async () => {
  testLoading.value = !testLoading.value;
  try {
    const result = await fetch(`${formOriginData.value.host}:${formOriginData.value.port}`, {
      method: 'GET',
    });
    if (!result.ok) new CustomError(result.status, await result.json());
    message.success('connect success');
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
const saveConnect = () => {
  saveLoading.value = false;
};
defineExpose({
  showMedal,
});
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
