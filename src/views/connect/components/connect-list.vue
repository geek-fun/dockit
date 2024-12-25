<template>
  <div class="list-content">
    <n-list class="connection-list">
        <n-list-item 
          v-for="connection in connections" 
          :key="connection.id" 
          class="connection-item"
          @dblclick="() => establishConnect(connection)"
        >
          <n-thing>
            <template #avatar>
              <n-icon size="24">
                <component :is="getDatabaseIcon(connection.type)" />
              </n-icon>
            </template>
            <template #header>
              {{ connection.name }}
            </template>
            <template #description>
              {{ getDatabaseTypeLabel(connection.type) }}
            </template>
          </n-thing>
          <template #suffix>
            <div class="dropdown-wrapper">
              <n-dropdown
                trigger="hover"
                :options="getDropdownOptions(connection)"
                placement="bottom-start"
              >
                <n-button text>
                  <template #icon>
                    <n-icon size="18">
                      <OverflowMenuVertical />
                    </n-icon>
                  </template>
                </n-button>
              </n-dropdown>
            </div>
          </template>
        </n-list-item>
      </n-list>
  </div>
</template>

<script setup lang="ts">
import { OverflowMenuVertical } from '@vicons/carbon';
import { NButton, NDropdown, NIcon, NList, NListItem, NThing, useDialog, useMessage } from 'naive-ui';
import { storeToRefs } from 'pinia';
import dynamoDB from '../../../assets/svg/dynamoDB.svg';
import elasticsearch from '../../../assets/svg/elasticsearch.svg';
import { CustomError } from '../../../common';
import { DatabaseType } from '../../../common/constants';
import { useLang } from '../../../lang';
import { Connection, useConnectionStore } from '../../../store/connectionStore';

const emits = defineEmits(['edit-connect']);

const dialog = useDialog();
const message = useMessage();
const lang = useLang();

const connectionStore = useConnectionStore();
const { fetchConnections, removeConnection, establishConnection } = connectionStore;
const { connections } = storeToRefs(connectionStore);
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

  .connection-list {
    .connection-item {
      position: relative;
      cursor: pointer;
      
      &:hover {
        background-color: var(--connect-list-hover-bg);
      }
      
      .dropdown-wrapper {
        opacity: 0;
        transition: opacity 0.2s ease;
      }

      &:hover {
        .dropdown-wrapper {
          opacity: 1;
        }
      }

      &:active {
        background-color: var(--connect-list-active-bg, #e6e6e6);
      }
    }
  }
}
</style>
