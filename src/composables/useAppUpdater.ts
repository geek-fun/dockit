import type { Update } from '@tauri-apps/plugin-updater';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { ref } from 'vue';
import { useLocalStorage } from '@vueuse/core';
import { useMessageService } from './useMessageService';
import { lang } from '@/lang';

const skipVersion = useLocalStorage('dockit-skip-version', '');
const updateAvailable = ref(false);
const updateInfo = ref<Update | null>(null);
const isChecking = ref(false);
const isDownloading = ref(false);
const downloadPercent = ref<number | null>(null);
const isInstalling = ref(false);
const isRestarting = ref(false);

export function useAppUpdater() {
  const message = useMessageService();

  const checkForUpdates = async (showMessage = false): Promise<Update | null> => {
    if (isChecking.value) return null;

    try {
      isChecking.value = true;
      const update = await check();

      if (update && update.version !== skipVersion.value) {
        updateAvailable.value = true;
        updateInfo.value = update;
        return update;
      }

      if (showMessage) {
        message.success(lang.global.t('version.upToDate'));
      }
      return null;
    } catch (error) {
      console.error('Failed to check for updates:', error);
      if (showMessage) {
        message.error(lang.global.t('version.checkFailed'));
      }
      return null;
    } finally {
      isChecking.value = false;
    }
  };

  const downloadAndInstall = async () => {
    const update = updateInfo.value;
    if (!update) return;

    let receivedBytes = 0;
    let totalLength: number | undefined;

    try {
      isDownloading.value = true;
      downloadPercent.value = null;

      await update.downloadAndInstall(event => {
        if (event.event === 'Started') {
          receivedBytes = 0;
          totalLength = event.data.contentLength;
          downloadPercent.value = totalLength ? 0 : null;
        } else if (event.event === 'Progress') {
          receivedBytes += event.data.chunkLength;
          if (totalLength && totalLength > 0) {
            downloadPercent.value = Math.min(100, Math.round((receivedBytes / totalLength) * 100));
          }
        } else if (event.event === 'Finished') {
          isDownloading.value = false;
          downloadPercent.value = null;
          isInstalling.value = true;
        }
      });

      isRestarting.value = true;
      isInstalling.value = false;

      const relaunchTimeout = setTimeout(() => {
        isRestarting.value = false;
        message.error(lang.global.t('version.updateFailed'));
      }, 5000);

      try {
        await relaunch();
        clearTimeout(relaunchTimeout);
      } catch {
        clearTimeout(relaunchTimeout);
        throw new Error('relaunch failed');
      }
    } catch {
      message.error(lang.global.t('version.updateFailed'));
      isDownloading.value = false;
      downloadPercent.value = null;
      isInstalling.value = false;
      isRestarting.value = false;
    }
  };

  const skipUpdate = () => {
    if (updateInfo.value) {
      skipVersion.value = updateInfo.value.version;
    }
    updateAvailable.value = false;
    updateInfo.value = null;
  };

  const dismissUpdate = () => {
    updateAvailable.value = false;
    updateInfo.value = null;
  };

  return {
    updateAvailable,
    updateInfo,
    isChecking,
    isDownloading,
    downloadPercent,
    isInstalling,
    isRestarting,
    checkForUpdates,
    downloadAndInstall,
    skipUpdate,
    dismissUpdate,
  };
}
