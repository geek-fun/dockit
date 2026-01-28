<template>
  <div class="tool-bar-path-breadcrumb">
    <template v-if="props.clickable && breadCrumbPath">
      <template v-for="(path, index) in breadCrumbPath?.split('/')" :key="index">
        <span class="breadcrumb-separator" v-if="index !== 0">/</span>
        <span class="breadcrumb-item clickable" @click="handleBreadcrumb(index)">
          <Icon v-if="index !== 0" :component="Folder" class="breadcrumb-icon" />
          {{ path }}
        </span>
      </template>
    </template>
    <template v-else>
      <template v-for="(path, index) in breadCrumbPath?.split('/')" :key="index">
        <span class="breadcrumb-separator" v-if="index !== 0">/</span>
        <span class="breadcrumb-item">
          {{ path }}
        </span>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { Folder } from '@vicons/carbon';
import { useFileStore } from '../store';
import { storeToRefs } from 'pinia';
import { CustomError } from '../common';
import { useMessageService } from '@/composables';
import { Icon } from '@/components/ui/icon';

const fileStore = useFileStore();
const { changeDirectory } = fileStore;
const { breadCrumbPath } = storeToRefs(fileStore);

const props = defineProps({ clickable: { type: Boolean, default: true } });

const message = useMessageService();

const handleBreadcrumb = async (index: number) => {
  const subPath = breadCrumbPath?.value
    ?.split('/')
    .splice(0, index + 1)
    .join('/');

  try {
    await changeDirectory(subPath);
  } catch (error) {
    const { status, details } = error as CustomError;
    message.error(`status: ${status}, details: ${details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3600,
    });
  }
};
</script>

<style scoped>
.tool-bar-path-breadcrumb {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  overflow: scroll;
  scrollbar-width: none; /* For Firefox */
  -ms-overflow-style: none; /* For Internet Explorer and Edge */
}

.tool-bar-path-breadcrumb::-webkit-scrollbar {
  display: none; /* For Chrome, Safari, and Opera */
}

.breadcrumb-item {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}

.breadcrumb-item.clickable {
  cursor: pointer;
}

.breadcrumb-item.clickable:hover {
  text-decoration: underline;
}

.breadcrumb-separator {
  margin: 0 4px;
  color: var(--foreground);
  opacity: 0.5;
}

.breadcrumb-icon {
  margin-right: 4px;
}
</style>
