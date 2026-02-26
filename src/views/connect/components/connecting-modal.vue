<template>
  <Dialog :open="showModal" @update:open="handleDialogOpenChange">
    <DialogContent
      class="connecting-modal-card !p-0"
      @interact-outside="(e: Event) => e.preventDefault()"
      @escape-key-down="(e: Event) => e.preventDefault()"
    >
      <DialogHeader class="modal-header">
        <DialogTitle>&nbsp;</DialogTitle>
      </DialogHeader>
      <div class="modal-content">
        <Alert v-if="errorMessage" variant="destructive" class="alert-container">
          <AlertTitle>{{ $t('connection.connectionError') }}</AlertTitle>
          <AlertDescription>{{ errorMessage }}</AlertDescription>
          <button class="alert-close-btn" @click="errorMessage = ''">
            <X class="w-4 h-4" />
          </button>
        </Alert>
        <div v-if="!errorMessage" class="loading-container">
          <Spinner size="lg" />
        </div>
        <div class="connecting-text">
          {{ $t('connection.connecting', { name: connectionName }) }}
        </div>
        <div v-if="!errorMessage" class="connecting-subtext">
          {{ $t('connection.connectingSubtext') }}
        </div>
      </div>
      <div class="modal-footer">
        <Button v-if="errorMessage" variant="default" @click="handleRetry">
          {{ $t('dialogOps.retry') }}
        </Button>
        <Button :variant="errorMessage ? 'outline' : 'secondary'" @click="handleCancel">
          {{ $t('dialogOps.cancel') }}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { X } from 'lucide-vue-next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

const showModal = ref(false);
const connectionName = ref('');
const errorMessage = ref('');
const cancelCallback = ref<(() => void) | null>(null);
const retryCallback = ref<(() => void) | null>(null);

const show = (name: string, onCancel: () => void, onRetry: () => void) => {
  connectionName.value = name;
  cancelCallback.value = onCancel;
  retryCallback.value = onRetry;
  errorMessage.value = '';
  showModal.value = true;
};

const hide = () => {
  showModal.value = false;
  connectionName.value = '';
  errorMessage.value = '';
  cancelCallback.value = null;
  retryCallback.value = null;
};

const showError = (error: string) => {
  errorMessage.value = error;
};

const handleDialogOpenChange = (open: boolean) => {
  if (!open) {
    handleCancel();
  }
};

const handleCancel = () => {
  if (cancelCallback.value && !errorMessage.value) {
    cancelCallback.value();
  }
  errorMessage.value = '';
  hide();
};

const handleRetry = () => {
  errorMessage.value = '';
  if (retryCallback.value) {
    retryCallback.value();
  }
};

defineExpose({
  show,
  hide,
  showError,
});
</script>

<style scoped>
.connecting-modal-card {
  width: 500px;
  background-color: hsl(var(--background));
}

.modal-header {
  padding: calc(var(--spacing) * 6) calc(var(--spacing) * 6) 0;
}

.modal-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px calc(var(--spacing) * 6) 16px;
}

.alert-container {
  margin-bottom: 24px;
  width: 100%;
  position: relative;
}

.alert-close-btn {
  position: absolute;
  right: 8px;
  top: 8px;
  background: none;
  border: none;
  padding: 4px;
  color: inherit;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.alert-close-btn:hover {
  opacity: 1;
}

.loading-container {
  margin-bottom: 32px;
}

.connecting-text {
  font-size: 18px;
  font-weight: 500;
  color: hsl(var(--foreground));
  margin-bottom: 12px;
  text-align: center;
}

.connecting-subtext {
  font-size: 14px;
  color: hsl(var(--muted-foreground));
  text-align: center;
}

.modal-footer {
  width: 100%;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 8px 8px 8px 16px;
  border-top: 1px solid hsl(var(--border));
}

.modal-footer button {
  min-width: 100px;
}
</style>
