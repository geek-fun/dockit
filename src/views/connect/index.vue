<template>
  <n-tabs
    v-model:value="currentPanelName"
    type="card"
    :addable="false"
    :closable="closableRef"
    class="connect-tab-container"
    @close="handleClose"
    @add="handleAdd"
  >
    <n-tab-pane
      v-for="panel in panelsRef"
      :key="panel.id"
      :name="panel.name"
      class="tab-pane-container"
    >
      <Editor v-if="panel.editor" />
      <connect-list v-else class="ssh-list" @edit-connect="editConnectHandler" />
    </n-tab-pane>
  </n-tabs>
  <div class="connect-container">
    <n-modal v-model:show="showTypeSelect">
      <n-card style="width: 400px" :title="$t('connection.selectDatabase')">
        <n-space vertical>
          <n-button
            v-for="type in databaseTypes"
            :key="type.value"
            block
            @click="selectDatabaseType(type.value)"
          >
            <template #icon>
              <component :is="type.icon" />
            </template>
            {{ type.label }}
          </n-button>
        </n-space>
      </n-card>
    </n-modal>

    <floating-menu @add="showDatabaseTypeSelect" />
    <es-connect-dialog ref="esConnectDialog" />
    <dynamodb-connect-dialog ref="dynamodbConnectDialog" />
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { ref } from 'vue';
import dynamoDB from '../../assets/svg/dynamoDB.svg';
import elasticsearch from '../../assets/svg/elasticsearch.svg';
import { Connection, DatabaseType, useConnectionStore } from '../../store';
import ConnectList from './components/connect-list.vue';
import DynamodbConnectDialog from './components/dynamodb-connect-dialog.vue';
import EsConnectDialog from './components/es-connect-dialog.vue';
import FloatingMenu from './components/floating-menu.vue';
import Editor from '../editor/index.vue';

const connectionStore = useConnectionStore();
const { established } = storeToRefs(connectionStore);

type Panel = {
  id: number;
  name: string;
  editor?: Connection;
};
const currentPanelName = ref('home');
const panelsRef = ref<Array<Panel>>([{ id: 0, name: 'home' }]);

const showTypeSelect = ref(false);
const esConnectDialog = ref();
const dynamodbConnectDialog = ref();

const databaseTypes = [
  {
    label: 'Elasticsearch',
    value: DatabaseType.ELASTICSEARCH,
    icon: elasticsearch,
  },
  {
    label: 'DynamoDB',
    value: DatabaseType.DYNAMODB,
    icon: dynamoDB,
  },
];

const editConnectHandler = (connection: Connection) => {
  if (connection.type === DatabaseType.ELASTICSEARCH) {
    esConnectDialog.value.showMedal(connection);
  } else if (connection.type === DatabaseType.DYNAMODB) {
    dynamodbConnectDialog.value.showMedal(connection);
  }
};

const showDatabaseTypeSelect = () => {
  showTypeSelect.value = true;
};

const selectDatabaseType = (type: DatabaseType) => {
  showTypeSelect.value = false;
  if (type === DatabaseType.ELASTICSEARCH) {
    esConnectDialog.value.showMedal(null);
  } else if (type === DatabaseType.DYNAMODB) {
    dynamodbConnectDialog.value.showMedal(null);
  }
};

const closableRef = computed(() => {
  return panelsRef.value.length > 1;
});

const handleAdd = () => {
  const exists = panelsRef.value.filter(panel => panel.name.startsWith('SSH List'));
  const name = !exists.length ? 'SSH List' : `SSH List-${exists.length}`;

  panelsRef.value.push({ id: panelsRef.value.length, name });
  currentPanelName.value = name;
};

const handleClose = (name: string) => {
  const { value: panels } = panelsRef;
  const nameIndex = panels.findIndex(({ name: panelName }) => panelName === name);
  if (!~nameIndex) return;
  panels.splice(nameIndex, 1);
  if (name === currentPanelName.value) {
    currentPanelName.value = panels[Math.min(nameIndex, panels.length - 1)].name;
  }
};
</script>

<style lang="scss" scoped>
.connect-tab-container {
  width: 100%;
  height: 100%;
  .tab-pane-container {
    height: 100%;
    width: 100%;
  }
}
</style>
