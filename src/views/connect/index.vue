<template>
  <n-tabs
    v-model:value="currentPanelName"
    type="card"
    :addable="false"
    :closable="closableRef"
    class="connect-tab-container"
    @close="handleClose"
  >
    <n-tab-pane
      v-for="panel in panelsRef"
      :key="panel.id"
      :name="panel.name"
      class="tab-pane-container"
    >
      <Editor v-if="panel.connection" />
      <connect-list v-else @tab-panel="tabPanelHandler" />
    </n-tab-pane>
  </n-tabs>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Connection } from '../../store';
import ConnectList from './components/connect-list.vue';
import Editor from '../editor/index.vue';

type Panel = {
  id: number;
  name: string;
  connection?: Connection;
};

const currentPanelName = ref('home');
const panelsRef = ref<Array<Panel>>([{ id: 0, name: 'home' }]);

const tabPanelHandler = async ({
  action,
  connection,
}: {
  action: 'ADD_PANEL';
  connection: Connection;
}) => {
  if (action === 'ADD_PANEL') {
    const exists = panelsRef.value.filter(panelItem => panelItem.connection?.id === connection.id);
    const panelName = !exists.length ? connection.name : `${connection.name}-${exists.length}`;

    panelsRef.value.push({ id: panelsRef.value.length + 1, name: panelName, connection });

    currentPanelName.value = panelName;
  }
};

const closableRef = computed(() => {
  return panelsRef.value.length > 1;
});

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
