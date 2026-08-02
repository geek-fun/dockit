<template>
  <div class="mcp-bridge-setting space-y-8">
    <!-- Status Section -->
    <div class="space-y-4">
      <div>
        <h3 class="text-lg font-semibold">{{ $t('setting.mcp.title') }}</h3>
      </div>
      <div class="flex items-center gap-2">
        <span
          class="inline-block h-2.5 w-2.5 rounded-full"
          :class="status.running ? 'bg-green-500' : 'bg-red-500'"
        />
        <span class="text-sm text-muted-foreground">
          {{
            status.running
              ? $t('setting.mcp.running', { port: status.port })
              : $t('setting.mcp.stopped')
          }}
        </span>
      </div>
    </div>

    <!-- Port Section -->
    <div class="space-y-4">
      <div>
        <h3 class="text-lg font-semibold">{{ $t('setting.mcp.port') }}</h3>
        <p class="text-sm text-muted-foreground mt-1">{{ $t('setting.mcp.portDesc') }}</p>
      </div>
      <div class="flex items-center gap-3">
        <InputNumber
          :model-value="portValue"
          :min="1024"
          :max="65535"
          class="w-36"
          :placeholder="String(defaultPort)"
          @update:model-value="onPortChange"
        />
        <Button variant="outline" size="sm" :disabled="loading" @click="restartBridge">
          {{ $t('setting.mcp.restart') }}
        </Button>
      </div>
    </div>

    <!-- Auto-start Section -->
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold">{{ $t('setting.mcp.autoStart') }}</h3>
          <p class="text-sm text-muted-foreground mt-1">{{ $t('setting.mcp.autoStartDesc') }}</p>
        </div>
        <Switch :model-value="autoStart" @update:model-value="onAutoStartChange" />
      </div>
    </div>

    <!-- Permission Mode Section -->
    <div class="space-y-4">
      <div>
        <h3 class="text-lg font-semibold">{{ $t('setting.mcp.permissionMode') }}</h3>
        <p class="text-sm text-muted-foreground mt-1">
          {{ $t('setting.mcp.permissionModeDesc') }}
        </p>
      </div>
      <RadioGroup :model-value="policy.mode" class="grid gap-3" @update:model-value="onModeChange">
        <div v-for="mode in permissionModes" :key="mode.value" class="flex items-center gap-2">
          <RadioGroupItem :id="`mode-${mode.value}`" :value="mode.value" />
          <Label :for="`mode-${mode.value}`" class="cursor-pointer font-normal">
            {{ mode.label }}
          </Label>
        </div>
      </RadioGroup>
    </div>

    <!-- Confirm Destructive Section -->
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex-1">
          <h3 class="text-lg font-semibold">{{ $t('setting.mcp.confirmDestructive') }}</h3>
          <p class="text-sm text-muted-foreground mt-1">
            {{ $t('setting.mcp.confirmDestructiveDesc') }}
          </p>
          <p v-if="policy.mode !== 'FullAccess'" class="text-xs text-muted-foreground mt-1 italic">
            {{ $t('setting.mcp.confirmDestructiveDisabledHint') }}
          </p>
        </div>
        <Switch
          :model-value="policy.confirm_destructive"
          :disabled="policy.mode !== 'FullAccess'"
          @update:model-value="onConfirmDestructiveChange"
        />
      </div>
    </div>

    <!-- Connection Allowlist Section -->
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold">{{ $t('setting.mcp.allowlist') }}</h3>
          <p class="text-sm text-muted-foreground mt-1">
            {{ $t('setting.mcp.allowlistDesc') }}
          </p>
        </div>
        <Switch :model-value="allowlistEnabled" @update:model-value="onAllowlistEnableChange" />
      </div>
      <p v-if="!allowlistEnabled" class="text-xs text-muted-foreground italic">
        {{ $t('setting.mcp.allowlistEmpty') }}
      </p>
      <div class="space-y-2">
        <div v-for="connection in connections" :key="connection.id" class="flex items-center gap-2">
          <Checkbox
            :checked="allowlistEnabled && isConnectionAllowed(connection.id)"
            :disabled="!allowlistEnabled"
            @update:checked="(checked: boolean) => onAllowlistToggle(connection.id, checked)"
          />
          <Label class="cursor-pointer font-normal">
            {{ connection.name }}
            <span class="text-xs text-muted-foreground ml-1">({{ connection.type }})</span>
          </Label>
        </div>
      </div>
    </div>

    <!-- Connection Overrides Section -->
    <div class="space-y-4">
      <div>
        <h3 class="text-lg font-semibold">{{ $t('setting.mcp.connectionOverrides') }}</h3>
      </div>
      <div class="space-y-2">
        <div
          v-for="connection in connections"
          :key="connection.id"
          class="flex items-center justify-between"
        >
          <div class="flex-1">
            <Label class="cursor-pointer font-normal">
              {{ connection.name }}
            </Label>
            <p class="text-xs text-muted-foreground mt-0.5">
              {{ $t('setting.mcp.overrideReadOnlyDesc') }}
            </p>
          </div>
          <Switch
            :model-value="isConnectionReadOnly(connection.id)"
            @update:model-value="(val: boolean) => onOverrideReadOnlyToggle(connection.id, val)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { InputNumber } from '@/components/ui/input-number';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useConnectionStore } from '@/store/connectionStore';
import { useI18n } from 'vue-i18n';

