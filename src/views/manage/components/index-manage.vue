<template>
  <main>
    <n-tabs type="segment" animated>
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
      <n-tab-pane name="templates" tab="TEMPLATES">
        <n-data-table
          :columns="templateTable.columns"
          :data="templateTable.data"
          :bordered="false"
          max-height="400"
        />
      </n-tab-pane>
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
          <n-button secondary type="success" @click="toggleModal('index')">
            <template #icon>
              <n-icon>
                <Add />
              </n-icon>
            </template>
            New Index
          </n-button>
          <n-button secondary type="success" @click="toggleModal('alias')">
            <template #icon>
              <n-icon>
                <Add />
              </n-icon>
            </template>
            New Alias
          </n-button>
          <n-button secondary type="success" @click="toggleModal('template')">
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
    <index-dialog ref="indexDialogRef" />
    <alias-dialog ref="aliasDialogRef" />
    <template-dialog ref="templateDialogRef" />
  </main>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { ClusterAlias, ClusterIndex, IndexHealth, useClusterManageStore } from '../../../store';
import { NButton, NDropdown, NIcon, NTag } from 'naive-ui';
import { Add, ArrowsHorizontal, Renew, SettingsAdjust, Unlink } from '@vicons/carbon';
import IndexDialog from './index-dialog.vue';
import AliasDialog from './alias-dialog.vue';
import TemplateDialog from './template-dialog.vue';

const message = useMessage();

const clusterManageStore = useClusterManageStore();
const { fetchIndices, fetchAliases, fetchTemplates } = clusterManageStore;
const { indexWithAliases, aliasesWithIndices, templates } = storeToRefs(clusterManageStore);

const indexDialogRef = ref();
const aliasDialogRef = ref();
const templateDialogRef = ref();

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

const templateTable = computed(() => {
  return {
    columns: [
      { title: 'Template Name', dataIndex: 'name', key: 'name' },
      { title: 'Type', dataIndex: 'type', key: 'type' },
      { title: 'Order', dataIndex: 'order', key: 'order' },
      { title: 'Version', dataIndex: 'version', key: 'version' },
      { title: 'Mappings', dataIndex: 'mapping_count', key: 'mapping_count' },
      { title: 'Settings', dataIndex: 'settings_count', key: 'settings_count' },
      { title: 'Aliases', dataIndex: 'alias_count', key: 'alias_count' },
      { title: 'Metadata', dataIndex: 'metadata', key: 'metadata' },
      {
        title: 'Included In',
        dataIndex: 'included_in',
        key: 'included_in',
        render: ({ included_in }: { included_in: Array<string> }) =>
          included_in?.map(included => h(NTag, null, { default: () => included })),
      },
      {
        title: 'Index Patterns',
        dataIndex: 'index_patterns',
        key: 'index_patterns',
        render: ({ index_patterns }: { index_patterns: Array<string> }) =>
          index_patterns?.map(pattern => h(NTag, null, { default: () => pattern })),
      },
      {
        title: 'Composed Of',
        dataIndex: 'composed_of',
        key: 'composed_of',
        render: ({ composed_of }: { composed_of: Array<string> }) =>
          composed_of?.map(composed => h(NTag, null, { default: () => composed })),
      },
    ],
    data: templates.value,
  };
});

const refresh = async () => {
  await Promise.all([fetchIndices(), fetchAliases(), fetchTemplates()]).catch(err =>
    message.error(err.message, { closable: true, keepAliveOnHover: true }),
  );
};

const toggleModal = (target: string) => {
  if (target === 'index') indexDialogRef.value.toggleModal();
  if (target === 'alias') aliasDialogRef.value.toggleModal();
  if (target === 'template') templateDialogRef.value.toggleModal();
};

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
</style>
