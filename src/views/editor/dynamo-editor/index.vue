<template>
  <div class="dynamo-editor">
    <tool-bar
      type="DYNAMO_EDITOR"
      @insert-partiql-sample="handleInsertPartiqlSample"
      @execute-partiql-query="handleExecutePartiqlQuery"
    />
    <ui-editor v-if="activePanel.editorType === 'DYNAMO_EDITOR_UI'"></ui-editor>
    <create-item v-else-if="activePanel.editorType === 'DYNAMO_EDITOR_CREATE_ITEM'" />
    <sql-editor v-else :ref="el => setSqlEditorRef(el)" />
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

let sqlEditorRef: InstanceType<typeof SqlEditor> | null = null;

const setSqlEditorRef = (el: any) => {
  sqlEditorRef = el;
};

const handleInsertPartiqlSample = (key: string) => {
  if (sqlEditorRef) {
    sqlEditorRef.insertSampleQuery(key);
  }
};

const handleExecutePartiqlQuery = () => {
  if (sqlEditorRef) {
    sqlEditorRef.executeQuery();
  }
};
</script>

<style lang="scss" scoped></style>