type PermissionMode = 'ReadOnly' | 'DataReadWrite' | 'FullAccess';

type ConnectionOverride = {
  read_only: boolean;
};

type Policy = {
  mode: PermissionMode;
  allowed_connection_ids: string[];
  connection_overrides: Record<string, ConnectionOverride>;
  confirm_destructive: boolean;
};

const defaultPort = 9120;

const defaultPolicy: Policy = {
  mode: 'ReadOnly',
  allowed_connection_ids: [],
  connection_overrides: {},
  confirm_destructive: true,
};

const status = ref<{ running: boolean; port: number | null }>({ running: false, port: null });
const portValue = ref<number | undefined>(undefined);
const autoStart = ref(true);
const loading = ref(false);
const policy = ref<Policy>(defaultPolicy);
const connections = ref<Array<{ id: string | number; name: string; type: string }>>([]);

const connectionStore = useConnectionStore();
const { t } = useI18n();

const permissionModes = computed(() => [
  { value: 'ReadOnly' as const, label: t('setting.mcp.modeReadOnly') },
  { value: 'DataReadWrite' as const, label: t('setting.mcp.modeDataReadWrite') },
  { value: 'FullAccess' as const, label: t('setting.mcp.modeFullAccess') },
]);

const isConnectionAllowed = (id: string | number): boolean => {
  const idStr = String(id);
  if (policy.value.allowed_connection_ids.length === 0) return true;
  return policy.value.allowed_connection_ids.includes(idStr);
};

const allowlistEnabled = computed(() => policy.value.allowed_connection_ids.length > 0);

const onAllowlistEnableChange = (val: boolean): void => {
  const nextIds = val
    ? connections.value.map(c => String(c.id)).filter((id): id is string => id !== 'undefined')
    : [];
  policy.value = { ...policy.value, allowed_connection_ids: nextIds };
  void savePolicy();
};

const isConnectionReadOnly = (id: string | number): boolean => {
  const idStr = String(id);
  return policy.value.connection_overrides[idStr]?.read_only ?? false;
};

const savePolicy = async (): Promise<void> => {
  try {
    await invoke('save_mcp_config', {
      port: portValue.value ?? null,
      autoStart: autoStart.value,
      policy: {
        mode: policy.value.mode,
        allowed_connection_ids: policy.value.allowed_connection_ids,
        connection_overrides: policy.value.connection_overrides,
        confirm_destructive: policy.value.confirm_destructive,
      },
    });
  } catch (e) {
    console.error('Failed to save MCP policy:', e);
  }
};

onMounted(async () => {
  try {
    const raw = await invoke<string>('get_mcp_status');
    const data = JSON.parse(raw);
    status.value = { running: data.running, port: data.port ?? null };
    portValue.value = data.configuredPort ?? undefined;
    autoStart.value = data.autoStart;
    if (data.policy) {
      policy.value = {
        mode: data.policy.mode ?? 'ReadOnly',
        allowed_connection_ids: data.policy.allowed_connection_ids ?? [],
        connection_overrides: data.policy.connection_overrides ?? {},
        confirm_destructive: data.policy.confirm_destructive ?? false,
      };
    }
  } catch (e) {
    console.error('Failed to get MCP status:', e);
  }

  try {
    await connectionStore.fetchConnections();
    connections.value = connectionStore.connections.map(c => ({
      id: c.id ?? '',
      name: c.name,
      type: c.type,
    }));
  } catch (e) {
    console.error('Failed to fetch connections:', e);
    connections.value = [];
  }
});

const onPortChange = (val: number | undefined | null): void => {
  portValue.value = val ?? undefined;
};

const onAutoStartChange = async (val: boolean): Promise<void> => {
  autoStart.value = val;
  try {
    await invoke('save_mcp_config', { port: portValue.value ?? null, autoStart: val });
  } catch (e) {
    console.error('Failed to save MCP config:', e);
  }
};

const onModeChange = (val: string): void => {
  policy.value = { ...policy.value, mode: val as PermissionMode };
  void savePolicy();
};

const onConfirmDestructiveChange = (val: boolean): void => {
  policy.value = { ...policy.value, confirm_destructive: val };
  void savePolicy();
};

const onAllowlistToggle = (id: string | number, checked: boolean): void => {
  const idStr = String(id);
  const currentIds = policy.value.allowed_connection_ids;
  const nextIds = checked ? [...currentIds, idStr] : currentIds.filter(x => x !== idStr);
  policy.value = { ...policy.value, allowed_connection_ids: nextIds };
  void savePolicy();
};

const onOverrideReadOnlyToggle = (id: string | number, val: boolean): void => {
  const idStr = String(id);
  const nextOverrides = { ...policy.value.connection_overrides };
  if (val) {
    nextOverrides[idStr] = { read_only: true };
  } else {
    delete nextOverrides[idStr];
  }
  policy.value = { ...policy.value, connection_overrides: nextOverrides };
  void savePolicy();
};

const restartBridge = async (): Promise<void> => {
  loading.value = true;
  try {
    await invoke('save_mcp_config', { port: portValue.value ?? null, autoStart: autoStart.value });
    // Refresh status after restart
    const raw = await invoke<string>('get_mcp_status');
    const data = JSON.parse(raw);
    status.value = { running: data.running, port: data.port ?? null };
  } catch (e) {
    console.error('Failed to restart MCP bridge:', e);
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.mcp-bridge-setting {
  max-width: 600px;
}
</style>
