<template>
  <div class="dynamo-editor">
    <tool-bar type="DYNAMO_EDITOR" />
    <ui-editor v-if="activePanel.editorType === 'DYNAMO_EDITOR_UI'"></ui-editor>
    <create-item v-else-if="activePanel.editorType === 'DYNAMO_EDITOR_CREATE_ITEM'" />
    <sql-editor v-else />
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import ToolBar from '../../../components/tool-bar.vue';
import UiEditor from './components/ui-editor.vue';
import SqlEditor from './components/sql-editor.vue';
import CreateItem from './components/create-item.vue';
import { useTabStore } from '../../../store';

const tabStore = useTabStore();
const { activePanel } = storeToRefs(tabStore);
</script>

<style lang="scss" scoped></style>
