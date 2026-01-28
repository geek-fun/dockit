<template>
  <Dialog v-model:open="dialogVisible">
    <DialogContent
      class="version-detect-modal sm:max-w-[400px]"
      :show-close="false"
      @interact-outside="(event: Event) => event.preventDefault()"
    >
      <DialogHeader>
        <DialogTitle>{{ $t('version.newVersion') }}</DialogTitle>
      </DialogHeader>
      <div class="version-info-box">
        <span>{{ $t('version.message') }} ({{ version }})?</span>
      </div>
      <DialogFooter>
        <div class="action-button-group">
          <Button variant="outline" @click="skip">{{ $t('version.skip') }}</Button>
          <Button variant="secondary" @click="later">{{ $t('version.later') }}</Button>
          <Button variant="default" @click="download">
            {{ $t('version.download') }}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { getVersion } from '@tauri-apps/api/app';
import { open } from '@tauri-apps/plugin-shell';
import { storeToRefs } from 'pinia';
import { useAppStore } from '../store';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
    if (link.value) {
      version.value = newVersion;
      link.value = { name: newVersion, url: assetsLink } as { name: string; url: string };
      dialogVisible.value = true;
    }
  } catch (error) {
    console.error('VersionDetect error:', error);
  }
});
</script>

<style scoped>
.version-info-box {
  margin: 20px 0;
}

.action-button-group {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
