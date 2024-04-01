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
          <n-button type="primary" secondary @click="download">{{
            $t('version.download')
          }}</n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { NModal, NButton } from 'naive-ui';
import { useAppStore } from '../store';

const platforms: { [key: string]: string } = {
  macos_x86: 'universal.dmg',
  macos_arm: 'universal.dmg',
  windows_x86: 'x64.Setup.exe',
  windows_arm: 'arm64.Setup.exe',
  linux_x86: '_amd64.deb',
  linux_arm: '_arm64.deb',
};
const appStore = useAppStore();
const { skipVersion } = storeToRefs(appStore);

const dialogVisible = ref(false);
const version = ref('');
const link = ref({ name: '', url: '' });

const download = () => {
  window.electronAPI.openLink(link.value.url);
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
  const { architecture, platform } = await window.navigator.userAgentData.getHighEntropyValues([
    'architecture',
  ]);
  const { assets } = await getLatestReleaseInfo();

  return assets.find(item =>
    item.name.endsWith(platforms[`${platform}_${architecture}`.toLowerCase()]),
  );
};

onMounted(async () => {
  try {
    const { version: newVersion } = await getLatestReleaseInfo();
    const { version: currentVersion } = await window.electronAPI.versions();
    if (newVersion.endsWith(currentVersion) && skipVersion.value !== newVersion) return;

    const assetsLink = await getLatestLink();
    if (link) {
      version.value = newVersion;
      link.value = assetsLink;
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
