<template>
  <div class="list-content">
    <n-scrollbar style="height: 100%">
      <div class="scroll-container">
        <div
          v-for="con in connections"
          :key="con.id"
          class="list-item"
          :class="{ active: established && con.id === established.id }"
        >
          <div class="left-box" @click="establishConnect(con)">
            <div class="icon">
              <img :src="ICON_PATHS[con.type]" />
            </div>
            <div class="name">{{ con.name }}</div>
          </div>
          <div class="operation">
            <n-dropdown
              trigger="hover"
              :options="options"
              @select="(args: number) => handleSelect(args, con)"
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
import { storeToRefs } from 'pinia';
import { useLang } from '../../../lang';
import { Connection, useConnectionStore } from '../../../store';
import { debug, CustomError } from '../../../common';
import { DatabaseType } from '../../../common/constants';

const emits = defineEmits(['edit-connect']);

const dialog = useDialog();
const message = useMessage();
const lang = useLang();

const options = reactive([
  { key: 1, label: lang.t('connection.operations.connect') },
  { key: 2, label: lang.t('connection.operations.edit') },
  { key: 3, label: lang.t('connection.operations.remove') },
]);
const connectionStore = useConnectionStore();
const { fetchConnections, removeConnection, establishConnection } = connectionStore;
const { connections, established } = storeToRefs(connectionStore);
fetchConnections();

const handleSelect = (key: number, connection: Connection) => {
  switch (key) {
    case 1:
      establishConnect(connection);
      break;
    case 2:
      editConnect(connection);
      break;
    case 3:
      removeConnect(connection);
      break;
  }
};

const establishConnect = async (connection: Connection) => {
  try {
    await establishConnection(connection);
  } catch (err) {
    const error = err as CustomError;
    message.error(`status: ${error.status}, details: ${error.details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 36000000,
    });
    debug('connect error');
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
    onPositiveClick: () => {
      removeConnection(connection);
      message.success(lang.t('dialogOps.removeSuccess'));
    },
  });
};

const ICON_PATHS = {
  [DatabaseType.ELASTICSEARCH]: new URL('../../../assets/svg/elasticsearch.svg', import.meta.url).href,
  [DatabaseType.DYNAMODB]: new URL('../../../assets/svg/dynamodb.svg', import.meta.url).href
} as const;
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
    width: 100%;
    height: 32px;
    border-radius: 5px;
    display: flex;
    align-items: center;
    cursor: pointer;
    .left-box {
      flex: 1;
      width: 0;
      display: flex;
      align-items: center;
      .icon {
        height: 24px;
        width: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 8px;
        
        img {
          width: 24px;
          height: 24px;
        }
      }

      .name {
        flex: 1;
        width: 0;
        padding: 0 5px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .operation {
      height: 100%;
      width: 20px;
      display: none;
      align-items: center;
      justify-content: center;
    }
  }

  .list-item + .list-item {
    margin-top: 5px;
  }

  .list-item:hover {
    background-color: var(--connect-list-hover-bg);

    .operation {
      display: flex;
    }
  }

  .list-item.active {
    .icon,
    .name,
    .operation {
      color: var(--theme-color);
    }
    .icon img {
      filter: brightness(1.2);
    }
  }
}
</style>
