<template>
  <div v-if="dialogVisible" class="version-detect-container">
    <div class="version-card">
      <div class="version-card-header">
        <div class="version-icon">
          <svg
            class="version-icon-svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 4v13m0 0l-5-5m5 5l5-5M5 21h14"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <div class="version-text">
          <div class="version-title">{{ $t('version.newVersion') }}</div>
          <div class="version-message">{{ $t('version.readyMessage', { version }) }}</div>
        </div>
        <button class="close-button" :disabled="installing" @click="later">
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M9 3L3 9M3 3l6 6"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>
      <div class="version-divider"></div>
      <div class="version-card-footer">
        <button class="skip-button" :disabled="installing" @click="skip">
          {{ $t('version.skip') }}
        </button>
        <div class="action-buttons">
          <Button
            variant="outline"
            size="sm"
            class="version-action-button outline"
            :disabled="installing"
            @click="later"
          >
            {{ $t('version.later') }}
          </Button>
          <Button
            variant="default"
            size="sm"
            class="version-action-button primary"
            :disabled="installing"
            @click="installUpdate"
          >
            {{ installButtonLabel }}
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { check, type Update, type DownloadEvent } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { storeToRefs } from 'pinia';
import { useAppStore } from '../store';
import { useMessageService } from '@/composables';
import { Button } from '@/components/ui/button';
import { lang } from '@/lang';

const appStore = useAppStore();
const { skipVersion } = storeToRefs(appStore);
const message = useMessageService();

const dialogVisible = ref(false);
const version = ref('');
const installing = ref(false);
const downloading = ref(false);
const downloadPercent = ref<number | null>(null);
const restarting = ref(false);
let pendingUpdate: Update | null = null;

const installButtonLabel = computed(() => {
  if (restarting.value) return lang.global.t('version.restarting');
  if (downloadPercent.value !== null)
    return lang.global.t('version.downloading', { percent: downloadPercent.value });
  if (downloading.value) return lang.global.t('version.downloadingIndeterminate');
  if (installing.value) return lang.global.t('version.installing');
  return lang.global.t('version.updateNow');
});

const installUpdate = async () => {
  if (!pendingUpdate) return;
  installing.value = true;
  downloadPercent.value = null;
  let receivedBytes = 0;
  let totalLength: number | undefined;
  try {
    await pendingUpdate.downloadAndInstall((event: DownloadEvent) => {
      if (event.event === 'Started') {
        receivedBytes = 0;
        totalLength = event.data.contentLength;
        downloading.value = true;
        downloadPercent.value = totalLength ? 0 : null;
      } else if (event.event === 'Progress') {
        receivedBytes += event.data.chunkLength;
        if (totalLength && totalLength > 0) {
          downloadPercent.value = Math.min(100, Math.round((receivedBytes / totalLength) * 100));
        }
      } else if (event.event === 'Finished') {
        downloading.value = false;
        downloadPercent.value = null;
      }
    });
    restarting.value = true;
    const relaunchTimeout = setTimeout(() => {
      if (restarting.value) {
        restarting.value = false;
        installing.value = false;
        message.error(lang.global.t('version.updateFailed'));
      }
    }, 5000);
    try {
      await relaunch();
    } finally {
      clearTimeout(relaunchTimeout);
    }
  } catch {
    message.error(lang.global.t('version.updateFailed'));
    installing.value = false;
    downloading.value = false;
    downloadPercent.value = null;
    restarting.value = false;
  }
};

const later = () => {
  dialogVisible.value = false;
};

const skip = () => {
  skipVersion.value = version.value;
  dialogVisible.value = false;
};

onMounted(async () => {
  try {
    const update = await check();
    if (update && update.version !== skipVersion.value) {
      version.value = update.version;
      pendingUpdate = update;
      dialogVisible.value = true;
    }
  } catch {
    // Silent fail for version detection
  }
});
</script>

<style scoped>
.version-detect-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 1000;
}

.version-card {
  width: 420px;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
  overflow: hidden;
}

.version-card-header {
  display: flex;
  align-items: flex-start;
  padding: 20px 20px 16px;
  gap: 12px;
}

.version-icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: #eaf7ee;
  border: 1px solid #cfead7;
}

.version-icon-svg {
  color: #22a559;
}

.version-text {
  flex: 1;
  min-width: 0;
}

.version-title {
  font-weight: 700;
  font-size: 16px;
  color: hsl(var(--foreground));
  margin-bottom: 4px;
}

.version-message {
  font-size: 13px;
  color: #8b94a1;
}

.close-button {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: hsl(var(--muted-foreground));
  border-radius: 8px;
  transition:
    background-color 0.2s,
    color 0.2s;
}

.close-button:hover {
  background-color: hsl(var(--accent));
  color: hsl(var(--foreground));
}

.close-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.version-divider {
  height: 1px;
  background: #eef1f4;
}

.version-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
}

.skip-button {
  padding: 0;
  border: none;
  background: transparent;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
  font-weight: 500;
  transition: color 0.2s;
}

.skip-button:hover {
  color: hsl(var(--foreground));
}

.skip-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.version-action-button {
  min-width: 96px;
  height: 32px;
  padding: 0 14px;
  border-radius: 10px;
  font-weight: 600;
}

.version-action-button.outline {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  color: #1f2937;
  box-shadow: none;
  outline: none;
}

.version-action-button.outline:focus-visible {
  outline: 2px solid #e5e7eb;
  outline-offset: 2px;
}

.version-action-button.primary {
  background: #27ae60;
  border: 1px solid #219653;
  color: #ffffff;
  box-shadow: 0 6px 12px rgba(39, 174, 96, 0.24);
}

.version-action-button.primary:hover {
  background: #239a56;
  border-color: #1f8d4f;
}
</style>
