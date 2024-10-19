<template>
  <div class="collection-selector-container">
    <n-select
      :options="options"
      :placeholder="$t('connection.selectIndex')"
      remote
      filterable
      :loading="loadingRef"
      @update:value="handleUpdateValue"
      @update:show="handleOpen"
    />
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useConnectionStore } from '../../../store';
import { useLang } from '../../../lang';
import { CustomError } from '../../../common';

const message = useMessage();
const lang = useLang();

const connectionStore = useConnectionStore();
const { establishedIndexNames, established } = storeToRefs(connectionStore);
const { fetchIndices } = connectionStore;

const loadingRef = ref(false);
// build options list
const options = computed(() =>
  establishedIndexNames.value.map(name => ({ label: name, value: name })),
);

const handleUpdateValue = (value: string) => {
  connectionStore.selectIndex(value);
};

const handleOpen = async (isOpen: boolean) => {
  if (!isOpen) return;
  if (!established.value) {
    message.error(lang.t('editor.establishedRequired'), {
      closable: true,
      keepAliveOnHover: true,
      duration: 3000,
    });
    return;
  }
  loadingRef.value = true;
  try {
    await fetchIndices();
  } catch (err) {
    message.error(
      `status: ${(err as CustomError).status}, details: ${(err as CustomError).details}`,
      {
        closable: true,
        keepAliveOnHover: true,
        duration: 3000,
      },
    );
  }

  loadingRef.value = false;
};
</script>

<style lang="scss" scoped>
.collection-selector-container {
  height: 100%;
  width: 260px;
  display: flex;
  align-items: center;
  border-right: 1px solid var(--border-color);

  :deep(.n-select) {
    .n-base-selection {
      .n-base-selection-label {
        background-color: unset;
      }

      .n-base-selection__border,
      .n-base-selection__state-border {
        border: unset;
      }
    }

    .n-base-selection:hover,
    .n-base-selection--active,
    .n-base-selection--focus {
      .n-base-selection__state-border {
        border: unset;
        box-shadow: unset;
      }
    }
  }
}
</style>
