<template>
  <div class="es-editor">
    <tool-bar ref="toolBarRef" type="ES_EDITOR" @insert-sample-query="handleInsertSampleQuery" />
    <div v-if="isBrowseMode" class="es-editor-browse">
      <IndexDocsBrowser
        embedded
        enable-search-filters
        :connection="searchConnection"
        :index-name="activeIndexName"
      />
    </div>
    <query-editor v-else ref="queryEditorRef" class="es-editor-query" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import ToolBar from '../../../components/tool-bar.vue';
import QueryEditor from './components/query-editor.vue';
import IndexDocsBrowser from '../../manage/components/index-docs-browser.vue';
import { isSearchConnection, SearchConnection, useTabStore } from '../../../store';

const tabStore = useTabStore();
const { activePanel } = storeToRefs(tabStore);

const toolBarRef = ref<InstanceType<typeof ToolBar>>();
const queryEditorRef = ref<InstanceType<typeof QueryEditor>>();

const isBrowseMode = computed(() => activePanel.value.editorType === 'ES_EDITOR_BROWSE');

const searchConnection = computed(() => {
  const conn = activePanel.value.connection;
  return conn && isSearchConnection(conn) ? (conn as SearchConnection) : undefined;
});

const activeIndexName = computed(() => searchConnection.value?.activeIndex?.index ?? '');

const handleInsertSampleQuery = (query: string) => {
  queryEditorRef.value?.insertSampleQuery(query);
};

defineExpose({
  insertSampleQuery: (query: string) => queryEditorRef.value?.insertSampleQuery(query),
  toggleShortcutsDialog: () => toolBarRef.value?.toggleShortcutsDialog(),
});
</script>

<style scoped>
.es-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.es-editor-browse {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.es-editor-query {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
