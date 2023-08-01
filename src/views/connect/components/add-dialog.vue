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
        <n-form label-placement="left" label-width="60">
          <n-grid cols="8" item-responsive responsive="screen" x-gap="10" y-gap="10">
            <n-grid-item span="8">
              <n-form-item label="名称">
                <n-input v-model:value="formData.name" clearable placeholder="Connect Name" />
              </n-form-item>
            </n-grid-item>
            <n-grid-item span="5">
              <n-form-item label="主机">
                <n-input v-model:value="formData.host" clearable />
              </n-form-item>
            </n-grid-item>
            <n-grid-item span="3">
              <n-form-item label="端口">
                <n-input v-model:value="formData.port" clearable />
              </n-form-item>
            </n-grid-item>
            <n-grid-item span="8">
              <n-form-item label="用户名">
                <n-input v-model:value="formData.userName" clearable />
              </n-form-item>
            </n-grid-item>
            <n-grid-item span="8">
              <n-form-item label="密码">
                <n-input
                  v-model:value="formData.userPwd"
                  type="password"
                  show-password-on="mousedown"
                />
              </n-form-item>
            </n-grid-item>
            <n-grid-item span="8">
              <n-form-item label="数据库">
                <n-input v-model:value="formData.database" clearable />
              </n-form-item>
            </n-grid-item>
            <n-grid-item span="8">
              <n-form-item label="URL">
                <n-input v-model:value="formData.linkUrl" clearable />
              </n-form-item>
            </n-grid-item>
          </n-grid>
        </n-form>
      </div>
      <template #footer>
        <div class="card-footer">
          <div class="left">
            <n-button type="info" :loading="testLoading" @click="testConnect">测试连接</n-button>
          </div>
          <div class="right">
            <n-button @click="closeModal">取消</n-button>
            <n-button type="primary" :loading="saveLoading" @click="saveConnect">确定</n-button>
          </div>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup lang="ts">
import { Close } from '@vicons/carbon';
const showModal = ref(false);
const modalTitle = ref('添加连接');
const testLoading = ref(false);
const saveLoading = ref(false);

const formOriginData = ref({
  name: '',
  host: '',
  port: '',
  userName: '',
  userPwd: '',
  database: '',
  linkUrl: '',
});
const formData = ref(formOriginData.value);

const showMedal = () => {
  showModal.value = true;
};
const closeModal = () => {
  showModal.value = false;
};
const testConnect = () => {
  testLoading.value = !testLoading.value;
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
