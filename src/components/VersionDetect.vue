<template>
  <div v-if="dialogVisible" class="version-detect-container">
    <div class="version-card">
      <div class="version-card-header">
        <div class="version-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="24" height="24" rx="4" fill="#E8F5E9"/>
            <path d="M12 4L4 8v8l8 4 8-4V8l-8-4z" stroke="#4CAF50" stroke-width="1.5" fill="none"/>
            <path d="M12 12v4M12 8v2" stroke="#4CAF50" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="version-text">
          <div class="version-title">{{ $t('version.newVersion') }}</div>
          <div class="version-message">{{ $t('version.message') }} ({{ version }})</div>
        </div>
        <button class="close-button" @click="later">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="version-card-footer">
        <button class="skip-button" @click="skip">{{ $t('version.skip') }}</button>
        <div class="action-buttons">
          <Button variant="outline" size="sm" @click="later">{{ $t('version.later') }}</Button>
          <Button variant="default" size="sm" @click="download">{{ $t('version.download') }}</Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getVersion } from '@tauri-apps/api/app';
import { open } from '@tauri-apps/plugin-shell';
import { storeToRefs } from 'pinia';
import { useAppStore } from '../store';
import { Button } from '@/components/ui/button';

const appStore = useAppStore();
const { skipVersion } = storeToRefs(appStore);

const dialogVisible = ref(false);
const version = ref('');
const link = ref({ name: '', url: '' });

const download = async () => {
  await open(link.value.url);
  dialogVisible.value = false;
};

const later = () => {
  dialogVisible.value = false;
};

const skip = () => {
  skipVersion.value = version.value;
  dialogVisible.value = false;
};

const getLatestReleaseInfo = async (): Promise<{
  version: string;
  assets: Array<{ name: string; url: string }>;
}> => {
  const data = await fetch('https://api.github.com/repos/geek-fun/dockit/releases/latest')
    .then(res => res.json());
  const assets = data.assets.map((item: { name: string; browser_download_url: string }) => ({
    name: item.name,
    url: item.browser_download_url,
  }));

  return { version: data.tag_name, assets };
};
const getLatestLink = async () => {
  return 'https://dockit.geekfun.club/download.html';
};

onMounted(async () => {
  try {
    const { version: newVersion } = await getLatestReleaseInfo();
    const currentVersion = await getVersion();
    if (newVersion.endsWith(currentVersion) && skipVersion.value !== newVersion) return;

    const assetsLink = await getLatestLink();
    if (link.value) {
      version.value = newVersion;
      link.value = { name: newVersion, url: assetsLink } as { name: string; url: string };
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
  width: 320px;
  background: var(--card-bg-color, #fff);
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
  overflow: hidden;
}

.version-card-header {
  display: flex;
  align-items: flex-start;
  padding: 16px;
  gap: 12px;
}

.version-icon {
  flex-shrink: 0;
}

.version-text {
  flex: 1;
  min-width: 0;
}

.version-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-color, #333);
  margin-bottom: 4px;
}

.version-message {
  font-size: 13px;
  color: var(--gray-color, #666);
}

.close-button {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--gray-color, #999);
  border-radius: 4px;
  transition: background-color 0.2s;
}

.close-button:hover {
  background-color: var(--bg-color, #f5f5f5);
}

.version-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-top: 1px solid var(--border-color, #eee);
}

.skip-button {
  background: transparent;
  border: none;
  color: var(--gray-color, #666);
  font-size: 13px;
  cursor: pointer;
  padding: 0;
}

.skip-button:hover {
  color: var(--text-color, #333);
}

.action-buttons {
  display: flex;
  gap: 8px;
}
</style>
