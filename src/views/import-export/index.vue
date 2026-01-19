<template>
  <main class="import-export-container">
    <n-tabs type="segment" animated v-model:value="activeTab">
      <n-tab-pane name="export" :tab="$t('importExport.export')">
        <div class="export-container">
          <div class="export-header">
            <n-breadcrumb>
              <n-breadcrumb-item>{{ $t('export.databaseTools') }}</n-breadcrumb-item>
              <n-breadcrumb-item>{{ $t('export.dataExport') }}</n-breadcrumb-item>
            </n-breadcrumb>
          </div>

          <div class="export-content">
            <div class="export-main">
              <!-- Step 1: Source & Scope -->
              <SourceScope />

              <!-- Step 2: Schema & Structure -->
              <SchemaStructure />

              <!-- Step 3: Target & Output -->
              <TargetOutput />
            </div>

            <div class="export-sidebar">
              <!-- Execution Panel -->
              <ExecutionPanel />
            </div>
          </div>
        </div>
      </n-tab-pane>
      <n-tab-pane name="import" :tab="$t('importExport.import')">
        <Restore />
      </n-tab-pane>
    </n-tabs>
  </main>
</template>

<script setup lang="ts">
import Restore from './components/restore.vue';
import SourceScope from './components/source-scope.vue';
import SchemaStructure from './components/schema-structure.vue';
import TargetOutput from './components/target-output.vue';
import ExecutionPanel from './components/execution-panel.vue';

const activeTab = ref('export');
</script>

<style lang="scss" scoped>
.import-export-container {
  height: 100%;
  display: flex;
  flex-direction: column;

  :deep(.n-tabs) {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  :deep(.n-tabs-pane-wrapper) {
    flex: 1;
    overflow: hidden;
  }

  :deep(.n-tab-pane) {
    height: 100%;
    overflow: auto;
  }
}

.export-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px 24px;
  box-sizing: border-box;
  overflow: auto;

  .export-header {
    margin-bottom: 16px;
  }

  .export-content {
    display: flex;
    gap: 24px;
    flex: 1;
    min-height: 0;

    .export-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow-y: auto;
      padding-right: 8px;
    }

    .export-sidebar {
      width: 300px;
      flex-shrink: 0;
    }
  }
}
</style>
