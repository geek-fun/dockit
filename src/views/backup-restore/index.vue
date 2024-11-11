<template>
  <main>
    <n-tabs type="segment" animated>
      <n-tab-pane name="backup" :tab="$t('backup.backup')">
        <Backup />
      </n-tab-pane>
      <n-tab-pane name="restore" :tab="$t('backup.restore')">
        <div>
          <div class="backup-panel-container">
            <n-card title="source">
              <n-upload
                multiple
                directory-dnd
                action="https://www.mocky.io/v2/5e4bafc63100007100d8b70f"
                :max="5"
              >
                <n-upload-dragger>
                  <div style="margin-bottom: 12px">
                    <n-icon size="48" :depth="3">
                      <FileStorage />
                    </n-icon>
                  </div>
                  <n-text style="font-size: 16px">
                    {{ $t('backup.restoreSourceDesc') }}
                  </n-text>
                </n-upload-dragger>
              </n-upload>
            </n-card>
            <n-icon size="48">
              <DocumentExport />
            </n-icon>
            <n-card title="target"></n-card>
          </div>
        </div>
      </n-tab-pane>
    </n-tabs>
  </main>
</template>

<script setup lang="ts">
import { DocumentExport, FileStorage } from '@vicons/carbon';
import Backup from './components/backup.vue';
</script>

<style lang="scss" scoped>
.backup-panel-container {
  display: flex;
  justify-content: space-around;
  margin: 10px 20px;

  .backup-action-container {
    display: flex;
    flex-direction: column;
    justify-content: center;
    margin: 10px;

    & > i {
      cursor: pointer;
      margin: 10px 5px;

      &:hover {
        color: var(--theme-color-hover);
      }
    }
  }
}
</style>
