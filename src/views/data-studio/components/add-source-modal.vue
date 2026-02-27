<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle>{{ $t('dataStudio.addSource.title') }}</DialogTitle>
      </DialogHeader>
      <div class="py-4">
        <label class="text-sm font-medium text-foreground mb-2 block">
          {{ $t('dataStudio.addSource.selectConnection') }}
        </label>
        <Select v-model="selectedConnectionId">
          <SelectTrigger class="w-full">
            <SelectValue :placeholder="$t('dataStudio.addSource.selectConnectionPlaceholder')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="conn in availableConnections"
              :key="String(conn.value)"
              :value="String(conn.value)"
            >
              {{ conn.label }}
            </SelectItem>
          </SelectContent>
        </Select>
        <p v-if="availableConnections.length === 0" class="text-sm text-muted-foreground mt-2">
          {{ $t('dataStudio.addSource.noConnections') }}
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="$emit('update:open', false)">
          {{ $t('dialogOps.cancel') }}
        </Button>
        <Button :disabled="!selectedConnectionId" @click="handleAdd">
          {{ $t('dialogOps.confirm') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useConnectionStore } from '@/store';
import { useDataStudioStore, type ConnectedSource } from '@/store/dataStudioStore';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const connectionStore = useConnectionStore();
const dataStudioStore = useDataStudioStore();
const { connections } = storeToRefs(connectionStore);

const selectedConnectionId = ref<string>('');

const availableConnections = ref<Array<{ label: string; value: number | undefined }>>([]);

watch(
  () => props.open,
  newVal => {
    if (newVal) {
      selectedConnectionId.value = '';
      availableConnections.value = connections.value.map(conn => ({
        label: conn.name,
        value: conn.id,
      }));
    }
  },
);

const handleAdd = () => {
  if (!selectedConnectionId.value) return;

  const conn = connections.value.find(c => String(c.id) === selectedConnectionId.value);
  if (!conn || conn.id === undefined) return;

  const source: ConnectedSource = {
    connectionId: conn.id,
    name: conn.name,
    permissions: { read: true, create: false, update: false, delete: false },
    unifiedAccess: true,
  };

  dataStudioStore.addSource(source);
  emit('update:open', false);
};
</script>
