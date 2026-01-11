<template>
  <n-modal v-model:show="showModal" :mask-closable="false" :close-on-esc="false">
    <n-card
      style="width: 500px"
      role="dialog"
      :bordered="false"
      class="connecting-modal-card"
    >
      <template #header>
        <n-icon size="24" @click="handleCancel" class="close-icon">
          <Close />
        </n-icon>
      </template>
      <div class="modal-content">
        <div class="loading-container">
          <n-spin size="large" />
        </div>
        <div class="connecting-text">
          {{ $t('connection.connecting', { name: connectionName }) }}
        </div>
        <div class="connecting-subtext">
          {{ $t('connection.connectingSubtext') }}
        </div>
        <div class="button-container">
          <n-button @click="handleCancel" secondary>
            {{ $t('dialogOps.cancel') }}
          </n-button>
        </div>
      </div>
    </n-card>
  </n-modal>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Close } from '@vicons/carbon';

const showModal = ref(false);
const connectionName = ref('');
const cancelCallback = ref<(() => void) | null>(null);

const show = (name: string, onCancel: () => void) => {
  connectionName.value = name;
  cancelCallback.value = onCancel;
  showModal.value = true;
};

const hide = () => {
  showModal.value = false;
  connectionName.value = '';
  cancelCallback.value = null;
};

const handleCancel = () => {
  if (cancelCallback.value) {
    cancelCallback.value();
  }
  hide();
};

defineExpose({
  show,
  hide,
});
</script>

<style lang="scss" scoped>
.connecting-modal-card {
  background-color: var(--bg-color);
  
  :deep(.n-card-header) {
    border-bottom: none;
    padding: 16px;
    position: relative;
  }

  .close-icon {
    cursor: pointer;
    position: absolute;
    right: 16px;
    top: 16px;
  }

  .modal-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px 0;

    .loading-container {
      margin-bottom: 32px;
    }

    .connecting-text {
      font-size: 18px;
      font-weight: 500;
      color: var(--text-color);
      margin-bottom: 12px;
      text-align: center;
    }

    .connecting-subtext {
      font-size: 14px;
      color: var(--text-color-secondary);
      margin-bottom: 32px;
      text-align: center;
    }

    .button-container {
      width: 100%;
      display: flex;
      justify-content: center;

      .n-button {
        min-width: 100px;
      }
    }
  }
}
</style>
