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
        <FormItem :label="$t('connection.ssh.profileName')" required>
          <Input v-model="form.name" :placeholder="$t('connection.ssh.profileName')" />
        </FormItem>

        <!-- Host & Port -->
        <Grid :cols="8" :x-gap="3" :y-gap="3">
          <GridItem :span="6">
            <FormItem :label="$t('connection.ssh.host')" required>
              <Input v-model="form.host" :placeholder="$t('connection.ssh.hostPlaceholder')" />
            </FormItem>
          </GridItem>
          <GridItem :span="2">
            <FormItem :label="$t('connection.ssh.port')">
              <Input v-model.number="form.port" type="number" placeholder="22" />
            </FormItem>
          </GridItem>
          <GridItem :span="8">
            <FormItem :label="$t('connection.ssh.username')" required>
              <Input v-model="form.username" autocomplete="off" />
            </FormItem>
          </GridItem>
        </Grid>

        <!-- Auth Method Tabs -->
        <Label>{{ $t('connection.ssh.authMethod') }}</Label>
        <Tabs v-model="form.authMethod">
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
              <Input v-model="form.password" type="password" autocomplete="off" />
            </FormItem>
          </TabsContent>
          <TabsContent value="key" class="mt-3 space-y-3">
            <FormItem :label="$t('connection.ssh.keyPath')">
              <Input
                v-model="form.keyPath"
                :placeholder="$t('connection.ssh.keyPathPlaceholder')"
              />
            </FormItem>
            <FormItem :label="$t('connection.ssh.keyPassphrase')">
              <Input v-model="form.keyPassphrase" type="password" autocomplete="off" />
            </FormItem>
          </TabsContent>
          <TabsContent value="agent" class="mt-3">
            <div class="text-sm text-muted-foreground p-3 border rounded-md">
              {{ $t('connection.ssh.authAgent') }}
            </div>
          </TabsContent>
        </Tabs>

        <!-- Advanced -->
        <div class="flex gap-3">
          <FormItem :label="$t('connection.ssh.connectTimeout')" class="flex-1">
            <Input v-model.number="form.connectTimeoutSecs" type="number" />
          </FormItem>
          <FormItem :label="$t('connection.ssh.keepaliveInterval')" class="flex-1">
            <Input v-model.number="form.keepaliveIntervalSecs" type="number" />
          </FormItem>
        </div>

        <div class="flex items-center gap-2">
          <Switch
            id="expose-lan"
            :checked="form.exposeLan"
            @update:checked="form.exposeLan = $event"
          />
          <Label for="expose-lan" class="text-sm">{{ $t('connection.ssh.exposeLan') }}</Label>
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
import { X } from 'lucide-vue-next';
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
});

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
      sshAgentSockPath: '',
      connectTimeoutSecs: form.connectTimeoutSecs,
      keepaliveIntervalSecs: 30,
      verifyHostKey: false,
      exposeLan: false,
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
    sshAgentSockPath: '',
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
