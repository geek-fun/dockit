<template>
  <div class="ssh-tunnel-section">
    <!-- Header row: title, count, test (left) | search, create (right) -->
    <div class="ssh-header-row">
      <span class="i-carbon-locked h-4 w-4 text-green-500 shrink-0" />
      <span class="text-sm font-medium whitespace-nowrap">{{ $t('connection.ssh.title') }}</span>
      <span v-if="profileIds.length > 0" class="text-xs text-muted-foreground whitespace-nowrap">
        {{ profileIds.length }}
        {{ profileIds.length > 1 ? $t('connection.ssh.profiles') : $t('connection.ssh.profile') }}
      </span>

      <Button
        v-if="profileIds.length > 0"
        variant="outline"
        size="sm"
        type="button"
        class="shrink-0"
        :disabled="testing"
        @click="onTestConnection"
      >
        <span v-if="testing" class="i-carbon-circle-dash h-3.5 w-3.5 animate-spin" />
        <span v-else class="i-carbon-network-3 h-3.5 w-3.5" />
      </Button>

      <div class="ml-auto min-w-0 max-w-[260px]">
        <SearchableSelect
          v-model="selectValue"
          :options="availableProfiles"
          :placeholder="$t('connection.ssh.addProfilePlaceholder')"
          :search-placeholder="$t('connection.filterPlaceholder')"
          :search-threshold="0"
          @update:model-value="onAddProfile"
        />
      </div>

      <Button
        variant="outline"
        size="icon"
        type="button"
        class="h-8 w-8 shrink-0"
        :title="$t('connection.ssh.createProfile')"
        @click="handleCreateProfile"
      >
        <Plus class="h-4 w-4" />
      </Button>
    </div>

    <!-- System proxy toggle -->
    <div v-if="systemProxyUrl" class="system-proxy-row">
      <Switch
        :checked="useSystemProxy"
        @update:checked="
          useSystemProxy = $event;
          emitUpdate();
        "
      />
      <Label class="text-xs text-muted-foreground cursor-pointer">
        <span class="i-carbon-network-public h-3.5 w-3.5 mr-1 align-text-bottom" />
        {{ $t('connection.ssh.systemProxy') }}
        <code class="text-[10px] bg-muted px-1 rounded ml-1">{{ systemProxyUrl }}</code>
      </Label>
    </div>

    <!-- Empty state -->
    <div
      v-if="profileIds.length === 0"
      class="text-center text-muted-foreground py-6 text-xs border border-dashed rounded-md"
    >
      {{ $t('connection.ssh.notConfigured') }}
    </div>

    <!-- Profile list -->
    <div v-else ref="profileListRef" class="ssh-profile-list">
      <div
        v-for="pid in profileIds"
        :key="pid"
        class="ssh-profile-row"
      >
        <div class="ssh-profile-row-order">
          <span class="i-carbon-draggable h-3 w-3" />
        </div>
        <div class="ssh-profile-row-body">
          <div class="ssh-profile-row-name">
            <span class="i-carbon-locked h-3.5 w-3.5 text-green-500 shrink-0" />
            <span class="text-sm font-medium truncate">{{ getProfileName(pid) }}</span>
          </div>
          <div class="ssh-profile-row-meta">
            {{ getProfileDetail(pid) }}
          </div>
        </div>
        <div class="ssh-profile-row-actions">
          <Button
            variant="ghost"
            size="icon"
            type="button"
            class="h-6 w-6 text-muted-foreground hover:text-foreground"
            :title="$t('connection.ssh.editProfile')"
            @click="$emit('editProfile', pid)"
          >
            <Pencil class="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            class="h-6 w-6 text-muted-foreground hover:text-destructive"
            title="Detach"
            @click="removeProfile(profileIds.indexOf(pid))"
          >
            <span class="i-carbon-unlink h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>

    <Alert
      v-if="testResult"
      :variant="testResult.success ? 'success' : 'destructive'"
      class="!mt-2"
    >
      <AlertDescription>{{ testResult.message }}</AlertDescription>
    </Alert>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { Plus, Pencil } from 'lucide-vue-next';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/combobox';
import type { ComboboxOption } from '@/components/ui/combobox';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSshProfileStore } from '@/store';
import type { SshConnectionConfig, SshTunnelConfig, SshProfile } from '@/store';
import Sortable from 'sortablejs';

const props = defineProps<{
  modelValue: SshConnectionConfig;
  remoteHost: string;
  remotePort: number;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: SshConnectionConfig];
  createProfile: [];
  editProfile: [profileId: string];
}>();

const sshStore = useSshProfileStore();
const testing = ref(false);
const testResult = ref<{ success: boolean; message: string } | null>(null);
const selectValue = ref('');
const systemProxyUrl = ref<string | null>(null);
const useSystemProxy = ref(true);
const profileListRef = ref<HTMLElement>();
let sortableInstance: Sortable | null = null;

onMounted(async () => {
  knownProfileCount = sshStore.profiles.length;
  sshStore.fetchProfiles();
  try {
    const detected = await invoke<string | null>('detect_system_proxy');
    systemProxyUrl.value = detected;
  } catch {
    systemProxyUrl.value = null;
  }

  await nextTick();
  initSortable();
});

onUnmounted(() => {
  sortableInstance?.destroy();
});

