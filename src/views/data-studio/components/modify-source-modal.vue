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
            <p class="text-sm text-muted-foreground mt-0.5">{{ currentSource?.alias }}</p>
          </div>
        </div>
      </DialogHeader>
      <div class="py-4 flex flex-col gap-4">
        <div class="border border-border rounded-xl overflow-hidden">
          <div class="px-4 py-3 flex items-center gap-2 border-b border-border bg-muted/40">
            <span class="i-carbon-security h-4 w-4 shrink-0" />
            <p class="font-semibold text-sm">
              {{ $t('dataStudio.modifySource.accessPermissions') }}
            </p>
          </div>
          <div class="flex flex-col gap-1 p-3">
            <label
              v-for="perm in permissionKeys"
              :key="perm"
              class="flex items-center gap-3 px-1 py-1.5 rounded-lg cursor-pointer hover:bg-muted/50 select-none"
            >
              <input
                type="checkbox"
                :checked="localPermissions[perm]"
                :disabled="perm === 'read'"
                class="w-4 h-4 accent-primary"
                @change="togglePermission(perm)"
              />
              <span class="text-sm capitalize">{{ perm }}</span>
            </label>
          </div>
        </div>
      </div>
      <DialogFooter class="flex items-center justify-between sm:justify-between">
        <div class="flex flex-col gap-1">
          <div v-if="detachConfirming" class="detach-confirm-row">
            <span class="text-xs text-muted-foreground">
              {{ $t('dataStudio.detachSource.message') }}
            </span>
            <div class="flex gap-1.5 mt-1.5">
              <Button variant="destructive" size="sm" @click="handleDetach">
                <span class="i-carbon-unlink h-3.5 w-3.5 mr-1" />
                {{ $t('dataStudio.detachSource.confirm') }}
              </Button>
              <Button variant="outline" size="sm" @click="detachConfirming = false">
                {{ $t('dialogOps.cancel') }}
              </Button>
            </div>
          </div>
          <Button v-else variant="ghost" class="text-destructive" @click="detachConfirming = true">
            <span class="i-carbon-unlink h-4 w-4 mr-1.5" />
            {{ $t('dataStudio.detachSource.title') }}
          </Button>
        </div>
        <div class="flex gap-2">
          <Button variant="outline" @click="$emit('update:open', false)">
            {{ $t('dialogOps.cancel') }}
          </Button>
          <Button @click="handleSave">
            {{ $t('dataStudio.modifySource.saveChanges') }}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useDataStudioStore, type DataSourcePermissions } from '@/store/dataStudioStore';

const props = defineProps<{
  open: boolean;
  sourceIdx: number;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const dataStudioStore = useDataStudioStore();

const currentSource = computed(() => {
  const session = dataStudioStore.activeSession;
  const activeSources = session?.sources.filter(s => !s.detached) ?? [];
  return activeSources[props.sourceIdx] ?? null;
});

const permissionKeys: (keyof DataSourcePermissions)[] = ['read', 'create', 'update', 'delete'];

const localPermissions = ref<DataSourcePermissions>({
  read: true,
  create: false,
  update: false,
  delete: false,
});
const detachConfirming = ref(false);

watch(
  () => props.open,
  newVal => {
    if (newVal && currentSource.value) {
      localPermissions.value = { ...currentSource.value.permissions };
      detachConfirming.value = false;
    }
  },
);

const togglePermission = (perm: keyof DataSourcePermissions) => {
  if (perm === 'read') return;
  localPermissions.value = { ...localPermissions.value, [perm]: !localPermissions.value[perm] };
};

const handleSave = () => {
  const session = dataStudioStore.activeSession;
  const source = currentSource.value;
  if (!session || !source) return;
  dataStudioStore.updateSessionSourcePermissions(
    session.id,
    source.sourceId,
    localPermissions.value,
  );
  emit('update:open', false);
};

const handleDetach = () => {
  const session = dataStudioStore.activeSession;
  const source = currentSource.value;
  if (!session || !source) return;
  dataStudioStore.detachSourceFromSession(session.id, source.sourceId);
  emit('update:open', false);
};
</script>
