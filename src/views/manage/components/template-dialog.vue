<template>
  <n-modal v-model:show="showModal">
    <n-card
      :bordered="false"
      role="dialog"
      aria-modal="true"
      style="width: 800px"
      :title="$t('manage.index.newTemplateForm.title')"
      @mask-click="closeModal"
    >
      <template #header-extra>
        <n-icon size="26" @click="closeModal">
          <Close />
        </n-icon>
      </template>
      <n-tabs justify-content="space-evenly" type="line" @update:value="handleTabSwitch">
        <n-tab-pane
          :name="TemplateType.INDEX_TEMPLATE"
          :tab="$t('manage.index.newTemplateForm.indexTemplate')"
        >
          <n-form
            ref="indexFormRef"
            label-placement="left"
            label-align="right"
            label-width="180"
            :model="indexFormData"
            :rules="indexFormRules"
          >
            <n-grid cols="8" item-responsive responsive="screen" x-gap="10" y-gap="10">
              <n-grid-item span="8">
                <n-form-item :label="$t('manage.index.newTemplateForm.templateName')" path="name">
                  <n-input
                    :input-props="inputProps"
                    v-model:value="indexFormData.name"
                    clearable
                    :placeholder="$t('manage.index.newTemplateForm.templateName')"
                  />
                </n-form-item>
              </n-grid-item>
              <n-grid-item span="4">
                <n-form-item label="master_timeout" path="master_timeout">
                  <n-input-number v-model:value="indexFormData.master_timeout" clearable>
                    <template #suffix>
                      <span>s</span>
                    </template>
                  </n-input-number>
                </n-form-item>
              </n-grid-item>
              <n-grid-item span="4">
                <n-form-item label="create" path="create">
                  <n-switch v-model:value="indexFormData.create" clearable />
                </n-form-item>
              </n-grid-item>
              <n-grid-item span="8">
                <n-form-item label="body" path="body">
                  <n-input
                    v-model:value="indexFormData.body"
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
          </n-form>
        </n-tab-pane>
        <n-tab-pane
          :name="TemplateType.COMPONENT_TEMPLATE"
          :tab="$t('manage.index.newTemplateForm.componentTemplate')"
        >
          <n-form
            ref="componentFormRef"
            label-placement="left"
            label-align="right"
            label-width="180"
            :model="componentFormData"
            :rules="componentFormRules"
          >
            <n-grid cols="8" item-responsive responsive="screen" x-gap="10" y-gap="10">
              <n-grid-item span="8">
                <n-form-item :label="$t('manage.index.newTemplateForm.templateName')" path="name">
                  <n-input
                    :input-props="inputProps"
                    v-model:value="componentFormData.name"
                    clearable
                    :placeholder="$t('manage.index.newTemplateForm.templateName')"
                  />
                </n-form-item>
              </n-grid-item>
              <n-grid-item span="4">
                <n-form-item label="master_timeout" path="master_timeout">
                  <n-input-number v-model:value="componentFormData.master_timeout" clearable>
                    <template #suffix>
                      <span>s</span>
                    </template>
                  </n-input-number>
                </n-form-item>
              </n-grid-item>
              <n-grid-item span="4">
                <n-form-item label="create" path="create">
                  <n-switch v-model:value="componentFormData.create" clearable />
                </n-form-item>
              </n-grid-item>
              <n-grid-item span="8">
                <n-form-item label="body" path="body">
                  <n-input
                    v-model:value="componentFormData.body"
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
          </n-form>
        </n-tab-pane>
      </n-tabs>
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
import { CustomError, inputProps, jsonify } from '../../../common';
import { TemplateType, useClusterManageStore } from '../../../store';
import { useLang } from '../../../lang';

const clusterManageStore = useClusterManageStore();
const { createTemplate } = clusterManageStore;

const lang = useLang();
const message = useMessage();

const showModal = ref(false);
const createLoading = ref(false);
const indexFormRef = ref();
const componentFormRef = ref();

const templateType = ref(TemplateType.INDEX_TEMPLATE);

const defaultFormData = {
  name: '',
  create: undefined,
  master_timeout: null,
  body: null,
};

type TemplateFormData = {
  name: string;
  create?: boolean;
  master_timeout: number | null;
  body: string | null;
};
const indexFormData = ref<TemplateFormData>({ ...defaultFormData });
const componentFormData = ref<TemplateFormData>({ ...defaultFormData });

const toggleModal = () => {
  if (showModal.value) {
    closeModal();
  } else {
    showModal.value = true;
  }
};
const closeModal = () => {
  showModal.value = false;
  indexFormData.value = { ...defaultFormData };
};

const formRules = {
  // @ts-ignore
  name: [
    {
      required: true,
      renderMessage: () => lang.t('manage.index.newTemplateForm.templateRequired'),
      trigger: ['input', 'blur'],
    },
  ],
  // validate filter should be a json
  body: [
    {
      required: true,
      validator: (_: FormItemRule, value: string) => {
        if (!value) return false;
        try {
          jsonify.parse(value);
          return true;
        } catch (e) {
          return false;
        }
      },
      renderMessage: () => lang.t('manage.index.newTemplateForm.bodyJsonRequired'),
      trigger: ['input', 'blur'],
    },
  ],
};

const indexFormRules = reactive<FormRules>({ ...formRules });
const componentFormRules = reactive<FormRules>({ ...formRules });

const validateRules = async () => {
  try {
    return templateType.value === TemplateType.INDEX_TEMPLATE
      ? await indexFormRef.value?.validate((errors: Array<FormValidationError>) => !errors)
      : await componentFormRef.value?.validate((errors: Array<FormValidationError>) => !errors);
  } catch (e) {
    return false;
  }
};

const validationPassed = watch([indexFormData, componentFormData, templateType], validateRules);

const submitCreate = async (event: MouseEvent) => {
  event.preventDefault();
  if (!(await validateRules())) {
    return;
  }
  createLoading.value = !createLoading.value;
  try {
    await createTemplate({
      ...(templateType.value === TemplateType.INDEX_TEMPLATE
        ? indexFormData.value
        : componentFormData.value),
      type: templateType.value,
    });
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
};

const handleTabSwitch = (tabName: TemplateType) => {
  templateType.value = tabName;
};

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
