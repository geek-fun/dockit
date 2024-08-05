<template>
  <n-modal v-model:show="showModal">
    <n-card
      :bordered="false"
      role="dialog"
      aria-modal="true"
      style="width: 800px"
      :title="$t('manage.index.newAliasForm.title')"
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
              <n-form-item :label="$t('manage.index.newAliasForm.aliasName')" path="aliasName">
                <n-input
                  :input-props="{
                    autocorrect: 'off',
                    autocapitalize: 'off',
                    autocomplete: 'disabled',
                  }"
                  v-model:value="formData.aliasName"
                  clearable
                  :placeholder="$t('manage.index.newAliasForm.aliasName')"
                />
              </n-form-item>
            </n-grid-item>
            <n-grid-item span="8">
              <n-form-item :label="$t('manage.index.newAliasForm.indexName')" path="indexName">
                <n-select v-model:value="formData.indexName" clearable :options="indices" />
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
                  <n-form-item label="is_write_index" path="is_write_index">
                    <n-switch v-model:value="formData.is_write_index" clearable />
                  </n-form-item>
                </n-grid-item>
                <n-grid-item span="4">
                  <n-form-item label="routing" path="routing">
                    <n-input-number v-model:value="formData.routing" clearable />
                  </n-form-item>
                </n-grid-item>
                <n-grid-item span="4">
                  <n-form-item label="search_routing" path="search_routing">
                    <n-input-number v-model:value="formData.search_routing" clearable />
                  </n-form-item>
                </n-grid-item>
                <n-grid-item span="4">
                  <n-form-item label="index_routing" path="index_routing">
                    <n-input-number v-model:value="formData.index_routing" clearable />
                  </n-form-item>
                </n-grid-item>
                <n-grid-item span="8">
                  <n-form-item label="filter" path="filter">
                    <n-input
                      v-model:value="formData.filter"
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
import { storeToRefs } from 'pinia';
import { FormRules, FormValidationError, NButton, NIcon, FormItemRule } from 'naive-ui';
import { Close } from '@vicons/carbon';
import { CustomError } from '../../../common';
import { useClusterManageStore } from '../../../store';
import { useLang } from '../../../lang';

const clusterManageStore = useClusterManageStore();
const { createAlias } = clusterManageStore;
const { indexWithAliases } = storeToRefs(clusterManageStore);
const lang = useLang();
const message = useMessage();

const showModal = ref(false);
const createLoading = ref(false);
const formRef = ref();

const defaultFormData = {
  aliasName: '',
  indexName: '',
  shards: null,
  replicas: null,
  master_timeout: null,
  timeout: null,
  is_write_index: undefined,
  filter: null,
  routing: null,
  search_routing: null,
  index_routing: null,
};

const formData = ref<{
  aliasName: string;
  indexName: string;
  master_timeout: number | null;
  timeout: number | null;
  is_write_index?: boolean;
  filter: string | null;
  routing: number | null;
  search_routing: number | null;
  index_routing: number | null;
}>({ ...defaultFormData });

const toggleModal = () => {
  if (showModal.value) {
    closeModal();
  } else {
    showModal.value = true;
  }
};
const closeModal = () => {
  showModal.value = false;
  formData.value = { ...defaultFormData };
};

const formRules = reactive<FormRules>({
  // @ts-ignore
  aliasName: [
    {
      required: true,
      renderMessage: () => lang.t('manage.index.newAliasForm.aliasRequired'),
      trigger: ['input', 'blur'],
    },
  ],
  indexName: [
    {
      required: true,
      renderMessage: () => lang.t('manage.index.newAliasForm.indexRequired'),
      trigger: ['input', 'blur'],
    },
  ],

  // validate filter should be a json
  filter: [
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
      renderMessage: () => lang.t('manage.index.newAliasForm.filterJsonRequired'),
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
      await createAlias({
        ...formData.value,
        filter: formData.value.filter ? JSON.parse(formData.value.filter) : undefined,
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
  });
};

const validationPassed = watch(formData.value, async () => {
  try {
    return await formRef.value?.validate((errors: Array<FormValidationError>) => !errors);
  } catch (e) {
    return false;
  }
});

const indices = computed(() =>
  indexWithAliases.value.map(index => ({
    label: index.index,
    value: index.index,
  })),
);

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
