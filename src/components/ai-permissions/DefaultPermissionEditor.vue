<script setup lang="ts">
import type { AiAction, AiPermissions } from '@/common';
import { invoke } from '@tauri-apps/api/core';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { AI_ACTIONS, aiPreset, getAiPolicy } from '@/common';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const { t } = useI18n();
const rules = ref<AiPermissions>({});
const loading = ref(true);
const loaded = ref(false);
const saving = ref(false);
const error = ref('');
const saved = ref(false);
const custom = ref(false);
const presets = ['none', 'read', 'data', 'full'];
const preset = computed(
  () =>
    presets.find(value =>
      AI_ACTIONS.every(action => aiPreset(value)[action] === rules.value[action]),
    ) ?? 'custom',
);
const load = async () => {
  loading.value = true;
  error.value = '';
  try {
    rules.value = (await getAiPolicy()).permission_defaults;
    loaded.value = true;
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
};
onMounted(load);
const update = (action: AiAction, value: string) => {
  rules.value = { ...rules.value, [action]: value === 'allow' };
  saved.value = false;
};
const save = async () => {
  if (saving.value || !loaded.value) return;
  saving.value = true;
  error.value = '';
  saved.value = false;
  try {
    await invoke('save_ai_permissions', { defaults: rules.value });
    saved.value = true;
  } catch (e) {
    error.value = String(e);
  } finally {
    saving.value = false;
  }
};
const selectPreset = (value: string) => {
  if (value === 'custom') {
    custom.value = true;
    return;
  }
  rules.value = aiPreset(value);
  saved.value = false;
};
</script>

<template>
  <section
    class="space-y-4"
    :aria-label="t('aiPermissions.defaults')"
    :aria-busy="loading || saving"
  >
    <div class="space-y-1.5">
      <h3 class="text-sm font-medium">{{ t('aiPermissions.defaults') }}</h3>
      <p class="text-xs text-muted-foreground leading-relaxed max-w-prose">
        {{ t('aiPermissions.defaultsHelp') }}
      </p>
    </div>
    <p v-if="loading" role="status" class="text-sm text-muted-foreground">
      {{ t('aiPermissions.loading') }}
    </p>
    <div v-if="error" role="alert" class="space-y-2">
      <p class="text-sm text-destructive break-words">
        {{ t(loaded ? 'aiPermissions.saveFailed' : 'aiPermissions.loadError') }}: {{ error }}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        :disabled="loading || saving"
        @click="loaded ? save() : load()"
      >
        {{ t('aiPermissions.retry') }}
      </Button>
    </div>
    <fieldset
      v-if="!loading && loaded"
      :disabled="saving"
      class="p-0 border-0 min-w-0 max-w-lg space-y-3"
    >
      <div class="space-y-2">
        <Label for="ai-default-preset">{{ t('aiPermissions.accessLevel') }}</Label>
        <Select
          :model-value="preset"
          :disabled="saving"
          @update:model-value="selectPreset(String($event))"
        >
          <SelectTrigger
            id="ai-default-preset"
            class="text-left"
            aria-describedby="ai-default-help"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="value in presets" :key="value" :value="value">
              {{ t(`aiPermissions.${value === 'read' ? 'readPreset' : value}`) }}
            </SelectItem>
            <SelectItem v-if="preset === 'custom'" value="custom">
              {{ t('aiPermissions.custom') }}
            </SelectItem>
          </SelectContent>
        </Select>
        <p id="ai-default-help" class="text-xs text-muted-foreground leading-relaxed">
          {{ t('aiPermissions.manageHelp') }}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="-ml-3 gap-2"
        :disabled="saving"
        :aria-expanded="custom"
        aria-controls="ai-default-actions"
        @click="custom = !custom"
      >
        <span
          aria-hidden="true"
          class="i-lucide-chevron-right h-4 w-4"
          :class="{ 'rotate-90': custom }"
        />
        {{ t('aiPermissions.customize') }}
      </Button>
      <div v-if="custom" id="ai-default-actions" class="border-t border-border">
        <div
          v-for="action in AI_ACTIONS"
          :key="action"
          class="py-3 border-b border-border flex gap-3 items-center justify-between last:border-b-0"
        >
          <Label :for="`ai-default-${action}`" class="leading-snug">
            {{ t(`aiPermissions.${action}`) }}
          </Label>
          <Select
            :model-value="rules[action] ? 'allow' : 'deny'"
            :disabled="saving"
            @update:model-value="update(action, String($event))"
          >
            <SelectTrigger :id="`ai-default-${action}`" class="text-left w-36 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="allow">{{ t('aiPermissions.allow') }}</SelectItem>
              <SelectItem value="deny">{{ t('aiPermissions.deny') }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div class="pt-3 border-t border-border flex flex-wrap gap-3 items-center justify-end">
        <p
          v-if="saved"
          role="status"
          class="text-xs text-muted-foreground mr-auto flex gap-1.5 items-center"
        >
          <span aria-hidden="true" class="i-lucide-check h-4 w-4" />
          {{ t('aiPermissions.saved') }}
        </p>
        <Button type="button" size="sm" :disabled="saving" @click="save">
          {{ t(saving ? 'aiPermissions.saving' : 'aiPermissions.save') }}
        </Button>
      </div>
    </fieldset>
  </section>
</template>
