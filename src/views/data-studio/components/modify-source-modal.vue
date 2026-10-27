<script setup lang="ts">
import type { AiAction, AiPermissions } from '@/common';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { AI_ACTIONS, aiPreset, getAiPolicy, resolveAiPermissions } from '@/common';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useDataStudioStore } from '@/store/dataStudioStore';

type SourceMode = 'inherit' | 'custom';

const props = defineProps<{ open: boolean; sourceIdx: number }>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();
const { t } = useI18n();
const store = useDataStudioStore();
const source = computed(
  () => store.activeSession?.sources.filter(s => !s.detached)[props.sourceIdx],
);
const base = ref<AiPermissions>({});
const local = ref<AiPermissions>({});
const mode = ref<SourceMode>('inherit');
const loaded = ref(false);
const failedAction = ref<'load' | 'save' | 'detach'>('load');
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const detachConfirming = ref(false);
const modeOptions: { value: SourceMode; label: string }[] = [
  { value: 'inherit', label: 'dataStudio.modifySource.inheritTitle' },
  { value: 'custom', label: 'aiPermissions.custom' },
];
const allowed = computed(() =>
  AI_ACTIONS.filter(
    action => base.value[action] && (mode.value === 'inherit' || local.value[action] === true),
  ),
);
let request = 0;
const load = async () => {
  const current = ++request;
  const active = source.value;
  if (!active) return;
  loaded.value = false;
  failedAction.value = 'load';
  loading.value = true;
  error.value = '';
  detachConfirming.value = false;
  mode.value = active.permissionsMode ?? 'inherit';
  local.value = { ...active.permissions };
  try {
    const attached = store.attachedSources.find(item => item.sourceId === active.sourceId);
    const policy = await getAiPolicy();
    if (current !== request) return;
    base.value =
      attached?.kind === 'database'
        ? resolveAiPermissions(
            policy.permission_defaults,
            policy.connection_permissions[String(attached.connectionId)],
          )
        : aiPreset('read');
    loaded.value = true;
  } catch (e) {
    if (current === request) error.value = String(e);
  } finally {
    if (current === request) loading.value = false;
  }
};
watch(
  () => [props.open, source.value?.sourceId],
  () => {
    if (props.open) void load();
  },
  { immediate: true },
);
const update = (action: AiAction, checked: boolean) => {
  local.value = { ...local.value, [action]: checked };
};
const save = async () => {
  const session = store.activeSession;
  const current = source.value;
  if (!session || !current || loading.value || saving.value || !loaded.value) return;
  saving.value = true;
  error.value = '';
  failedAction.value = 'save';
  try {
    if (mode.value === 'inherit') {
      await store.updateSessionSourceMode(session.id, current.sourceId, 'inherit');
    } else {
      const permissions = {
        read: local.value.read === true,
        create: local.value.create === true,
        update: local.value.update === true,
        delete: local.value.delete === true,
        manage: local.value.manage === true,
      };
      await store.updateSessionSourcePermissions(session.id, current.sourceId, permissions);
    }
    emit('update:open', false);
  } catch (e) {
    error.value = String(e);
  } finally {
    saving.value = false;
  }
};
const detach = async () => {
  const session = store.activeSession;
  const current = source.value;
  if (!session || !current || saving.value) return;
  saving.value = true;
  error.value = '';
  failedAction.value = 'detach';
  try {
    await store.detachSourceFromSession(session.id, current.sourceId);
    emit('update:open', false);
  } catch (e) {
    error.value = String(e);
  } finally {
    saving.value = false;
  }
};
const retry = () =>
  failedAction.value === 'load' ? load() : failedAction.value === 'save' ? save() : detach();
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-[480px]">
      <DialogHeader>
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 bg-muted rounded-xl border border-border flex items-center justify-center shrink-0"
          >
            <span class="i-carbon-data-base h-5 w-5" />
          </div>
          <div class="min-w-0">
            <DialogTitle>{{ t('dataStudio.modifySource.title') }}</DialogTitle>
            <p v-if="source?.alias" class="text-sm text-muted-foreground truncate mt-0.5">
              {{ source.alias }}
            </p>
          </div>
        </div>
      </DialogHeader>
      <p v-if="loading" role="status" class="text-sm text-muted-foreground py-2">
        {{ t('aiPermissions.loading') }}
      </p>
      <Alert v-if="error" variant="destructive">
        <AlertDescription class="flex gap-2 items-center justify-between">
          <span class="text-sm break-words">{{ error }}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="shrink-0"
            :disabled="loading || saving"
            @click="retry"
          >
            {{ t('aiPermissions.retry') }}
          </Button>
        </AlertDescription>
      </Alert>
      <fieldset
        v-if="!loading && loaded"
        :disabled="saving"
        class="border-0 p-0 m-0 min-w-0 space-y-3"
      >
        <div class="space-y-2">
          <Label id="conversation-permission-mode">
            {{ t('dataStudio.modifySource.accessPermissions') }}
          </Label>
          <div
            class="grid grid-cols-2 gap-2"
            role="group"
            aria-labelledby="conversation-permission-mode"
          >
            <button
              v-for="option in modeOptions"
              :key="option.value"
              type="button"
              class="px-3 py-2.5 border rounded-lg flex gap-2.5 items-center text-left cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              :class="
                mode === option.value
                  ? 'border-primary bg-primary/5'
                  : 'border-input hover:bg-accent/50'
              "
              :aria-pressed="mode === option.value"
              @click="mode = option.value"
            >
              <span
                class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                :class="mode === option.value ? 'border-primary' : 'border-muted-foreground/40'"
              >
                <span v-if="mode === option.value" class="w-2 h-2 rounded-full bg-primary" />
              </span>
              <span class="text-sm font-medium leading-snug">{{ t(option.label) }}</span>
            </button>
          </div>
          <p
            id="conversation-effective"
            class="text-xs text-muted-foreground leading-relaxed"
            aria-live="polite"
          >
            {{ t('aiPermissions.effective') }}:
            {{
              allowed.map(action => t(`aiPermissions.${action}`)).join(', ') ||
              t('aiPermissions.none')
            }}
          </p>
        </div>
        <div v-if="mode === 'custom'" class="border-t border-border">
          <div
            v-for="action in AI_ACTIONS"
            :key="action"
            class="py-2 border-b border-border flex gap-3 items-center justify-between last:pb-0 last:border-b-0"
          >
            <div class="min-w-0 space-y-0.5">
              <Label
                :for="`conversation-${action}`"
                class="leading-snug"
                :class="{ 'text-muted-foreground': !base[action] }"
              >
                {{ t(`aiPermissions.${action}`) }}
              </Label>
              <p v-if="!base[action]" class="text-xs text-muted-foreground leading-snug">
                {{ t('aiPermissions.deniedByConnection') }}
              </p>
            </div>
            <div class="flex shrink-0 gap-3 items-center">
              <span class="text-xs text-muted-foreground">
                {{ t(local[action] === true ? 'aiPermissions.allow' : 'aiPermissions.deny') }}
              </span>
              <Switch
                :id="`conversation-${action}`"
                :checked="local[action] === true"
                :disabled="!base[action] || saving"
                @update:checked="update(action, $event)"
              />
            </div>
          </div>
        </div>
      </fieldset>
      <DialogFooter class="flex flex-wrap gap-2 items-center justify-between sm:justify-between">
        <div v-if="detachConfirming" class="flex flex-col gap-1.5 mr-auto min-w-0">
          <span class="text-xs text-muted-foreground leading-snug">
            {{ t('dataStudio.detachSource.message') }}
          </span>
          <div class="flex gap-1.5">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              :disabled="saving"
              @click="detach"
            >
              <span class="i-carbon-unlink h-3.5 w-3.5 mr-1" />
              {{ t('dataStudio.detachSource.confirm') }}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              :disabled="saving"
              @click="detachConfirming = false"
            >
              {{ t('dialogOps.cancel') }}
            </Button>
          </div>
        </div>
        <template v-else>
          <Button
            type="button"
            variant="ghost"
            class="text-destructive mr-auto"
            :disabled="saving"
            @click="detachConfirming = true"
          >
            <span class="i-carbon-unlink h-4 w-4 mr-1.5" />
            {{ t('dataStudio.detachSource.title') }}
          </Button>
          <Button
            type="button"
            variant="outline"
            :disabled="saving"
            @click="emit('update:open', false)"
          >
            {{ t('dialogOps.cancel') }}
          </Button>
          <Button type="button" :disabled="loading || saving || !loaded" @click="save">
            {{ t(saving ? 'aiPermissions.saving' : 'dataStudio.modifySource.saveChanges') }}
          </Button>
        </template>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
