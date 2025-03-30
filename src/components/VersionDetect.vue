<template>
  <n-modal v-model:show="dialogVisible" :mask-closable="false" class="version-detect-modal">
    <n-card
      style="width: 400px"
      :title="$t('version.newVersion')"
      :bordered="false"
      role="dialog"
      aria-modal="true"
    >
      <div class="version-info-box">
        <span>{{ $t('version.message') }} ({{ version }})?</span>
      </div>
      <template #footer>
        <div class="action-button-group">
          <n-button type="warning" secondary @click="skip">{{ $t('version.skip') }}</n-button>
          <n-button type="tertiary" secondary @click="later">{{ $t('version.later') }}</n-button>
          <n-button type="primary" secondary @click="download"
            >{{ $t('version.download') }}
          </n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup lang="ts">
import { getVersion } from '@tauri-apps/api/app';
import { open } from '@tauri-apps/plugin-shell';
import { storeToRefs } from 'pinia';
import { useAppStore } from '../store';

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
    .then(res => res.json())
    .catch(err => console.error(err));
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
    if (link) {
      version.value = newVersion;
      link.value = { name: newVersion, url: assetsLink } as { name: string; url: string };
      dialogVisible.value = true;
    }
  } catch (error) {
    console.error('VersionDetect error:', error);
  }
});
</script>

<style scoped lang="scss">
.version-detect-modal {
  position: fixed;
  right: 10px;
  bottom: 10px;
  width: 400px; /* adjust as needed */
  .version-info-box {
    margin: 20px 0;
  }

  .action-button-group {
    margin-left: 50px;
    display: flex;
    justify-content: space-between;
  }
}
</style>
