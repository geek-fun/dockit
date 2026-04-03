<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[440px]">
      <DialogHeader>
        <DialogTitle>{{ $t('dataStudio.detachSource.title') }}</DialogTitle>
      </DialogHeader>
      <div class="py-4">
        <p class="text-sm text-muted-foreground">
          {{ $t('dataStudio.detachSource.message') }}
        </p>
        <div
          v-if="source"
          class="mt-3 flex items-center gap-2 p-3 bg-muted/50 rounded-lg border border-border"
        >
          <span class="i-carbon-data-base h-4 w-4 text-muted-foreground" />
          <span class="text-sm font-medium">{{ source.name }}</span>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="$emit('update:open', false)">
          {{ $t('dialogOps.cancel') }}
        </Button>
        <Button variant="destructive" @click="handleDetach">
          {{ $t('dataStudio.detachSource.confirm') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useDataStudioStore, type ConnectedSource } from '@/store/dataStudioStore';

const props = defineProps<{
  open: boolean;
  source: ConnectedSource | null;
  connectionId: number | undefined;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const dataStudioStore = useDataStudioStore();

const handleDetach = () => {
  if (props.connectionId === undefined) return;
  dataStudioStore.removeSourceById(props.connectionId);
  emit('update:open', false);
};
</script>
