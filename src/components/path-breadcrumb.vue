<template>
  <n-breadcrumb class="tool-bar-path-breadcrumb">
    <n-breadcrumb-item
      v-for="(path, index) in breadCrumbPath?.split('/')"
      v-if="props.clickable && breadCrumbPath"
      @click="handleBreadcrumb(index)"
    >
      <n-icon v-if="index !== 0" :component="Folder" />
      {{ path }}
    </n-breadcrumb-item>
    <n-breadcrumb-item
      v-for="path in breadCrumbPath?.split('/')"
      v-else
      :clickable="props.clickable"
    >
      {{ path }}
    </n-breadcrumb-item>
  </n-breadcrumb>
</template>

<script setup lang="ts">
import { Folder } from '@vicons/carbon';
import { useFileStore } from '../store';
import { storeToRefs } from 'pinia';
import { CustomError } from '../common';

const fileStore = useFileStore();
const { changeDirectory } = fileStore;
const { breadCrumbPath } = storeToRefs(fileStore);

const props = defineProps({ clickable: { type: Boolean, default: true } });

const message = useMessage();

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

<style lang="scss" scoped>
.tool-bar-path-breadcrumb {
  overflow: scroll;
  scrollbar-width: none; /* For Firefox */
  -ms-overflow-style: none; /* For Internet Explorer and Edge */

  &::-webkit-scrollbar {
    display: none; /* For Chrome, Safari, and Opera */
  }

  :deep(.n-breadcrumb-item__separator) {
    margin: 0 1px;
  }
}
</style>
