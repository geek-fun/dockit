<script setup lang="ts">
import type { AiAction, AiPermissions } from '@/common';
import { invoke } from '@tauri-apps/api/core';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { AI_ACTIONS, aiPreset, getAiPolicy } from '@/common';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import AccessLevelPicker from './AccessLevelPicker.vue';

const { t } = useI18n();
const rules = ref<AiPermissions>({});
const loading = ref(true);
const loaded = ref(false);
const saving = ref(false);
const error = ref('');
const saved = ref(false);
const editingCustom = ref(false);
const presets = ['none', 'read', 'data', 'full'];
const preset = computed(() =>
  editingCustom.value
    ? 'custom'
    : (presets.find(value =>
        AI_ACTIONS.every(action => aiPreset(value)[action] === rules.value[action]),
      ) ?? 'custom'),
);
const load = async () => {
  loading.value = true;
  error.value = '';
  try {
    rules.value = (await getAiPolicy()).permission_defaults;
    editingCustom.value = false;
    loaded.value = true;
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
};
onMounted(load);
const update = (action: AiAction, value: boolean) => {
  editingCustom.value = true;
  rules.value = { ...rules.value, [action]: value };
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
  editingCustom.value = value === 'custom';
  if (value === 'custom') return;
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
    <div class="space-y-1">
      <h3 class="text-sm font-semibold">{{ t('aiPermissions.defaults') }}</h3>
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
    <fieldset v-if="!loading && loaded" :disabled="saving" class="p-0 border-0 min-w-0 space-y-4">
      <AccessLevelPicker
        id="ai-default-preset"
        :model-value="preset"
        :disabled="saving"
        @update:model-value="selectPreset"
      />
      <div v-if="preset === 'custom'" class="border-t border-border">
        <div
          v-for="action in AI_ACTIONS"
          :key="action"
          class="py-3 border-b border-border flex gap-4 items-center justify-between last:border-b-0"
        >
          <Label :for="`ai-default-${action}`" class="leading-snug">
            {{ t(`aiPermissions.${action}`) }}
          </Label>
          <div class="flex gap-3 items-center shrink-0">
            <span class="text-xs text-muted-foreground">
              {{ t(rules[action] ? 'aiPermissions.allow' : 'aiPermissions.deny') }}
            </span>
            <Switch
              :id="`ai-default-${action}`"
              :checked="rules[action] === true"
              :disabled="saving"
              @update:checked="update(action, $event)"
            />
          </div>
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
