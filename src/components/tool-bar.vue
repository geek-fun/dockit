<template>
  <div class="collection-selector-container">
    <n-select
      :options="options.connection"
      :placeholder="$t('connection.selectConnection')"
      :input-props="inputProps"
      remote
      filterable
      :default-value="established?.name"
      :loading="loadingRef.connection"
      @update:show="isOpen => handleOpen(isOpen, 'CONNECTION')"
      @update:value="value => handleUpdate(value, 'CONNECTION')"
      @search="input => handleSearch(input, 'CONNECTION')"
    />
    <n-select
      :options="options.index"
      :placeholder="$t('connection.selectIndex')"
      :input-props="inputProps"
      remote
      filterable
      :loading="loadingRef.index"
      @update:value="value => handleUpdate(value, 'INDEX')"
      @update:show="isOpen => handleOpen(isOpen, 'INDEX')"
      @search="input => handleSearch(input, 'INDEX')"
    />
    <n-tooltip trigger="hover">
      <template #trigger>
        <n-icon size="20" class="action-load-icon" @click="loadDefaultSnippet">
          <AiStatus />
        </n-icon>
      </template>
      {{ $t('editor.loadDefault') }}
    </n-tooltip>
    <div class="tool-bar-placeholder"></div>
  </div>
</template>

<script setup lang="ts">
import { AiStatus } from '@vicons/carbon';
import { storeToRefs } from 'pinia';
import { useConnectionStore, useTabStore } from '../store';
import { useLang } from '../lang';
import { CustomError, inputProps } from '../common';

const message = useMessage();
const lang = useLang();

const connectionStore = useConnectionStore();
const { fetchConnections, fetchIndices, establishConnection } = connectionStore;
const { connections, establishedIndexNames, established } = storeToRefs(connectionStore);

const tabStore = useTabStore();
const { loadDefaultSnippet } = tabStore;

const loadingRef = ref({ connection: false, index: false });

const filterRef = ref({ connection: '', index: '' });

const options = computed(
  () =>
    ({
      connection: connections.value
        .filter(
          ({ name }) => !filterRef.value.connection || name.includes(filterRef.value.connection),
        )
        .map(({ name }) => ({ label: name, value: name })),
      index: establishedIndexNames.value
        .filter(name => !filterRef.value.index || name.includes(filterRef.value.index))
        .map(name => ({ label: name, value: name })),
    }) as Record<string, { label: string; value: string }[]>,
);

const handleOpen = async (isOpen: boolean, type: 'CONNECTION' | 'INDEX') => {
  if (!isOpen) return;
  if (type === 'CONNECTION') {
    loadingRef.value.connection = true;
    await fetchConnections();
    loadingRef.value.connection = false;
  } else {
    if (!established.value) {
      message.error(lang.t('editor.establishedRequired'), {
        closable: true,
        keepAliveOnHover: true,
        duration: 3000,
      });
      return;
    }
    loadingRef.value.index = true;
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

    loadingRef.value.index = false;
  }
};

const handleUpdate = async (value: string, type: 'CONNECTION' | 'INDEX') => {
  if (type === 'CONNECTION') {
    const connection = connections.value.find(({ name }) => name === value);
    if (!connection) {
      return;
    }
    try {
      await establishConnection(connection);
    } catch (err) {
      const error = err as CustomError;
      message.error(`status: ${error.status}, details: ${error.details}`, {
        closable: true,
        keepAliveOnHover: true,
        duration: 36000000,
      });
    }
  } else {
    connectionStore.selectIndex(value);
  }
};

const handleSearch = async (input: string, type: 'CONNECTION' | 'INDEX') => {
  if (type === 'CONNECTION') {
    filterRef.value.connection = input;
  } else {
    filterRef.value.index = input;
  }
};
</script>

<style lang="scss" scoped>
.collection-selector-container {
  width: 100%;
  height: 45px;
  line-height: 40px;
  display: flex;
  align-items: start;
  border-right: 1px solid var(--border-color);

  .action-load-icon {
    cursor: pointer;
    padding: 0;
    line-height: 50px;
  }

  :deep(.n-select) {
    flex: 1;

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

  .tool-bar-placeholder {
    flex-grow: 3;
  }
}
</style>
