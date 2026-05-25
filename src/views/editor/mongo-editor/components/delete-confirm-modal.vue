<template>
  <Dialog :open="show" @update:open="handleOpenChange">
    <DialogContent class="sm:max-w-[400px]" :show-close="false">
      <DialogHeader>
        <DialogTitle>{{ lang.t('dialogOps.warning') }}</DialogTitle>
        <button
          class="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
          aria-label="Close"
          @click="handleCancel"
        >
          <X class="h-5 w-5" />
        </button>
      </DialogHeader>

      <div class="modal-content">
        <Alert v-if="resultType === 'success' && resultMessage" variant="success" class="mb-4">
          <AlertDescription>{{ lang.t('editor.mongo.deleteDocumentSuccess') }}</AlertDescription>
        </Alert>
        <Alert v-else-if="resultMessage" variant="destructive" class="mb-4">
          <AlertDescription class="flex items-center justify-between">
            {{ resultMessage }}
            <button class="ml-2 hover:opacity-70 cursor-pointer" @click="resultMessage = ''">
              <X class="w-4 h-4" />
            </button>
          </AlertDescription>
        </Alert>
        <p v-else>{{ lang.t('editor.mongo.deleteDocumentConfirm') }}</p>
      </div>

      <DialogFooter>
        <Button variant="outline" :disabled="loading" @click="handleCancel">
          {{ lang.t('dialogOps.cancel') }}
        </Button>
        <Button
          v-if="resultType === 'error'"
          variant="destructive"
          :disabled="loading"
          @click="handleRetry"
        >
          <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
          {{ lang.t('dialogOps.retry') }}
        </Button>
        <Button
          v-else-if="!resultMessage"
          variant="destructive"
          :disabled="loading"
          @click="handleConfirm"
        >
          <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
          {{ lang.t('dialogOps.delete') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { X, Loader2 } from 'lucide-vue-next';
import { useLang } from '../../../../lang';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

const props = defineProps<{
  show: boolean;
  documentId?: string;
}>();

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  (e: 'confirm'): void;
}>();

const lang = useLang();
const loading = ref(false);
const resultMessage = ref('');
const resultType = ref<'success' | 'error' | ''>('');

watch(
  () => props.show,
  open => {
    if (open) {
      resultMessage.value = '';
      resultType.value = '';
      loading.value = false;
    }
  },
);

const handleOpenChange = (open: boolean) => {
  if (!open) handleCancel();
};

const handleCancel = () => {
  if (!loading.value) emit('update:show', false);
};

const handleConfirm = () => emit('confirm');

const handleRetry = () => {
  resultMessage.value = '';
  resultType.value = '';
  emit('confirm');
};

const setLoading = (value: boolean) => {
  loading.value = value;
};

const setResult = (type: 'success' | 'error', message: string) => {
  resultType.value = type;
  resultMessage.value = message;
  loading.value = false;
};

defineExpose({ setLoading, setResult });
</script>