function initSortable() {
  if (!profileListRef.value) return;

  sortableInstance = new Sortable(profileListRef.value, {
    handle: '.ssh-profile-row-order',
    animation: 200,
    easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    forceFallback: true,
    fallbackClass: 'sortable-drag',
    fallbackOnBody: true,
    ghostClass: 'sortable-ghost',
    onEnd: (evt) => {
      if (evt.oldIndex === undefined || evt.newIndex === undefined || evt.oldIndex === evt.newIndex) return;

      const ids = [...profileIds.value];
      const [removed] = ids.splice(evt.oldIndex, 1);
      ids.splice(evt.newIndex, 0, removed);
      profileIds.value = ids;
      testResult.value = null;
      emitUpdate();
    },
  });
}

// Ordered list of profile IDs: index 0 = primary, rest = hops
const profileIds = ref<string[]>([]);

// Track known profile count for auto-select on create
let knownProfileCount = 0;

// Sync from props on mount / external change
watch(
  () => props.modelValue,
  val => {
    profileIds.value = val.profileIds ? [...val.profileIds] : [];
  },
  { immediate: true, deep: true },
);

// Profiles not yet in the list
const availableProfiles = computed<ComboboxOption[]>(() =>
  sshStore.profiles
    .filter(p => !profileIds.value.includes(p.id))
    .map(p => ({ label: p.name, value: p.id })),
);

function getProfile(id: string): SshProfile | undefined {
  return sshStore.profiles.find(p => p.id === id);
}

function getProfileName(id: string): string {
  return getProfile(id)?.name ?? id;
}

function getProfileDetail(id: string): string {
  const p = getProfile(id);
  if (!p) return '';
  const authLabel = p.authMethod || 'password';
  return `${p.username}@${p.host}:${p.port} · ${authLabel}`;
}

function emitUpdate() {
  emit('update:modelValue', {
    enabled: profileIds.value.length > 0,
    profileIds: [...profileIds.value],
    inline: props.modelValue.inline,
    systemProxy: useSystemProxy.value ? (systemProxyUrl.value ?? undefined) : undefined,
  });
}

function onAddProfile(id: string) {
  if (!id || profileIds.value.includes(id)) return;
  profileIds.value.push(id);
  selectValue.value = '';
  testResult.value = null;
  emitUpdate();
}

function removeProfile(idx: number) {
  profileIds.value.splice(idx, 1);
  testResult.value = null;
  emitUpdate();
}

function handleCreateProfile() {
  knownProfileCount = sshStore.profiles.length;
  emit('createProfile');
}

// Auto-select newly created profile
watch(
  () => sshStore.profiles.length,
  (count, prev) => {
    if (count > prev && count > knownProfileCount) {
      knownProfileCount = count;
      const latest = sshStore.profiles[sshStore.profiles.length - 1];
      if (!profileIds.value.includes(latest.id)) {
        onAddProfile(latest.id);
      }
    }
  },
);

async function onTestConnection() {
  testing.value = true;
  testResult.value = null;

  // Build tunnel configs for each profile in chain order
  const configs: SshTunnelConfig[] = [];
  for (const pid of profileIds.value) {
    const profile = sshStore.getProfileById(pid);
    if (!profile) {
      testResult.value = { success: false, message: `Profile "${pid}" not found` };
      testing.value = false;
      return;
    }
    configs.push({
      enabled: true,
      host: profile.host,
      port: profile.port,
      username: profile.username,
      authMethod: profile.authMethod || 'password',
      password: profile.password,
      keyPath: profile.keyPath,
      keyPassphrase: profile.keyPassphrase,
      useSshAgent: profile.authMethod === 'agent',
      sshAgentSockPath:
        profile.sshAgentSockPath || (profile.useSshAgent ? profile.sshAgentSockPath : ''),
      connectTimeoutSecs: profile.connectTimeoutSecs,
      keepaliveIntervalSecs: profile.keepaliveIntervalSecs,
      verifyHostKey: profile.verifyHostKey,
      exposeLan: profile.exposeLan,
    });
  }

  // For multi-hop, test the chain by connecting through each hop sequentially
  // Currently test SSH connection tests a single hop — test the last one (connection target)
  // which validates the full chain
  const lastConfig = configs[configs.length - 1];
  try {
    testResult.value = await sshStore.testConnection(
      lastConfig,
      props.remoteHost,
      props.remotePort,
    );
  } catch (e) {
    testResult.value = { success: false, message: String(e) };
  } finally {
    testing.value = false;
  }
}
</script>

<style scoped>
.ssh-header-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
}

.system-proxy-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  margin-bottom: 8px;
  border-radius: 6px;
  background: hsl(var(--muted) / 0.3);
}

.ssh-profile-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ssh-profile-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  background: hsl(var(--muted) / 0.3);
}

.ssh-profile-row-order {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
  font-size: 10px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: grab;
}

.ssh-profile-row-order:active {
  cursor: grabbing;
}

.ssh-profile-row-body {
  flex: 1;
  min-width: 0;
}

.ssh-profile-row-name {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ssh-profile-row-meta {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  padding-left: 22px;
}

.ssh-profile-row-actions {
  display: flex;
  align-items: center;
  gap: 1px;
  flex-shrink: 0;
}

/* SortableJS drag feedback */
.sortable-ghost {
  background: hsl(var(--primary) / 0.05) !important;
  border: 2px dashed hsl(var(--primary) / 0.3);
  border-radius: 6px;
}

.sortable-ghost * {
  opacity: 0;
}

.sortable-drag {
  opacity: 0.95 !important;
  background: hsl(var(--card)) !important;
  border-color: hsl(var(--primary) / 0.4) !important;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}
</style>
