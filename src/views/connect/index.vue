<template>
  <div class="connect-container">
    <div class="connect-list">
      <div class="add-connect" @click="addConnect">
        <n-icon size="28">
          <Add />
        </n-icon>
        <span>{{ $t('connection.new') }}</span>
      </div>
      <connect-list @edit-connect="editConnectHandler" />
    </div>
    <div class="connect-body">
      <n-config-provider :hljs="hljs">
        <n-code :code="jsCode" language="javascript" show-line-numbers />
      </n-config-provider>
    </div>
  </div>
  <connect-modal ref="connectModalRef" />
</template>

<script setup lang="ts">
import { Add } from '@vicons/carbon';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';

import ConnectModal from './components/connect-dialog.vue';
import connectList from './components/connect-list.vue';

hljs.registerLanguage('javascript', javascript);

// DOM
const connectModalRef = ref();

const addConnect = () => connectModalRef.value.showMedal();

const editConnectHandler = (row: object) => {
  connectModalRef.value.showMedal(row);
};

const jsCode = ref(`
let java = 'hellow word!'
`);
</script>

<style lang="scss" scoped>
.connect-container {
  height: 100%;
  width: 100%;
  display: flex;
  .connect-list {
    width: 200px;
    border-right: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    .add-connect {
      height: 30px;
      margin: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 5px;
      color: #fff;
      background-color: var(--theme-color);
      cursor: pointer;
    }
  }
  .connect-body {
    flex: 1;
    width: 0;
    height: 100%;
  }
}
</style>
