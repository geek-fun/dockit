<script setup lang="ts">
import type { AiAction, AiPermissions } from '@/common';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { AI_ACTIONS, aiPreset, getAiPolicy, resolveAiPermissions } from '@/common';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDataStudioStore } from '@/store/dataStudioStore';

const props = defineProps<{ open: boolean; sourceIdx: number }>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();
const { t } = useI18n();
const store = useDataStudioStore();
const source = computed(
  () => store.activeSession?.sources.filter(s => !s.detached)[props.sourceIdx],
);
const base = ref<AiPermissions>({});
const local = ref<AiPermissions>({});
const mode = ref<'inherit' | 'custom'>('inherit');
const loaded = ref(false);
const failedAction = ref<'load' | 'save' | 'detach'>('load');
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const detachConfirming = ref(false);
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
    <DialogContent class="max-h-[85vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-[480px]">
      <DialogHeader class="text-left space-y-2">
        <DialogTitle class="pr-6">{{ t('dataStudio.modifySource.title') }}</DialogTitle>
        <p v-if="source?.alias" class="text-sm font-medium break-all">{{ source.alias }}</p>
        <DialogDescription class="text-xs leading-relaxed">
          {{ t('aiPermissions.conversationHelp') }}
        </DialogDescription>
      </DialogHeader>
      <p v-if="loading" role="status" class="text-sm text-muted-foreground py-3">
        {{ t('aiPermissions.loading') }}
      </p>
      <div v-if="error" role="alert" class="space-y-2">
        <p class="text-sm text-destructive break-words">{{ error }}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          :disabled="loading || saving"
          @click="retry"
        >
          {{ t('aiPermissions.retry') }}
        </Button>
      </div>
      <fieldset
        v-if="!loading && loaded"
        :disabled="saving"
        class="py-2 border-0 min-w-0 space-y-3"
      >
        <div class="space-y-2">
          <Label for="conversation-permission-mode">{{ t('aiPermissions.title') }}</Label>
          <Select v-model="mode" :disabled="saving">
            <SelectTrigger
              id="conversation-permission-mode"
              class="text-left"
              aria-describedby="conversation-effective"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit">{{ t('aiPermissions.useConnection') }}</SelectItem>
              <SelectItem value="custom">{{ t('aiPermissions.limitConversation') }}</SelectItem>
            </SelectContent>
          </Select>
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
            class="py-3 border-b border-border flex gap-3 items-center last:pb-0 last:border-b-0"
          >
            <Checkbox
              :id="`conversation-${action}`"
              class="shrink-0"
              :checked="local[action] === true && base[action] === true"
              :disabled="!base[action] || saving"
              :aria-describedby="!base[action] ? `conversation-denied-${action}` : undefined"
              @update:checked="update(action, $event === true)"
            />
            <div class="min-w-0 space-y-1">
              <Label
                :for="`conversation-${action}`"
                class="leading-snug"
                :class="{ 'text-muted-foreground': !base[action] }"
              >
                {{ t(`aiPermissions.${action}`) }}
              </Label>
              <p
                v-if="!base[action]"
                :id="`conversation-denied-${action}`"
                class="text-xs text-muted-foreground leading-snug"
              >
                {{ t('aiPermissions.deniedByConnection') }}
              </p>
            </div>
          </div>
        </div>
      </fieldset>
      <p v-if="detachConfirming" class="text-sm leading-relaxed">
        {{ t('dataStudio.detachSource.message') }}
      </p>
      <DialogFooter class="pt-3 border-t border-border flex flex-wrap gap-2">
        <template v-if="detachConfirming">
          <Button
            type="button"
            variant="outline"
            :disabled="saving"
            @click="detachConfirming = false"
          >
            {{ t('aiPermissions.cancel') }}
          </Button>
          <Button type="button" variant="destructive" :disabled="saving" @click="detach">
            {{ t('dataStudio.detachSource.confirm') }}
          </Button>
        </template>
        <template v-else>
          <Button
            type="button"
            variant="ghost"
            :disabled="saving"
            class="mr-auto"
            @click="detachConfirming = true"
          >
            {{ t('dataStudio.detachSource.title') }}
          </Button>
          <Button
            type="button"
            variant="outline"
            :disabled="saving"
            @click="emit('update:open', false)"
          >
            {{ t('aiPermissions.cancel') }}
          </Button>
          <Button type="button" :disabled="loading || saving || !loaded" @click="save">
            {{ t(saving ? 'aiPermissions.saving' : 'dataStudio.modifySource.saveChanges') }}
          </Button>
        </template>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
