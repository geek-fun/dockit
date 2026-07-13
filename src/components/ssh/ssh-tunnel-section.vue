<template>
  <div class="ssh-tunnel-section space-y-4">
    <!-- Toggle -->
    <div class="flex items-center justify-between">
      <Label :for="`ssh-toggle-${uid}`" class="text-sm font-medium">
        {{ $t('connection.ssh.title') }}
      </Label>
      <Switch
        :id="`ssh-toggle-${uid}`"
        :checked="localConfig.enabled"
        @update:checked="onEnabledChange"
      />
    </div>

    <template v-if="localConfig.enabled">
      <!-- Mode selector -->
      <Tabs :model-value="mode" @update:model-value="onModeChange">
        <TabsList class="w-full">
          <TabsTrigger value="profile" class="flex-1">
            {{ $t('connection.ssh.profile') }}
          </TabsTrigger>
          <TabsTrigger value="inline" class="flex-1">
            {{ $t('connection.ssh.useInline') }}
          </TabsTrigger>
        </TabsList>

        <!-- PROFILE MODE -->
        <TabsContent value="profile" class="space-y-3 mt-3">
          <div class="space-y-2">
            <Label>{{ $t('connection.ssh.profile') }}</Label>
            <Select
              :model-value="localConfig.profileId ?? ''"
              @update:model-value="onProfileSelect"
            >
              <SelectTrigger>
                <SelectValue :placeholder="$t('connection.ssh.profilePlaceholder')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="p in sshStore.profiles" :key="p.id" :value="p.id">
                  {{ p.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- Action buttons -->
          <div class="flex gap-2">
            <Button variant="outline" size="sm" @click="$emit('createProfile')">
              {{ $t('connection.ssh.createProfile') }}
            </Button>
            <Button
              v-if="localConfig.profileId"
              variant="outline"
              size="sm"
              @click="$emit('editProfile', localConfig.profileId)"
            >
              {{ $t('connection.ssh.editProfile') }}
            </Button>
          </div>

          <!-- Multi-hop -->
          <div v-if="localConfig.hopProfileIds?.length" class="space-y-2">
            <Label class="text-sm">{{ $t('connection.ssh.hopProfiles') }}</Label>
            <div
              v-for="(hopId, idx) in localConfig.hopProfileIds"
              :key="idx"
              class="flex items-center gap-2"
            >
              <span class="text-sm text-muted-foreground flex-1">
                {{ sshStore.getProfileById(hopId)?.name ?? hopId }}
              </span>
              <Button variant="ghost" size="icon" class="h-6 w-6" @click="removeHop(idx)">
                <X class="h-3 w-3" />
              </Button>
            </div>
          </div>
          <Button variant="outline" size="sm" @click="addHop">
            + {{ $t('connection.ssh.addHop') }}
          </Button>
        </TabsContent>

        <!-- INLINE MODE -->
        <TabsContent value="inline" class="space-y-3 mt-3">
          <Grid :cols="8" :x-gap="3" :y-gap="3">
            <GridItem :span="6">
              <FormItem :label="$t('connection.ssh.host')" required>
                <Input
                  :model-value="inlineForm.host"
                  :placeholder="$t('connection.ssh.hostPlaceholder')"
                  @update:model-value="v => updateInline('host', v)"
                />
              </FormItem>
            </GridItem>
            <GridItem :span="2">
              <FormItem :label="$t('connection.ssh.port')">
                <Input
                  :model-value="String(inlineForm.port)"
                  type="number"
                  placeholder="22"
                  @update:model-value="v => updateInline('port', Number(v) || 22)"
                />
              </FormItem>
            </GridItem>
            <GridItem :span="8">
              <FormItem :label="$t('connection.ssh.username')" required>
                <Input
                  :model-value="inlineForm.username"
                  autocomplete="off"
                  @update:model-value="v => updateInline('username', v)"
                />
              </FormItem>
            </GridItem>
          </Grid>

          <!-- Auth Method Tabs -->
          <Label>{{ $t('connection.ssh.authMethod') }}</Label>
          <Tabs
            :model-value="inlineForm.authMethod || 'password'"
            @update:model-value="v => updateInline('authMethod', v)"
          >
            <TabsList class="w-full">
              <TabsTrigger value="password" class="flex-1">
                {{ $t('connection.ssh.authPassword') }}
              </TabsTrigger>
              <TabsTrigger value="key" class="flex-1">
                {{ $t('connection.ssh.authKey') }}
              </TabsTrigger>
              <TabsTrigger value="agent" class="flex-1">
                {{ $t('connection.ssh.authAgent') }}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="password" class="mt-3">
              <FormItem :label="$t('connection.ssh.password')">
                <Input
                  :model-value="inlineForm.password"
                  type="password"
                  autocomplete="off"
                  @update:model-value="v => updateInline('password', v)"
                />
              </FormItem>
            </TabsContent>

            <TabsContent value="key" class="mt-3 space-y-3">
              <FormItem :label="$t('connection.ssh.keyPath')">
                <Input
                  :model-value="inlineForm.keyPath"
                  :placeholder="$t('connection.ssh.keyPathPlaceholder')"
                  @update:model-value="v => updateInline('keyPath', v)"
                />
              </FormItem>
              <FormItem :label="$t('connection.ssh.keyPassphrase')">
                <Input
                  :model-value="inlineForm.keyPassphrase"
                  type="password"
                  autocomplete="off"
                  @update:model-value="v => updateInline('keyPassphrase', v)"
                />
              </FormItem>
            </TabsContent>

            <TabsContent value="agent" class="mt-3">
              <div class="text-sm text-muted-foreground p-3 border rounded-md">
                {{ $t('connection.ssh.authAgent') }}
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      <!-- Test button + result -->
      <div class="pt-2 space-y-2">
        <Button variant="outline" :disabled="testing" @click="onTestConnection">
          {{ testing ? $t('connection.ssh.testing') : $t('connection.ssh.testConnection') }}
        </Button>

        <Alert v-if="testResult" :variant="testResult.success ? 'success' : 'destructive'">
          <AlertDescription>{{ testResult.message }}</AlertDescription>
        </Alert>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { X } from 'lucide-vue-next';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Grid, GridItem } from '@/components/ui/grid';
import { FormItem } from '@/components/ui/form';
import { useSshProfileStore } from '@/store';
import type { SshConnectionConfig, SshTunnelConfig } from '@/store';

let uidCounter = 0;
const uid = ref(0);

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

const localConfig = reactive<SshConnectionConfig>({
  enabled: props.modelValue.enabled,
  profileId: props.modelValue.profileId,
  hopProfileIds: props.modelValue.hopProfileIds ? [...props.modelValue.hopProfileIds] : undefined,
  inline: props.modelValue.inline ? { ...props.modelValue.inline } : undefined,
});

watch(
  () => props.modelValue,
  val => {
    localConfig.enabled = val.enabled;
    localConfig.profileId = val.profileId;
    localConfig.hopProfileIds = val.hopProfileIds ? [...val.hopProfileIds] : undefined;
    localConfig.inline = val.inline ? { ...val.inline } : undefined;
  },
  { deep: true },
);

const mode = computed(() => (localConfig.profileId ? 'profile' : 'inline'));

const inlineForm = reactive<SshTunnelConfig>({
  enabled: true,
  host: localConfig.inline?.host ?? '',
  port: localConfig.inline?.port ?? 22,
  username: localConfig.inline?.username ?? '',
  authMethod: localConfig.inline?.authMethod ?? 'password',
  password: localConfig.inline?.password ?? '',
  keyPath: localConfig.inline?.keyPath ?? '',
  keyPassphrase: localConfig.inline?.keyPassphrase ?? '',
  useSshAgent: localConfig.inline?.authMethod === 'agent',
  sshAgentSockPath: '',
  connectTimeoutSecs: 10,
  keepaliveIntervalSecs: 30,
  verifyHostKey: false,
  exposeLan: false,
});

watch(
  () => localConfig.inline,
  inline => {
    if (inline) Object.assign(inlineForm, inline);
  },
  { immediate: true, deep: true },
);

function emitUpdate() {
  emit('update:modelValue', {
    enabled: localConfig.enabled,
    profileId: localConfig.profileId,
    hopProfileIds: localConfig.hopProfileIds ? [...localConfig.hopProfileIds] : undefined,
    inline: localConfig.inline ? { ...localConfig.inline } : undefined,
  });
}

function onEnabledChange(checked: boolean) {
  localConfig.enabled = checked;
  if (!checked) testResult.value = null;
  emitUpdate();
}

function onModeChange(newMode: string | number) {
  if (newMode === 'profile') {
    localConfig.profileId = sshStore.profiles[0]?.id;
    localConfig.inline = undefined;
  } else {
    localConfig.profileId = undefined;
    localConfig.inline = { ...inlineForm };
  }
  emitUpdate();
}

function onProfileSelect(id: string) {
  localConfig.profileId = id || undefined;
  emitUpdate();
}

function updateInline(key: string, value: unknown) {
  (inlineForm as Record<string, unknown>)[key] = value;
  if (mode.value === 'inline') {
    localConfig.inline = { ...inlineForm };
    emitUpdate();
  }
}

function addHop() {
  if (!localConfig.hopProfileIds) {
    localConfig.hopProfileIds = [];
  }
  const profiles = sshStore.profiles.filter(
    p => p.id !== localConfig.profileId && !localConfig.hopProfileIds?.includes(p.id),
  );
  if (profiles.length > 0) {
    localConfig.hopProfileIds.push(profiles[0].id);
    emitUpdate();
  }
}

function removeHop(idx: number) {
  localConfig.hopProfileIds?.splice(idx, 1);
  emitUpdate();
}

async function onTestConnection() {
  testing.value = true;
  testResult.value = null;
  try {
    const config: SshTunnelConfig =
      mode.value === 'profile'
        ? {
            enabled: true,
            host: '',
            port: 22,
            username: '',
            authMethod: 'agent',
            password: '',
            keyPath: '',
            keyPassphrase: '',
            useSshAgent: false,
            sshAgentSockPath: '',
            connectTimeoutSecs: 10,
            keepaliveIntervalSecs: 30,
            verifyHostKey: false,
            exposeLan: false,
          }
        : { ...inlineForm };
    testResult.value = await sshStore.testConnection(config, props.remoteHost, props.remotePort);
  } catch (e) {
    testResult.value = { success: false, message: String(e) };
  } finally {
    testing.value = false;
  }
}

onMounted(() => {
  uidCounter++;
  uid.value = uidCounter;
  sshStore.fetchProfiles();
});
</script>
