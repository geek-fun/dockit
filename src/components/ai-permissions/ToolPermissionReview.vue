<script setup lang="ts">
import type { AccessDenial, AiPermissions } from '@/common';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { saveAiPermissions } from '@/common';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { loadConfirmationRules } from '@/datasources/agentApi';
import { useConnectionStore, useEntitlementStore } from '@/store';
import { useDataStudioStore } from '@/store/dataStudioStore';
import ModifySourceModal from '@/views/data-studio/components/modify-source-modal.vue';
import ConnectionPermissionEditor from './ConnectionPermissionEditor.vue';

const props = defineProps<{
  open: boolean;
  denial: AccessDenial;
  toolName: string;
  sessionId: string;
}>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();
const { t } = useI18n();
const store = useDataStudioStore();
const connectionStore = useConnectionStore();
const entitlementStore = useEntitlementStore();
const connection = computed(() =>
  props.denial.connectionId
    ? connectionStore.connections.find(
        connection => String(connection.id) === props.denial.connectionId,
      )
    : undefined,
);
const reviewConnection = computed(
  () =>
    props.denial.source !== 'rule' &&
    props.denial.source !== 'conversation' &&
    connection.value !== undefined,
);
const rules = ref<AiPermissions>({});
const editor = ref<InstanceType<typeof ConnectionPermissionEditor> | null>(null);
const saving = ref(false);
const error = ref('');
const ruleRemoved = ref(false);
const sourceIdx = computed(() =>
  store.activeSession?.id === props.sessionId
    ? store.activeSession.sources
        .filter(source => !source.detached)
        .findIndex(source => source.sourceId === props.denial.sourceId)
    : -1,
);
const reviewConversation = computed(
  () => props.denial.source === 'conversation' && sourceIdx.value >= 0,
);
watch(
  () => [props.open, props.denial],
  () => {
    error.value = '';
    ruleRemoved.value = false;
  },
);
const saveConnection = async () => {
  if (
    !reviewConnection.value ||
    !props.denial.connectionId ||
    !entitlementStore.isLocalUltimate ||
    !editor.value?.ready ||
    saving.value
  )
    return;
  saving.value = true;
  error.value = '';
  try {
    await saveAiPermissions(props.denial.connectionId, rules.value);
    emit('update:open', false);
  } catch (cause) {
    error.value = String(cause);
  } finally {
    saving.value = false;
  }
};
const removeRule = async () => {
  saving.value = true;
  error.value = '';
  try {
    const rules = await loadConfirmationRules(props.sessionId);
    const rule = rules.find(
      rule => rule.tool_name === props.toolName && rule.action === 'deny_always',
    );
    if (rule) await store.removeConfirmationRule(rule.id);
    ruleRemoved.value = true;
  } catch (cause) {
    error.value = String(cause);
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <ModifySourceModal
    v-if="reviewConversation"
    :open="open"
    :source-idx="sourceIdx"
    @update:open="emit('update:open', $event)"
  />
  <Dialog v-else :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-h-[85vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{{ t('dataStudio.agent.message.reviewPermissions') }}</DialogTitle>
        <DialogDescription>
          {{
            t(
              reviewConnection
                ? 'dataStudio.agent.message.reviewConnectionHelp'
                : 'dataStudio.agent.message.reviewHelp',
            )
          }}
        </DialogDescription>
      </DialogHeader>
      <p v-if="reviewConnection" class="text-sm font-medium break-words">
        {{ t('dataStudio.agent.message.connectionLabel', { name: connection?.name }) }}
      </p>
      <p v-if="error" role="alert" class="text-sm text-destructive break-words">
        {{ error }}
      </p>
      <template v-if="denial.source === 'rule'">
        <p class="text-sm leading-relaxed">
          {{ t('dataStudio.agent.message.denialSource.rule') }}
        </p>
        <p v-if="ruleRemoved" role="status" class="text-sm">
          {{ t('dataStudio.agent.message.ruleRemoved') }}
        </p>
      </template>
      <p v-else-if="denial.source === 'conversation'" class="text-sm leading-relaxed">
        {{ t('dataStudio.agent.message.sourceUnavailable') }}
      </p>
      <fieldset v-else-if="reviewConnection" :disabled="saving" class="min-w-0">
        <ConnectionPermissionEditor
          ref="editor"
          v-model="rules"
          :connection-id="denial.connectionId"
          initially-expanded
        />
      </fieldset>
      <p v-else class="text-sm leading-relaxed">
        {{ t('dataStudio.agent.message.connectionUnavailable') }}
      </p>
      <DialogFooter class="pt-4 border-t border-border">
        <Button
          type="button"
          variant="outline"
          :disabled="saving"
          @click="emit('update:open', false)"
        >
          {{ t('dataStudio.agent.message.backToChat') }}
        </Button>
        <Button
          v-if="denial.source === 'rule' && !ruleRemoved"
          type="button"
          :disabled="saving"
          @click="removeRule"
        >
          {{ t('dataStudio.agent.message.removeDenyRule') }}
        </Button>
        <Button
          v-else-if="reviewConnection && entitlementStore.isLocalUltimate"
          type="button"
          :disabled="saving || !editor?.ready"
          @click="saveConnection"
        >
          {{ t(saving ? 'aiPermissions.saving' : 'dataStudio.modifySource.saveChanges') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
