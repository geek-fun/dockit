<template>
  <Dialog :open="showModal" @update:open="handleClose">
    <DialogContent class="about-dialog">
      <div class="dialog-content">
        <div class="app-icon">
          <img src="/dockit.png" alt="DocKit" class="icon-image" />
        </div>
        <div class="app-info">
          <h2 class="app-name">{{ appName }}</h2>
          <p class="app-version">Version {{ version }}</p>
        </div>
        <div class="app-description">
          <p>A modern cross-platform NoSQL/NewSQL GUI client.</p>
          <p>Supports Elasticsearch, OpenSearch, and DynamoDB.</p>
        </div>
        <div class="app-links">
          <a href="https://github.com/geek-fun/dockit" target="_blank" class="link">
            <Github class="w-4 h-4" />
            <span>GitHub</span>
          </a>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { getName, getVersion } from '@tauri-apps/api/app';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Github } from 'lucide-vue-next';

const showModal = ref(false);
const appName = ref('DocKit');
const version = ref('');

const show = async () => {
  try {
    appName.value = await getName();
    version.value = await getVersion();
  } catch {
    appName.value = 'DocKit';
    version.value = '';
  }
  showModal.value = true;
};

const hide = () => {
  showModal.value = false;
};

const handleClose = (open: boolean) => {
  if (!open) {
    hide();
  }
};

defineExpose({
  show,
  hide,
});
</script>

<style scoped>
.about-dialog {
  width: 320px;
  padding: 24px;
}

.dialog-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.app-icon {
  margin-bottom: 16px;
}

.icon-image {
  width: 80px;
  height: 80px;
  border-radius: 16px;
}

.app-info {
  margin-bottom: 16px;
}

.app-name {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 4px 0;
  color: hsl(var(--foreground));
}

.app-version {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  margin: 0;
}

.app-description {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  margin-bottom: 16px;
  line-height: 1.5;
}

.app-description p {
  margin: 0;
}

.app-links {
  display: flex;
  gap: 16px;
}

.link {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: hsl(var(--primary));
  text-decoration: none;
  transition: opacity 0.2s;
}

.link:hover {
  opacity: 0.8;
}
</style>
