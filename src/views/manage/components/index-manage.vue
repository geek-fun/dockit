<template>
  <n-data-table
    :columns="indexTable.columns"
    :data="indexTable.data"
    :bordered="false"
    max-height="300"
  />
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { ClusterAlias, ClusterIndex, IndexHealth, useClusterManageStore } from '../../../store';

const message = useMessage();

const clusterManageStore = useClusterManageStore();
const { fetchIndices, fetchAliases } = clusterManageStore;
const { indexWithAliases } = storeToRefs(clusterManageStore);

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
          console.log('row-aliases', aliases);
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
          console.log('row', shards);
          return `${shards.primary}p/${shards.replica}r`;
        },
      },
      { title: 'Storage', dataIndex: 'storage', key: 'storage' },
    ],
    data: indexWithAliases.value,
  };
});

fetchIndices().catch(err => message.error(err.message, { closable: true, keepAliveOnHover: true }));
fetchAliases();
</script>

<style lang="scss" scoped></style>
