<template>
  <main>
    <n-tabs type="segment" animated @update:value="handleTabSwitch">
      <n-tab-pane name="indices" tab="INDICES">
        <n-data-table
          :columns="indexTable.columns"
          :data="indexTable.data"
          :bordered="false"
          max-height="400"
        />
      </n-tab-pane>
      <n-tab-pane name="aliases" tab="ALIASES">
        <n-data-table
          :columns="aliasesTable.columns"
          :data="aliasesTable.data"
          :bordered="false"
          max-height="400"
        />
      </n-tab-pane>
      <n-tab-pane name="templates" tab="TEMPLATES"> TEMPLATES</n-tab-pane>
      <template #suffix>
        <div class="tab-action-group">
          <n-button type="default" tertiary @click="refresh">
            <template #icon>
              <n-icon>
                <Renew />
              </n-icon>
            </template>
            Refresh
          </n-button>
          <n-button secondary type="success" @click="toggleIndexModal">
            <template #icon>
              <n-icon>
                <Add />
              </n-icon>
            </template>
            New Index
          </n-button>
          <n-button secondary type="success">
            <template #icon>
              <n-icon>
                <Add />
              </n-icon>
            </template>
            New Alias
          </n-button>
          <n-button secondary type="success">
            <template #icon>
              <n-icon>
                <Add />
              </n-icon>
            </template>
            New Template
          </n-button>
        </div>
      </template>
    </n-tabs>
    <n-modal v-model:show="showIndexModal">
      <n-card
        :bordered="false"
        role="dialog"
        aria-modal="true"
        style="width: 600px"
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
            label-width="100"
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
                      autocomplete: 'off',
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
  </main>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { ClusterAlias, ClusterIndex, IndexHealth, useClusterManageStore } from '../../../store';
import { FormRules, NButton, NDropdown, NIcon, FormValidationError } from 'naive-ui';
import { Add, ArrowsHorizontal, Close, Renew, SettingsAdjust, Unlink } from '@vicons/carbon';
import { useLang } from '../../../lang';
import { CustomError } from '../../../common';

const message = useMessage();
const lang = useLang();

const clusterManageStore = useClusterManageStore();
const { fetchIndices, fetchAliases, createIndex } = clusterManageStore;
const { indexWithAliases, aliasesWithIndices } = storeToRefs(clusterManageStore);

const indexTable = computed(() => {
  return {
    columns: [
      { title: 'Index', dataIndex: 'index', key: 'index' },
      { title: 'UUID', dataIndex: 'uuid', key: 'uuid' },
      {
        title: 'health',
        dataIndex: 'health',
        key: 'health',
        render({ health }: ClusterIndex) {
          return (
            (health === IndexHealth.GREEN ? '🟢' : health === IndexHealth.YELLOW ? '🟡' : '🔴') +
            ` ${health}`
          );
        },
      },
      { title: 'status', dataIndex: 'status', key: 'status' },
      {
        title: 'aliases',
        dataIndex: 'aliases',
        key: 'aliases',
        render({ aliases }: { aliases: Array<ClusterAlias> }) {
          return aliases.map(alias => alias.alias).join(', ');
        },
      },
      {
        title: 'Docs',
        dataIndex: 'docs',
        key: 'docs',
        render({ docs }: ClusterIndex) {
          return docs.count;
        },
      },
      {
        title: 'shards',
        dataIndex: 'shards',
        key: 'shards',
        render({ shards }: ClusterIndex) {
          return `${shards.primary}p/${shards.replica}r`;
        },
      },
      { title: 'Storage', dataIndex: 'storage', key: 'storage' },
    ],
    data: indexWithAliases.value,
  };
});

const aliasesTable = computed(() => {
  return {
    columns: [
      { title: 'Alias', dataIndex: 'alias', key: 'alias' },
      {
        title: 'Indices',
        dataIndex: 'indices',
        key: 'indices',
        render: ({ indices }: { indices: Array<ClusterAlias> }) =>
          indices.map(index =>
            h(
              NButton,
              {
                strong: true,
                type: 'default',
                tertiary: true,
                iconPlacement: 'right',
                style: 'margin-right: 8px',
              },
              {
                default: () => `${index.index}`,
                icon: () =>
                  h(
                    NDropdown,
                    {
                      trigger: 'click',
                      placement: 'bottom-end',
                      options: [
                        {
                          label: 'detach',
                          key: 'detach',
                          icon: () => h(NIcon, { color: 'red' }, { default: () => h(Unlink) }),
                        },
                        {
                          label: 'switch',
                          key: 'switch',
                          icon: () => h(NIcon, {}, { default: () => h(ArrowsHorizontal) }),
                        },
                      ],
                    },
                    {
                      default: () =>
                        h(
                          NIcon,
                          {},
                          {
                            default: () => h(SettingsAdjust),
                          },
                        ),
                    },
                  ),
              },
            ),
          ),
      },
    ],
    data: aliasesWithIndices.value,
  };
});

const handleTabSwitch = (event: unknown) => {
  console.log('tab-switch', event);
};

const refresh = async () => {
  await Promise.all([fetchIndices(), fetchAliases()]).catch(err =>
    message.error(err.message, { closable: true, keepAliveOnHover: true }),
  );
};

const showIndexModal = ref(false);
const createLoading = ref(false);
const formRef = ref();

const toggleIndexModal = () => {
  console.log('toggleIndexModal');
  showIndexModal.value = !showIndexModal.value;
};
const closeModal = () => {
  showIndexModal.value = false;
};
const defaultFormData = { indexName: '', shards: null, replicas: null };

const formData = ref<{ indexName: string; shards: number | null; replicas: number | null }>(
  defaultFormData,
);
const formRules = reactive<FormRules>({
  // @ts-ignore
  indexName: [
    {
      required: true,
      renderMessage: () => lang.t('connection.formValidation.nameRequired'),
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
      message.error((err as CustomError).details, { closable: true, keepAliveOnHover: true });
      return;
    } finally {
      createLoading.value = !createLoading.value;
    }

    showIndexModal.value = false;
  });
};

const validationPassed = watch(formData.value, async () => {
  try {
    return await formRef.value?.validate((errors: Array<FormValidationError>) => !errors);
  } catch (e) {
    return false;
  }
});

onMounted(async () => {
  await refresh();
});
</script>

<style lang="scss" scoped>
.tab-action-group {
  display: flex;
  justify-content: space-around;
  width: 500px;
}

.card-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
