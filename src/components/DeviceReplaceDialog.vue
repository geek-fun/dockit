<template>
  <Dialog :open="deviceStore.showReplaceDialog" @update:open="handleOpenChange">
    <DialogContent class="device-replace-dialog">
      <DialogHeader>
        <DialogTitle>{{ $t('device.replaceTitle') }}</DialogTitle>
        <DialogDescription>
          {{ $t('device.replaceDescription', { limit: limitInfo?.limit ?? 0 }) }}
        </DialogDescription>
      </DialogHeader>

      <p class="slot-usage">
        {{ $t('device.slotUsage', { used: limitInfo?.used ?? 0, limit: limitInfo?.limit ?? 0 }) }}
      </p>

      <RadioGroup
        v-model="selectedDeviceId"
        class="device-list"
        @update:model-value="replaceError = ''"
      >
        <label
          v-for="device in selectableDevices"
          :key="device.id"
          class="device-option"
          :class="{ selected: selectedDeviceId === device.id }"
        >
          <div class="device-row">
            <RadioGroupItem :value="device.id" />
            <component :is="platformIcon(device.platform)" class="device-icon" />
            <div class="device-meta">
              <p class="device-name">
                {{ device.name }}
                <span v-if="device.isCurrent" class="current-tag">
                  {{ $t('device.thisDevice') }}
                </span>
              </p>
              <p class="device-info">
                {{ platformLabel(device.platform) }} ·
                {{ $t('device.lastActive') }}
                {{ formatLastSeen(device.lastSeenAt) }}
              </p>
            </div>
          </div>
        </label>
      </RadioGroup>

      <p v-if="replaceError" class="replace-error">{{ replaceError }}</p>

      <div class="dialog-actions">
        <Button variant="outline" @click="deviceStore.dismissReplaceDialog()">
          {{ $t('common.cancel') }}
        </Button>
        <Button :disabled="!selectedDeviceId || deviceStore.activating" @click="handleReplace">
          <Spinner v-if="deviceStore.activating" class="w-4 h-4 mr-2" />
          {{ $t('device.replaceConfirm') }}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Laptop, Monitor, MonitorSmartphone, Server } from 'lucide-vue-next';
import { useDeviceStore, type DeviceDto } from '../store/deviceStore';
import { useLang } from '../lang';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

const deviceStore = useDeviceStore();
const { t } = useLang();

const selectedDeviceId = ref('');
const replaceError = ref('');

const limitInfo = computed(() => deviceStore.limitInfo);

// Server already returns the list sorted by lastSeenAt ascending (least
// recently used first); the current machine is marked and never selectable.
const selectableDevices = computed(() =>
  (limitInfo.value?.devices ?? []).filter(
    (device: DeviceDto) => device.status === 'active' && !device.isCurrent,
  ),
);

watch(
  () => deviceStore.showReplaceDialog,
  visible => {
    if (visible) {
      selectedDeviceId.value = selectableDevices.value[0]?.id ?? '';
      replaceError.value = '';
    }
  },
);

const platformIcon = (platform: string) => {
  if (platform === 'macos') return Laptop;
  if (platform === 'windows') return Monitor;
  if (platform === 'linux') return Server;
  return MonitorSmartphone;
};

const platformLabel = (platform: string): string => {
  const labels: Record<string, string> = { macos: 'macOS', windows: 'Windows', linux: 'Linux' };
  return labels[platform] ?? platform;
};

const formatLastSeen = (value?: string | null): string => {
  if (!value) return t('device.neverActive');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t('device.neverActive');
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

const handleReplace = async () => {
  replaceError.value = '';
  const ok = await deviceStore.replaceDevice(selectedDeviceId.value);
  if (!ok && deviceStore.showReplaceDialog) {
    replaceError.value = t('device.replaceFailed');
    if (selectableDevices.value.length > 0) {
      selectedDeviceId.value = selectableDevices.value[0].id;
    }
  }
};

const handleOpenChange = (open: boolean) => {
  if (!open) {
    deviceStore.dismissReplaceDialog();
  }
};
</script>

<style scoped>
.device-replace-dialog {
  max-width: 480px;
}

.slot-usage {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  margin-bottom: 12px;
}

.device-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 320px;
  overflow-y: auto;
}

.device-option {
  display: block;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background-color 0.15s;
}

.device-option:hover {
  background-color: hsl(var(--muted) / 0.5);
}

.device-option.selected {
  border-color: hsl(var(--primary));
  background-color: hsl(var(--primary) / 0.05);
}

.device-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.device-icon {
  width: 18px;
  height: 18px;
  color: hsl(var(--muted-foreground));
  flex-shrink: 0;
}

.device-meta {
  min-width: 0;
}

.device-name {
  font-weight: 500;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.current-tag {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  font-weight: 400;
}

.device-info {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  margin-top: 2px;
}

.replace-error {
  font-size: 13px;
  color: hsl(var(--destructive));
  margin-top: 8px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
