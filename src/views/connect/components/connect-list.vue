<template>
  <div class="list-content">
    <n-scrollbar style="height: 100%">
      <div class="scroll-container">
        <div
          v-for="connection in connections"
          :key="connection.id"
          class="list-item"
          :class="{ active: established && connection.id === established.id }"
          @dblclick="() => establishConnect(connection)"
        >
          <div class="left-box">
            <div class="icon">
              <n-icon size="24">
                <component :is="getDatabaseIcon(connection.type)" />
              </n-icon>
            </div>
            <div class="content">
              <div class="name">{{ connection.name }}</div>
              <div class="type">{{ getDatabaseTypeLabel(connection.type) }}</div>
            </div>
          </div>
          <div class="operation">
            <n-dropdown
              trigger="hover"
              :options="getDropdownOptions(connection)"
              placement="bottom-start"
            >
            <n-icon size="20">	         
                <OverflowMenuVertical />
              </n-icon>
            </n-dropdown>
          </div>
        </div>
      </div>
    </n-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { OverflowMenuVertical } from '@vicons/carbon';
import { NDropdown, NIcon, useDialog, useMessage } from 'naive-ui';
import { storeToRefs } from 'pinia';
import dynamoDB from '../../../assets/svg/dynamoDB.svg';
import elasticsearch from '../../../assets/svg/elasticsearch.svg';
import { CustomError } from '../../../common';
import { useLang } from '../../../lang';
import { Connection, DatabaseType, useConnectionStore } from '../../../store/connectionStore';

const emits = defineEmits(['edit-connect']);

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

const getDatabaseTypeLabel = (type: DatabaseType) => {
  return type === DatabaseType.ELASTICSEARCH ? 'Elasticsearch' : 'DynamoDB';
};

const getDropdownOptions = (connection: Connection) => [
  {
    label: lang.t('connection.operations.connect'),
    key: 'connect',
    props: {
      onClick: () => establishConnect(connection)
    }
  },
  {
    label: lang.t('connection.operations.edit'),
    key: 'edit',
    props: {
      onClick: () => editConnect(connection)
    }
  },
  {
    label: lang.t('connection.operations.remove'),
    key: 'remove',
    props: {
      onClick: () => removeConnect(connection)
    }
  }
];

const establishConnect = async (connection: Connection) => {
  try {
    await establishConnection(connection);
    message.success(lang.t('connection.connectSuccess'));
  } catch (err) {
    if (err instanceof Error) {
      message.error(err.message);
    } else {
      const error = err as CustomError;
      message.error(`status: ${error.status}, details: ${error.details}`, {
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
.list-content {
  flex: 1;
  height: 0;
  padding-bottom: 10px;

  .scroll-container {
    padding: 0 10px;	
  }

  .list-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    margin-bottom: 8px;
    border-radius: 4px;
    background-color: var(--bg-color);
    cursor: pointer;
    transition: background-color 0.2s ease;

    &:hover {
      background-color: var(--connect-list-hover-bg);
    }

    &.active {
      background-color: var(--connect-list-hover-bg);
    }

    .left-box {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
      min-width: 0;

      .icon {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-color);

        img {
          height: 18px;
          width: 18px;
          filter: grayscale(1);
        }
      }

      .content {
        flex: 1;
        min-width: 0;

        .name {
          font-size: 14px;
          color: var(--text-color);
          margin-bottom: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .type {
          font-size: 12px;
          color: var(--text-color);
        }
      }
    }

    .operation {
      opacity: 0;
      transition: opacity 0.2s ease;

      .n-button {
        padding: 0 4px;
      }
    }

    &:hover {
      .operation {
        opacity: 1;
      }
    }
  }
}
</style>
