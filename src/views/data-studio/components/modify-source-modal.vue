<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[500px]">
      <DialogHeader>
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 bg-muted rounded-xl border border-border flex items-center justify-center shrink-0"
          >
            <span class="i-carbon-data-base h-5 w-5" />
          </div>
          <div>
            <DialogTitle>{{ $t('dataStudio.modifySource.title') }}</DialogTitle>
            <p class="text-sm text-muted-foreground mt-0.5">{{ source?.name }}</p>
          </div>
        </div>
      </DialogHeader>
      <div class="py-4">
        <div class="border border-border rounded-xl overflow-hidden">
          <div class="px-4 py-3 flex items-center gap-2 border-b border-border bg-muted/40">
            <span class="i-carbon-security h-4 w-4 shrink-0" />
            <p class="font-semibold text-sm">
              {{ $t('dataStudio.modifySource.accessPermissions') }}
            </p>
          </div>
          <div class="grid grid-cols-2 gap-2 p-3 border-b border-border">
            <button
              :class="['mode-btn', localPermissionsMode === 'Ask' && 'mode-btn--active']"
              @click="localPermissionsMode = 'Ask'"
            >
              <span class="i-carbon-view h-4 w-4" />
              <span>{{ $t('dataStudio.modifySource.modeDefault') }}</span>
            </button>
            <button
              :class="['mode-btn', localPermissionsMode === 'Auto' && 'mode-btn--active']"
              @click="localPermissionsMode = 'Auto'"
            >
              <span class="i-carbon-unlocked h-4 w-4" />
              <span>{{ $t('dataStudio.modifySource.modeFull') }}</span>
            </button>
          </div>
          <div class="flex gap-2 px-4 py-3">
            <span class="i-carbon-information h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
            <p class="text-xs text-muted-foreground leading-relaxed">
              {{
                localPermissionsMode === 'Ask'
                  ? $t('dataStudio.modifySource.modeDefaultDesc')
                  : $t('dataStudio.modifySource.modeFullDesc')
              }}
            </p>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="$emit('update:open', false)">
          {{ $t('dialogOps.cancel') }}
        </Button>
        <Button @click="handleSave">
          {{ $t('dataStudio.modifySource.saveChanges') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
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

const localPermissionsMode = ref<'Ask' | 'Auto'>('Ask');

watch(
  () => props.open,
  newVal => {
    if (newVal && props.source) {
      localPermissionsMode.value = props.source.permissionsMode ?? 'Ask';
    }
  },
);

const permissionsFromMode = (mode: 'Ask' | 'Auto') =>
  mode === 'Auto'
    ? { read: true, create: true, update: true, delete: true }
    : { read: true, create: false, update: false, delete: false };

const handleSave = () => {
  if (props.connectionId === undefined) return;
  const source = dataStudioStore.getSourceById(props.connectionId);
  if (!source) return;
  const index = dataStudioStore.connectedSources.indexOf(source);
  dataStudioStore.updateSource(index, {
    permissions: permissionsFromMode(localPermissionsMode.value),
    permissionsMode: localPermissionsMode.value,
  });
  emit('update:open', false);
};
</script>

<style scoped>
.mode-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid hsl(var(--border));
  background: transparent;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}

.mode-btn:hover {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}

.mode-btn--active {
  background: hsl(var(--primary) / 0.08);
  border-color: hsl(var(--primary) / 0.4);
  color: hsl(var(--primary));
}
</style>
