<template>
  <div class="mcp-bridge-setting space-y-8">
    <!-- Status Section -->
    <div class="space-y-4">
      <div>
        <h3 class="text-lg font-semibold">{{ $t('setting.mcp.title') }}</h3>
      </div>
      <div class="flex items-center gap-2">
        <span class="inline-block h-2.5 w-2.5 rounded-full" :class="statusDotClass" />
        <span class="text-sm text-muted-foreground">
          {{ statusText }}
        </span>
      </div>
    </div>

    <!-- Port + Auto-start Section (card, same row) -->
    <div class="py-4 px-5 border-border border rounded-lg bg-card space-y-3">
      <div class="flex items-end justify-between gap-6">
        <div class="space-y-3 flex-1">
          <div>
            <h4 class="text-sm font-semibold">{{ $t('setting.mcp.port') }}</h4>
            <p class="text-xs text-muted-foreground mt-1">{{ $t('setting.mcp.portDesc') }}</p>
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
            <Button
              variant="outline"
              size="sm"
              :disabled="restartPhase !== 'idle'"
              @click="restartBridge"
            >
              <span
                v-if="restartPhase !== 'idle'"
                class="i-carbon-circle-dash mr-2 h-4 w-4 shrink-0 animate-spin"
              />
              {{ restartButtonText }}
            </Button>
          </div>
        </div>
        <div class="space-y-3">
          <div>
            <h4 class="text-sm font-semibold">{{ $t('setting.mcp.autoStart') }}</h4>
            <p class="text-xs text-muted-foreground mt-1">{{ $t('setting.mcp.autoStartDesc') }}</p>
          </div>
          <Switch :checked="autoStart" @update:checked="onAutoStartChange" />
        </div>
      </div>
    </div>

    <!-- Permission Mode Section (Font Weight selector style) -->
    <div class="py-4 px-5 border-border border rounded-lg bg-card space-y-3">
      <div>
        <h4 class="text-sm font-semibold">{{ $t('setting.mcp.permissionMode') }}</h4>
        <p class="text-xs text-muted-foreground mt-1">
          {{ $t('setting.mcp.permissionModeDesc') }}
        </p>
      </div>
      <RadioGroup
        :model-value="policy.mode"
        class="flex flex-row gap-3"
        @update:model-value="onModeChange"
      >
        <div
          v-for="mode in permissionModes"
          :key="mode.value"
          :class="[
            'flex items-center gap-2.5 py-2.5 px-4 rounded-lg border cursor-pointer transition-all',
            policy.mode === mode.value
              ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
              : 'border-input hover:border-primary/50 hover:bg-accent/50',
          ]"
          @click="onModeChange(mode.value)"
        >
          <RadioGroupItem :id="`mode-${mode.value}`" :value="mode.value" />
          <Label
            :for="`mode-${mode.value}`"
            class="font-medium cursor-pointer text-sm whitespace-nowrap"
          >
            {{ mode.label }}
          </Label>
        </div>
      </RadioGroup>
      <p class="text-xs text-muted-foreground mt-2">
        {{ permissionModeDesc }}
      </p>

      <!-- Confirm Destructive — only shown for FullAccess -->
      <div
        v-if="policy.mode === 'FullAccess'"
        class="flex items-center justify-between pt-3 mt-3 border-t border-border/60"
      >
        <div class="flex-1">
          <h4 class="text-sm font-medium">{{ $t('setting.mcp.confirmDestructive') }}</h4>
          <p class="text-xs text-muted-foreground mt-1">
            {{ $t('setting.mcp.confirmDestructiveDesc') }}
          </p>
        </div>
        <Switch
          :checked="policy.confirm_destructive"
          @update:checked="onConfirmDestructiveChange"
        />
      </div>
    </div>

    <!-- Connection Access Table (allowlist + overrides merged) -->
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold">{{ $t('setting.mcp.connectionAccess') }}</h3>
          <p class="text-sm text-muted-foreground mt-1">
            {{ $t('setting.mcp.connectionAccessDesc') }}
          </p>
        </div>
        <Switch :checked="allowlistEnabled" @update:checked="onAllowlistEnableChange" />
      </div>
      <p v-if="!allowlistEnabled" class="text-xs text-muted-foreground italic">
        {{ $t('setting.mcp.allowlistEmpty') }}
      </p>
      <div v-else class="rounded-3xl border border-border/70 bg-card/70 shadow-sm overflow-hidden">
        <div class="max-h-64 overflow-y-auto">
          <table class="w-full text-sm">
            <thead class="sticky top-0 bg-card/95 backdrop-blur">
              <tr class="text-left text-xs text-muted-foreground">
                <th class="px-4 py-2.5 font-medium">{{ $t('setting.mcp.connectionName') }}</th>
                <th class="px-4 py-2.5 font-medium">{{ $t('setting.mcp.connectionType') }}</th>
                <th class="px-4 py-2.5 font-medium">{{ $t('setting.mcp.allowedActions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="connection in connections"
                :key="connection.id"
                class="border-t border-border/60"
              >
                <td class="px-4 py-3 font-medium whitespace-nowrap">{{ connection.name }}</td>
                <td class="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {{ connection.type }}
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-1">
                    <button
                      v-for="action in actionOptions"
                      :key="action.value"
                      type="button"
                      class="px-2 py-1 rounded-md border text-xs transition-all cursor-pointer"
                      :class="
                        connectionHasAction(connection.id, action.value)
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'border-input text-muted-foreground hover:border-primary/50'
                      "
                      @click="onActionToggle(connection.id, action.value)"
                    >
                      {{ action.label }}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
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
import { useConnectionStore } from '@/store/connectionStore';
import { useI18n } from 'vue-i18n';
import { useMessageService } from '@/composables';

type PermissionMode = 'ReadOnly' | 'DataReadWrite' | 'FullAccess';
type McpAction = 'read' | 'write' | 'delete';

type ConnectionOverride = {
  read_only: boolean;
  allowed_actions?: McpAction[];
};

type Policy = {
  mode: PermissionMode;
  allowed_connection_ids: string[];
  connection_overrides: Record<string, ConnectionOverride>;
  confirm_destructive: boolean;
};

const defaultPort = 9120;

const defaultPolicy: Policy = {
  mode: 'DataReadWrite',
  allowed_connection_ids: [],
  connection_overrides: {},
  confirm_destructive: true,
};

const status = ref<{ running: boolean; port: number | null }>({ running: false, port: null });
const portValue = ref<number | undefined>(undefined);
const autoStart = ref(true);
const restartPhase = ref<'idle' | 'shutting-down' | 'starting' | 'failed'>('idle');
const policy = ref<Policy>(defaultPolicy);
const connections = ref<Array<{ id: string | number; name: string; type: string }>>([]);

const connectionStore = useConnectionStore();
const message = useMessageService();
const { t } = useI18n();

const permissionModes = computed(() => [
  { value: 'ReadOnly' as const, label: t('setting.mcp.modeReadOnly') },
  { value: 'DataReadWrite' as const, label: t('setting.mcp.modeDataReadWrite') },
  { value: 'FullAccess' as const, label: t('setting.mcp.modeFullAccess') },
]);

const permissionModeDesc = computed(() => {
  switch (policy.value.mode) {
    case 'ReadOnly':
      return t('setting.mcp.modeReadOnlyDesc');
    case 'DataReadWrite':
      return t('setting.mcp.modeDataReadWriteDesc');
    case 'FullAccess':
      return t('setting.mcp.modeFullAccessDesc');
    default:
      return t('setting.mcp.modeReadOnlyDesc');
  }
});

const actionOptions = computed(() => [
  { value: 'read' as const, label: t('setting.mcp.actionRead') },
  { value: 'write' as const, label: t('setting.mcp.actionWrite') },
  { value: 'delete' as const, label: t('setting.mcp.actionDelete') },
]);

const allowlistEnabled = computed(() => policy.value.allowed_connection_ids.length > 0);

const connectionActions = (id: string | number): McpAction[] => {
  const override = policy.value.connection_overrides[String(id)];
  if (override?.allowed_actions) return override.allowed_actions;
  if (override?.read_only) return ['read'];
  return ['read', 'write', 'delete'];
};

const connectionHasAction = (id: string | number, action: McpAction): boolean =>
  connectionActions(id).includes(action);

const onActionToggle = (id: string | number, action: McpAction): void => {
  const idStr = String(id);
  const current = connectionActions(id);
  const next = current.includes(action) ? current.filter(a => a !== action) : [...current, action];
  const readOnly = next.length === 1 && next[0] === 'read';
  const nextOverrides = { ...policy.value.connection_overrides };
  if (next.length === 3) {
    delete nextOverrides[idStr];
  } else {
    nextOverrides[idStr] = { read_only: readOnly, allowed_actions: next };
  }
  policy.value = { ...policy.value, connection_overrides: nextOverrides };
  void savePolicy();
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
        mode: data.policy.mode ?? 'DataReadWrite',
        allowed_connection_ids: data.policy.allowed_connection_ids ?? [],
        connection_overrides: data.policy.connection_overrides ?? {},
        confirm_destructive: data.policy.confirm_destructive ?? true,
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

const onAllowlistEnableChange = (val: boolean): void => {
  const nextIds = val
    ? connections.value.map(c => String(c.id)).filter((id): id is string => id !== 'undefined')
    : [];
  policy.value = { ...policy.value, allowed_connection_ids: nextIds };
  void savePolicy();
};

const statusDotClass = computed(() => {
  if (restartPhase.value === 'shutting-down' || restartPhase.value === 'starting') {
    return 'bg-yellow-500 animate-pulse';
  }
  return status.value.running ? 'bg-green-500' : 'bg-red-500';
});

const statusText = computed(() => {
  switch (restartPhase.value) {
    case 'shutting-down':
      return t('setting.mcp.shuttingDown');
    case 'starting':
      return t('setting.mcp.starting');
    case 'failed':
      return t('setting.mcp.restartFailed');
    default:
      return status.value.running
        ? t('setting.mcp.running', { port: status.value.port })
        : t('setting.mcp.stopped');
  }
});

const restartButtonText = computed(() => {
  switch (restartPhase.value) {
    case 'shutting-down':
      return t('setting.mcp.shuttingDown');
    case 'starting':
      return t('setting.mcp.starting');
    default:
      return t('setting.mcp.restart');
  }
});

const restartBridge = async (): Promise<void> => {
  restartPhase.value = 'shutting-down';
  try {
    await invoke('save_mcp_config', {
      port: portValue.value ?? null,
      autoStart: autoStart.value,
      policy: policy.value,
    });
    restartPhase.value = 'starting';
  } catch (e) {
    restartPhase.value = 'failed';
    console.error('Failed to restart MCP bridge:', e);
    message.error(t('setting.mcp.restartFailedDetail'));
    return;
  }

  // Poll until the bridge is back up, or fail after 60s
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
      const raw = await invoke<string>('get_mcp_status');
      const data = JSON.parse(raw);
      if (data.running) {
        status.value = { running: true, port: data.port ?? null };
        restartPhase.value = 'idle';
        message.success(t('setting.mcp.restartSuccess'));
        return;
      }
    } catch (e) {
      // bridge not up yet — keep polling
      console.error('Bridge status check failed during restart:', e);
    }
  }

  restartPhase.value = 'failed';
  status.value = { running: false, port: null };
  message.error(t('setting.mcp.restartTimeout'));
};
</script>

<style scoped>
.mcp-bridge-setting {
  max-width: 640px;
}
</style>
