<template>
  <div class="connection-list-body">
    <n-card
      v-for="connection in connections"
      :key="connection.id"
      :title="connection.name"
      hoverable
      :class="{ active: established && connection.id === established.id }"
    >
      <template #header-extra>
        <n-icon size="24">
          <component :is="getDatabaseIcon(connection.type)" />
        </n-icon>
        <div class="operation" @click.stop="">
          <n-dropdown
            trigger="click"
            :options="options"
            @select="(args: string) => handleSelect(args, connection)"
          >
            <n-icon size="25">
              <MoreOutlined />
            </n-icon>
          </n-dropdown>
        </div>
      </template>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { NDropdown, NIcon, useDialog, useMessage } from 'naive-ui';
import { storeToRefs } from 'pinia';
import dynamoDB from '../../../assets/svg/dynamoDB.svg';
import elasticsearch from '../../../assets/svg/elasticsearch.svg';
import { CustomError } from '../../../common';
import { useLang } from '../../../lang';
import { Connection, DatabaseType, useConnectionStore } from '../../../store';
import { MoreOutlined } from '@vicons/antd';

const emits = defineEmits(['edit-connect', 'tab-panel']);

const dialog = useDialog();
const message = useMessage();
const lang = useLang();

const connectionStore = useConnectionStore();
const { fetchConnections, removeConnection, establishConnection } = connectionStore;
const { connections, established } = storeToRefs(connectionStore);
fetchConnections();

const getDatabaseIcon = (type: DatabaseType) => {
  return type === DatabaseType.ELASTICSEARCH ? elasticsearch : dynamoDB;
};

const options = reactive([
  { key: 'connect', label: lang.t('connection.operations.connect') },
  { key: 'edit', label: lang.t('connection.operations.edit') },
  { key: 'remove', label: lang.t('connection.operations.remove') },
]);

const handleSelect = (key: string, connection: Connection) => {
  switch (key) {
    case 'connect':
      establishConnect(connection);
      break;
    case 'edit':
      editConnect(connection);
      break;
    case 'remove':
      removeConnect(connection);
      break;
  }
};

const establishConnect = async (connection: Connection) => {
  try {
    await establishConnection(connection);
    message.success(lang.t('connection.connectSuccess'));
    emits('tab-panel', { action: 'ADD_PANEL', connection });
  } catch (err) {
    if (err instanceof CustomError) {
      message.error(`status: ${err.status}, details: ${err.details}`, {
        closable: true,
        keepAliveOnHover: true,
        duration: 36000000,
      });
    } else {
      message.error(lang.t('connection.unknownError') + `details: ${err}`, {
        closable: true,
        keepAliveOnHover: true,
        duration: 36000000,
      });
    }
  }
};

// edit connect info
const editConnect = (connection: Connection) => {
  if (!connection.type) {
    console.error('Connection type is missing');
    return;
  }
  emits('edit-connect', connection);
};

const removeConnect = (connection: Connection) => {
  dialog.warning({
    title: lang.t('dialogOps.warning'),
    content: lang.t('dialogOps.removeNotice'),
    positiveText: lang.t('dialogOps.confirm'),
    negativeText: lang.t('dialogOps.cancel'),
    onPositiveClick: async () => {
      try {
        await removeConnection(connection);
        message.success(lang.t('dialogOps.removeSuccess'));
      } catch (error) {
        message.error(lang.t('connection.unknownError'));
      }
    },
  });
};
</script>

<style lang="scss" scoped>
.connection-list-body {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 16px;
}

.n-card {
  max-width: 300px;
}

.connection-list-body .n-card:hover {
  cursor: pointer;
}
</style>
