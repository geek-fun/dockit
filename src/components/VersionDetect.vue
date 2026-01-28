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
            <rect
              x="7"
              y="4"
              width="10"
              height="16"
              rx="2"
              stroke="currentColor"
              stroke-width="1.6"
            />
            <path d="M12 8v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            <path
              d="M9.5 12.5L12 15l2.5-2.5"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <circle cx="12" cy="17" r="0.8" fill="currentColor" />
          </svg>
        </div>
        <div class="version-text">
          <div class="version-title">{{ $t('version.newVersion') }}</div>
          <div class="version-message">A newer version ({{ version }}) is ready for you.</div>
        </div>
        <button class="close-button" @click="later">
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
        <button class="skip-button" @click="skip">{{ $t('version.skip') }}</button>
        <div class="action-buttons">
          <Button variant="outline" size="sm" class="version-action-button outline" @click="later">
            {{ $t('version.later') }}
          </Button>
          <Button
            variant="default"
            size="sm"
            class="version-action-button primary"
            @click="download"
          >
            Download Now
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
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
  const data = await fetch('https://api.github.com/repos/geek-fun/dockit/releases/latest').then(
    res => res.json(),
  );
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
  cursor: pointer;
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
  cursor: pointer;
  transition: color 0.2s;
}

.skip-button:hover {
  color: hsl(var(--foreground));
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.action-buttons :deep(button) {
  cursor: pointer;
}

.version-action-button {
  min-width: 96px;
  height: 32px;
  padding: 0 14px;
  border-radius: 10px;
  font-weight: 600;
}

.version-action-button.outline {
  background: #ffffff !important;
  border: 1px solid #e5e7eb !important;
  color: #1f2937 !important;
  box-shadow: none !important;
}

.version-action-button.primary {
  background: #27ae60 !important;
  border: 1px solid #219653 !important;
  color: #ffffff !important;
  box-shadow: 0 6px 12px rgba(39, 174, 96, 0.24) !important;
}

.version-action-button.primary:hover {
  background: #239a56;
  border-color: #1f8d4f;
}
</style>
