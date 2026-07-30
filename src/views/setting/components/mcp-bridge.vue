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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { InputNumber } from '@/components/ui/input-number';
import { Switch } from '@/components/ui/switch';

const defaultPort = 9120;

const status = ref<{ running: boolean; port: number | null }>({ running: false, port: null });
const portValue = ref<number | undefined>(undefined);
const autoStart = ref(true);
const loading = ref(false);

onMounted(async () => {
  try {
    const raw = await invoke<string>('get_mcp_status');
    const data = JSON.parse(raw);
    status.value = { running: data.running, port: data.port ?? null };
    portValue.value = data.configuredPort ?? undefined;
    autoStart.value = data.autoStart;
  } catch (e) {
    console.error('Failed to get MCP status:', e);
  }
});

const onPortChange = (val: number | undefined | null) => {
  portValue.value = val ?? undefined;
};

const onAutoStartChange = async (val: boolean) => {
  autoStart.value = val;
  try {
    await invoke('save_mcp_config', { port: portValue.value ?? null, autoStart: val });
  } catch (e) {
    console.error('Failed to save MCP config:', e);
  }
};

const restartBridge = async () => {
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
