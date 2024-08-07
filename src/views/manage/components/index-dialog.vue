<template>
  <n-modal v-model:show="showIndexModal">
    <n-card
      :bordered="false"
      role="dialog"
      aria-modal="true"
      style="width: 800px"
      :title="$t('manage.index.newIndexForm.title')"
      @mask-click="closeModal"
    >
      <template #header-extra>
        <n-icon size="26" @click="closeModal">
          <Close />
        </n-icon>
      </template>
      <div class="modal-content">
        <n-form
          ref="formRef"
          label-placement="left"
          label-align="right"
          label-width="180"
          :model="formData"
          :rules="formRules"
        >
          <n-grid cols="8" item-responsive responsive="screen" x-gap="10" y-gap="10">
            <n-grid-item span="8">
              <n-form-item :label="$t('manage.index.newIndexForm.indexName')" path="indexName">
                <n-input
                  :input-props="{
                    autocorrect: 'off',
                    autocapitalize: 'off',
                    autocomplete: 'disabled',
                  }"
                  v-model:value="formData.indexName"
                  clearable
                  :placeholder="$t('manage.index.newIndexForm.indexName')"
                />
              </n-form-item>
            </n-grid-item>

            <n-grid-item span="4">
              <n-form-item :label="$t('manage.index.newIndexForm.shards')" path="shards">
                <n-input-number
                  v-model:value="formData.shards"
                  clearable
                  :placeholder="$t('manage.index.newIndexForm.shards')"
                />
              </n-form-item>
            </n-grid-item>

            <n-grid-item span="4">
              <n-form-item :label="$t('manage.index.newIndexForm.replicas')" path="replicas">
                <n-input-number
                  v-model:value="formData.replicas"
                  clearable
                  :placeholder="$t('manage.index.newIndexForm.replicas')"
                />
              </n-form-item>
            </n-grid-item>
          </n-grid>
          <n-collapse>
            <n-collapse-item title="Advanced" name="Advanced">
              <n-grid cols="8" item-responsive responsive="screen" x-gap="10" y-gap="10">
                <n-grid-item span="4">
                  <n-form-item label="master_timeout" path="master_timeout">
                    <n-input-number v-model:value="formData.master_timeout" clearable>
                      <template #suffix>
                        <span>s</span>
                      </template>
                    </n-input-number>
                  </n-form-item>
                </n-grid-item>
                <n-grid-item span="4">
                  <n-form-item label="timeout" path="timeout">
                    <n-input-number v-model:value="formData.timeout" clearable>
                      <template #suffix>
                        <span>s</span>
                      </template>
                    </n-input-number>
                  </n-form-item>
                </n-grid-item>
                <n-grid-item span="4">
                  <n-form-item label="wait_for_active_shards" path="wait_for_active_shards">
                    <n-input-number v-model:value="formData.wait_for_active_shards" clearable />
                  </n-form-item>
                </n-grid-item>
                <n-grid-item span="8">
                  <n-form-item label="body" path="body">
                    <n-input
                      v-model:value="formData.body"
                      clearable
                      type="textarea"
                      :autosize="{
                        minRows: 10,
                        maxRows: 15,
                      }"
                    />
                  </n-form-item>
                </n-grid-item>
              </n-grid>
            </n-collapse-item>
          </n-collapse>
        </n-form>
      </div>
      <template #footer>
        <div class="card-footer">
          <n-button @click="closeModal">{{ $t('dialogOps.cancel') }}</n-button>
          <n-button
            type="primary"
            :loading="createLoading"
            :disabled="!validationPassed"
            @click="submitCreate"
          >
            {{ $t('dialogOps.create') }}
          </n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup lang="ts">
import { FormRules, FormValidationError, NButton, NIcon, FormItemRule } from 'naive-ui';
import { Close } from '@vicons/carbon';
import { CustomError } from '../../../common';
import { useClusterManageStore } from '../../../store';
import { useLang } from '../../../lang';

const clusterManageStore = useClusterManageStore();
const { createIndex } = clusterManageStore;

const lang = useLang();
const message = useMessage();

const showIndexModal = ref(false);
const createLoading = ref(false);
const formRef = ref();

const defaultFormData = {
  indexName: '',
  shards: null,
  replicas: null,
  master_timeout: null,
  wait_for_active_shards: null,
  timeout: null,
  body: null,
};

const formData = ref<{
  indexName: string;
  shards: number | null;
  replicas: number | null;
  master_timeout: number | null;
  wait_for_active_shards: number | null;
  timeout: number | null;
  body: string | null;
}>({ ...defaultFormData });

const toggleModal = () => {
  if (showIndexModal.value) {
    closeModal();
  } else {
    showIndexModal.value = true;
  }
};
const closeModal = () => {
  showIndexModal.value = false;
  formData.value = { ...defaultFormData };
};

const formRules = reactive<FormRules>({
  // @ts-ignore
  indexName: [
    {
      required: true,
      renderMessage: () => lang.t('manage.index.newIndexForm.indexRequired'),
      trigger: ['input', 'blur'],
    },
  ],
  // validate body should be a json
  body: [
    {
      required: false,
      validator: (_: FormItemRule, value: string) => {
        if (!value) return true;
        try {
          JSON.parse(value);
          return true;
        } catch (e) {
          return false;
        }
      },
      renderMessage: () => lang.t('manage.index.newIndexForm.bodyJsonRequired'),
      trigger: ['input', 'blur'],
    },
  ],
});

const submitCreate = async (event: MouseEvent) => {
  event.preventDefault();
  formRef.value?.validate(async (errors: boolean) => {
    if (errors) {
      return;
    }
    createLoading.value = !createLoading.value;
    try {
      await createIndex(formData.value);
      message.success(lang.t('dialogOps.createSuccess'));
    } catch (err) {
      message.error((err as CustomError).details, {
        closable: true,
        keepAliveOnHover: true,
        duration: 7200,
      });
      return;
    } finally {
      createLoading.value = !createLoading.value;
    }

    closeModal();
  });
};

const validationPassed = watch(formData.value, async () => {
  try {
    return await formRef.value?.validate((errors: Array<FormValidationError>) => !errors);
  } catch (e) {
    return false;
  }
});

defineExpose({ toggleModal });
</script>

<style lang="scss" scoped>
:deep(.n-card-header) {
  .n-card-header__extra {
    cursor: pointer;
  }
}

.card-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
