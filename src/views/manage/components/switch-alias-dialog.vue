<template>
  <n-modal v-model:show="showModal">
    <n-card
      :bordered="false"
      role="dialog"
      aria-modal="true"
      style="width: 800px"
      :title="$t('manage.index.switchAliasForm.title')"
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
              <n-form-item :label="$t('manage.index.switchAliasForm.aliasName')" path="aliasName">
                <n-input v-model:value="formData.aliasName" disabled :input-props="inputProps" />
              </n-form-item>
              <n-form-item
                :label="$t('manage.index.switchAliasForm.sourceIndex')"
                path="sourceIndex"
              >
                <n-input v-model:value="formData.sourceIndex" disabled :input-props="inputProps" />
              </n-form-item>
            </n-grid-item>
            <n-grid-item span="8">
              <n-form-item
                :label="$t('manage.index.switchAliasForm.targetIndex')"
                path="targetIndex"
              >
                <n-select v-model:value="formData.targetIndex" clearable :options="indices" />
              </n-form-item>
            </n-grid-item>
          </n-grid>
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
            {{ $t('dialogOps.confirm') }}
          </n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { FormRules, FormValidationError, NButton, NIcon } from 'naive-ui';
import { Close } from '@vicons/carbon';
import { CustomError, inputProps } from '../../../common';
import { useClusterManageStore } from '../../../store';
import { useLang } from '../../../lang';

const clusterManageStore = useClusterManageStore();
const { switchAlias, fetchAliases } = clusterManageStore;
const { indexWithAliases } = storeToRefs(clusterManageStore);
const lang = useLang();
const message = useMessage();

const showModal = ref(false);
const createLoading = ref(false);
const formRef = ref();

const formData = ref<{
  aliasName: string;
  sourceIndex: string;
  targetIndex: string;
}>({ aliasName: '', sourceIndex: '', targetIndex: '' });

const toggleModal = (aliasName: string, sourceIndex: string) => {
  if (showModal.value) {
    closeModal();
  } else {
    formData.value = { aliasName, sourceIndex, targetIndex: '' };
    showModal.value = true;
  }
};
const closeModal = () => {
  showModal.value = false;
  formData.value = { aliasName: '', sourceIndex: '', targetIndex: '' };
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
  sourceIndex: [
    {
      required: true,
      renderMessage: () => lang.t('manage.index.newAliasForm.indexRequired'),
      trigger: ['input', 'blur'],
    },
  ],
  targetIndex: [
    {
      required: true,
      renderMessage: () => lang.t('manage.index.newAliasForm.indexRequired'),
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
      const { aliasName, sourceIndex, targetIndex } = formData.value;
      await switchAlias(aliasName, sourceIndex, targetIndex);
      await fetchAliases();
      message.success(lang.t('dialogOps.switchSuccess'));
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
