<template>
  <main class="import-export-container">
    <!-- Content Layout -->
    <div class="content-layout">
      <!-- Left: Steps Container -->
      <div class="steps-container">
        <!-- Segmented Control Switch -->
        <div class="mode-switch-wrapper">
          <div class="segmented-control">
            <label :class="['segment-label', { active: activeMode === 'import' }]">
              <span class="segment-text">{{ $t('importExport.import') }}</span>
              <input
                v-model="activeMode"
                class="segment-input"
                name="mode"
                type="radio"
                value="import"
              />
            </label>
            <label :class="['segment-label', { active: activeMode === 'export' }]">
              <span class="segment-text">{{ $t('importExport.export') }}</span>
              <input
                v-model="activeMode"
                class="segment-input"
                name="mode"
                type="radio"
                value="export"
              />
            </label>
          </div>
        </div>

        <!-- Steps Content -->
        <div class="steps-content">
          <!-- Export Steps -->
          <template v-if="activeMode === 'export'">
            <SourceScope />
            <SchemaStructure />
            <TargetOutput />
          </template>

          <!-- Import Steps -->
          <template v-else>
            <ImportSourceScope />
            <ImportSchemaStructure />
            <ImportTargetOutput />
          </template>
        </div>
      </div>

      <!-- Right: Execution Panel -->
      <div class="execution-container">
        <ExecutionPanel v-if="activeMode === 'export'" />
        <ImportExecutionPanel v-else />
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import SourceScope from './components/source-scope.vue';
import SchemaStructure from './components/schema-structure.vue';
import TargetOutput from './components/target-output.vue';
import ExecutionPanel from './components/execution-panel.vue';
import ImportSourceScope from './components/import-source-scope.vue';
import ImportSchemaStructure from './components/import-schema-structure.vue';
import ImportTargetOutput from './components/import-target-output.vue';
import ImportExecutionPanel from './components/import-execution-panel.vue';

const activeMode = ref('import');
</script>

<style lang="scss" scoped>
.import-export-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-color);
}

.content-layout {
  display: flex;
  gap: 24px;
  flex: 1;
  min-height: 0;
  padding: 16px 24px;
  box-sizing: border-box;
}

.steps-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  padding-right: 8px;

  /* Hide scrollbar */
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */

  &::-webkit-scrollbar {
    display: none; /* Chrome, Safari, Opera */
  }

  .mode-switch-wrapper {
    display: flex;
    justify-content: flex-start;

    .segmented-control {
      display: flex;
      height: 29px;
      width: 220px;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background-color: var(--bg-color);
      border: 1px solid var(--border-color);
      padding: 3px;
      gap: 3px;

      .segment-label {
        display: flex;
        cursor: pointer;
        height: 100%;
        flex: 1;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        padding: 0 8px;
        font-size: 13px;
        font-weight: 500;
        transition: all 0.2s ease;
        color: var(--gray-color);

        &:hover {
          color: var(--text-color);
        }

        &.active {
          background: var(--card-bg-color);
          box-shadow:
            0 1px 3px 0 rgba(0, 0, 0, 0.1),
            0 1px 2px 0 rgba(0, 0, 0, 0.06);
          color: var(--theme-color);
          font-weight: 700;
        }

        .segment-text {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .segment-input {
          display: none;
        }
      }
    }
  }

  .steps-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
}

.execution-container {
  width: 300px;
  flex-shrink: 0;
}
</style>
