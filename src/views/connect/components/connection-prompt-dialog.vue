<template>
  <Dialog :open="visible" @update:open="onOpenChange">
    <DialogContent class="sm:max-w-[560px]" :show-close="false">
      <DialogHeader>
        <DialogTitle>{{ $t('connection.prompt.title') }}</DialogTitle>
        <button
          class="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
          aria-label="Close"
          @click="close"
        >
          <X class="h-4 w-4" />
        </button>
      </DialogHeader>

      <div class="space-y-4">
        <p class="text-sm text-muted-foreground">{{ $t('connection.prompt.description') }}</p>
        <textarea
          v-model="draft"
          class="prompt-textarea"
          autocomplete="off"
          :placeholder="$t('connection.prompt.placeholder')"
        />
      </div>

      <DialogFooter class="mt-4 flex justify-between sm:justify-between">
        <div class="left">
          <Button variant="outline" :disabled="!draft.trim()" @click="onClear">
            {{ $t('connection.prompt.clear') }}
          </Button>
        </div>
        <div class="right flex gap-2">
          <Button variant="outline" @click="close">
            {{ $t('dialogOps.cancel') }}
          </Button>
          <Button @click="onSave">{{ $t('dialogOps.confirm') }}</Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { X } from 'lucide-vue-next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const emit = defineEmits<{
  save: [value: string];
}>();

const visible = ref(false);
const draft = ref('');

function show(value?: string) {
  draft.value = value ?? '';
  visible.value = true;
}

function close() {
  visible.value = false;
}

function onOpenChange(open: boolean) {
  visible.value = open;
}

function onClear() {
  draft.value = '';
}

function onSave() {
  emit('save', draft.value);
  close();
}

defineExpose({ show });
</script>

<style scoped>
.prompt-textarea {
  display: flex;
  min-height: 200px;
  max-height: 320px;
  width: 100%;
  border-radius: 0.375rem;
  border: 1px solid hsl(var(--input));
  background-color: hsl(var(--background));
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  resize: vertical;
}
.prompt-textarea:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px hsl(var(--ring));
}
.prompt-textarea::placeholder {
  color: hsl(var(--muted-foreground));
}
</style>
