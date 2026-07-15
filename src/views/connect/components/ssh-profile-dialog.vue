<template>
  <Dialog :open="visible" @update:open="onOpenChange">
    <DialogContent class="sm:max-w-[520px]" :show-close="false">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          {{ editingId ? $t('connection.ssh.editProfile') : $t('connection.ssh.createProfile') }}
        </DialogTitle>
        <button
          class="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100"
          @click="close"
        >
          <X class="h-4 w-4" />
        </button>
      </DialogHeader>

      <div class="space-y-4">
        <!-- Profile Name -->
        <FormItem :label="$t('connection.ssh.profileName')" required :error="errors.name">
          <Input v-model="form.name" :placeholder="$t('connection.ssh.profileName')" @update:model-value="clearError('name')" />
        </FormItem>

        <!-- Host & Port -->
        <Grid :cols="8" :x-gap="3" :y-gap="3">
          <GridItem :span="6">
            <FormItem :label="$t('connection.ssh.host')" required :error="errors.host">
              <Input v-model="form.host" :placeholder="$t('connection.ssh.hostPlaceholder')" @update:model-value="clearError('host')" />
            </FormItem>
          </GridItem>
          <GridItem :span="2">
            <FormItem :label="$t('connection.ssh.port')">
              <Input v-model.number="form.port" type="number" placeholder="22" />
            </FormItem>
          </GridItem>
          <GridItem :span="8">
            <FormItem :label="$t('connection.ssh.username')" required :error="errors.username">
              <Input v-model="form.username" autocomplete="off" @update:model-value="clearError('username')" />
            </FormItem>
          </GridItem>
        </Grid>

        <!-- Auth Method Tabs -->
        <Label>{{ $t('connection.ssh.authMethod') }}</Label>
        <Tabs v-model="form.authMethod" @update:model-value="clearError('keyPath')">
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
              <div class="relative">
                <Input
                  v-model="form.password"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="off"
                  class="pr-8"
                />
                <button
                  type="button"
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  @click="showPassword = !showPassword"
                >
                  <Eye v-if="!showPassword" class="h-4 w-4" />
                  <EyeOff v-else class="h-4 w-4" />
                </button>
              </div>
            </FormItem>
          </TabsContent>
          <TabsContent value="key" class="mt-3 space-y-3">
            <FormItem :label="$t('connection.ssh.keyPath')" :error="errors.keyPath">
              <div class="flex gap-2">
                <div class="flex-1">
                  <Input
                    v-model="form.keyPath"
                    :placeholder="$t('connection.ssh.keyPathPlaceholder')"
                    @update:model-value="clearError('keyPath')"
                  />
                </div>
                <Button variant="outline" size="icon" class="shrink-0" @click="selectKeyFile">
                  <Folder class="h-4 w-4" />
                </Button>
              </div>
            </FormItem>
            <FormItem :label="$t('connection.ssh.keyPassphrase')">
              <div class="relative">
                <Input
                  v-model="form.keyPassphrase"
                  :type="showPassphrase ? 'text' : 'password'"
                  autocomplete="off"
                  class="pr-8"
                />
                <button
                  type="button"
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  @click="showPassphrase = !showPassphrase"
                >
                  <Eye v-if="!showPassphrase" class="h-4 w-4" />
                  <EyeOff v-else class="h-4 w-4" />
                </button>
              </div>
            </FormItem>
          </TabsContent>
          <TabsContent value="agent" class="mt-3 space-y-3">
            <FormItem :label="$t('connection.ssh.sshAgentSockPath')">
              <Input v-model="form.sshAgentSockPath" placeholder="$SSH_AUTH_SOCK" />
            </FormItem>
            <p class="text-xs text-muted-foreground">
              {{ $t('connection.ssh.agentSocketHint') }}
            </p>
          </TabsContent>
        </Tabs>

        <!-- Advanced: Connect Timeout, Keepalive, Expose to LAN -->
        <div class="flex gap-3 items-end">
          <FormItem :label="$t('connection.ssh.connectTimeout')" class="flex-1">
            <Input v-model.number="form.connectTimeoutSecs" type="number" />
          </FormItem>
          <FormItem :label="$t('connection.ssh.keepaliveInterval')" class="flex-1">
            <Input v-model.number="form.keepaliveIntervalSecs" type="number" />
          </FormItem>
          <div class="flex items-center gap-2 pb-1.5">
            <Switch
              id="expose-lan"
              :checked="form.exposeLan"
              @update:checked="form.exposeLan = $event"
            />
            <Label for="expose-lan" class="text-sm whitespace-nowrap">
              {{ $t('connection.ssh.exposeLan') }}
            </Label>
          </div>
        </div>

        <!-- Test result -->
        <Alert v-if="testResult" :variant="testResult.success ? 'success' : 'destructive'">
          <AlertDescription>{{ testResult.message }}</AlertDescription>
        </Alert>
      </div>

      <DialogFooter class="mt-4">
        <Button variant="outline" :disabled="testing" @click="onTest">
          {{ testing ? $t('connection.ssh.testing') : $t('connection.ssh.testConnection') }}
        </Button>
        <Button @click="onSave">{{ editingId ? $t('save') : $t('create') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { X, Eye, EyeOff, Folder } from 'lucide-vue-next';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Grid, GridItem } from '@/components/ui/grid';
import { FormItem } from '@/components/ui/form';
import { useSshProfileStore } from '@/store';
import type { SshProfile, SshTunnelConfig } from '@/store';

const sshStore = useSshProfileStore();
const visible = ref(false);
const testing = ref(false);
const testResult = ref<{ success: boolean; message: string } | null>(null);
const editingId = ref<string | null>(null);
const showPassword = ref(false);
const showPassphrase = ref(false);

const form = reactive({
  name: '',
  host: '',
  port: 22,
  username: '',
  authMethod: 'password' as SshProfile['authMethod'],
  password: '',
  keyPath: '',
  keyPassphrase: '',
  connectTimeoutSecs: 10,
  keepaliveIntervalSecs: 30,
  verifyHostKey: false,
  exposeLan: false,
  sshAgentSockPath: '',
});

const errors = reactive<Record<string, string>>({});

function clearError(field: string) {
  delete errors[field];
}

function validate(): boolean {
  let valid = true;
  for (const key of Object.keys(errors)) delete errors[key];

  if (!form.name.trim()) {
    errors.name = 'Profile name is required';
    valid = false;
  }
  if (!form.host.trim()) {
    errors.host = 'Host is required';
    valid = false;
  }
  if (!form.username.trim()) {
    errors.username = 'Username is required';
    valid = false;
  }
  if (form.authMethod === 'key' && !form.keyPath.trim()) {
    errors.keyPath = 'Private key path is required';
    valid = false;
  }

  return valid;
}

function resetForm() {
  form.name = '';
  form.host = '';
  form.port = 22;
  form.username = '';
  form.authMethod = 'password';
  form.password = '';
  form.keyPath = '';
  form.keyPassphrase = '';
  form.connectTimeoutSecs = 10;
  form.keepaliveIntervalSecs = 30;
  form.verifyHostKey = false;
  form.exposeLan = false;
  form.sshAgentSockPath = '';
  testResult.value = null;
}

function loadProfile(profile: SshProfile) {
  form.name = profile.name;
  form.host = profile.host;
  form.port = profile.port;
  form.username = profile.username;
  form.authMethod = profile.authMethod || 'password';
  form.password = profile.password;
  form.keyPath = profile.keyPath;
  form.keyPassphrase = profile.keyPassphrase;
  form.connectTimeoutSecs = profile.connectTimeoutSecs || 10;
  form.keepaliveIntervalSecs = profile.keepaliveIntervalSecs || 30;
  form.verifyHostKey = profile.verifyHostKey;
  form.exposeLan = profile.exposeLan;
  form.sshAgentSockPath = profile.sshAgentSockPath ?? '';
}

async function selectKeyFile() {
  try {
    const selected = await open({
      multiple: false,
    });
    if (selected) {
      form.keyPath = selected;
    }
  } catch {
    // user cancelled
  }
}

function show(profile: SshProfile | null) {
  resetForm();
  if (profile) {
    editingId.value = profile.id;
    loadProfile(profile);
  } else {
    editingId.value = null;
  }
  visible.value = true;
}

function close() {
  visible.value = false;
}

function onOpenChange(open: boolean) {
  visible.value = open;
}

async function onTest() {
  if (!validate()) {
    testing.value = false;
    return;
  }
  testing.value = true;
  testResult.value = null;
  try {
    const config: SshTunnelConfig = {
      enabled: true,
      host: form.host,
      port: form.port,
      username: form.username,
      authMethod: form.authMethod,
      password: form.password,
      keyPath: form.keyPath,
      keyPassphrase: form.keyPassphrase,
      useSshAgent: form.authMethod === 'agent',
      sshAgentSockPath: form.sshAgentSockPath,
      connectTimeoutSecs: form.connectTimeoutSecs,
      keepaliveIntervalSecs: form.keepaliveIntervalSecs,
      verifyHostKey: form.verifyHostKey,
      exposeLan: form.exposeLan,
    };
    testResult.value = await sshStore.testConnection(config, form.host, form.port);
  } catch (e) {
    testResult.value = { success: false, message: String(e) };
  } finally {
    testing.value = false;
  }
}

async function onSave() {
  const profile: SshProfile = {
    id: editingId.value ?? '',
    name: form.name,
    host: form.host,
    port: form.port,
    username: form.username,
    authMethod: form.authMethod,
    password: form.password,
    keyPath: form.keyPath,
    keyPassphrase: form.keyPassphrase,
    useSshAgent: form.authMethod === 'agent',
    sshAgentSockPath: form.sshAgentSockPath,
    connectTimeoutSecs: form.connectTimeoutSecs,
    keepaliveIntervalSecs: form.keepaliveIntervalSecs,
    verifyHostKey: form.verifyHostKey,
    exposeLan: form.exposeLan,
  };
  await sshStore.saveProfile(profile);
  close();
}

defineExpose({ show });
</script>
