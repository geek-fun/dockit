<script setup lang="ts">
import type { AiAction, AiPermissions } from '@/common';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { AI_ACTIONS, aiPreset, getAiPolicy, resolveAiPermissions } from '@/common';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const props = defineProps<{ modelValue?: AiPermissions; connectionId?: string | number }>();
const emit = defineEmits<{ 'update:modelValue': [value: AiPermissions] }>();
const { t } = useI18n();
const loading = ref(true);
const error = ref('');
const defaults = ref<AiPermissions>({});
const custom = ref(false);
const expanded = ref(false);
watch(error, value => {
  if (value) expanded.value = true;
});
let request = 0;
const load = async () => {
  const current = ++request;
  loading.value = true;
  error.value = '';
  try {
    const policy = await getAiPolicy();
    if (current !== request) return;
    defaults.value = policy.permission_defaults;
    emit('update:modelValue', policy.connection_permissions[String(props.connectionId)] ?? {});
  } catch (e) {
    if (current === request) error.value = String(e);
  } finally {
    if (current === request) loading.value = false;
  }
};
watch(() => props.connectionId, load, { immediate: true });
const presets = ['inherit', 'none', 'read', 'data', 'full'];
const preset = computed(
  () =>
    presets.find(value =>
      AI_ACTIONS.every(action => aiPreset(value)[action] === props.modelValue?.[action]),
    ) ?? 'custom',
);
const effective = computed(() => resolveAiPermissions(defaults.value, props.modelValue));
const update = (action: AiAction, value: string) => {
  const { [action]: _previous, ...rest } = props.modelValue ?? {};
  emit('update:modelValue', value === 'inherit' ? rest : { ...rest, [action]: value === 'allow' });
};
defineExpose({ ready: computed(() => !loading.value && !error.value) });
const selectPreset = (value: string) => {
  if (value === 'custom') {
    custom.value = true;
    return;
  }
  emit('update:modelValue', aiPreset(value));
};
</script>

<template>
  <details
    :open="expanded"
    class="group border border-border rounded-lg"
    @toggle="expanded = ($event.target as HTMLDetailsElement).open"
  >
    <summary
      class="text-sm font-medium p-3 rounded-lg flex gap-2 items-center justify-between cursor-pointer list-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
    >
      <span class="flex gap-2 items-center">
        <span
          aria-hidden="true"
          class="i-lucide-chevron-right text-muted-foreground h-4 w-4 shrink-0 group-open:rotate-90"
        />
        {{ t('aiPermissions.title') }}
      </span>
      <span class="text-xs text-muted-foreground font-normal text-right" role="status">
        {{
          loading
            ? t('aiPermissions.loading')
            : error
              ? t('aiPermissions.unavailable')
              : t(`aiPermissions.${preset === 'read' ? 'readPreset' : preset}`)
        }}
      </span>
    </summary>
    <div class="px-3 pb-3 space-y-3">
      <p class="text-xs text-muted-foreground leading-relaxed">
        {{ t('aiPermissions.help') }}
      </p>
      <p v-if="loading" role="status" class="text-sm text-muted-foreground">
        {{ t('aiPermissions.loading') }}
      </p>
      <div v-else-if="error" role="alert" class="space-y-2">
        <p class="text-sm text-destructive break-words">
          {{ t('aiPermissions.loadFailed') }} {{ error }}
        </p>
        <Button type="button" variant="outline" size="sm" @click="load">
          {{ t('aiPermissions.retry') }}
        </Button>
      </div>
      <template v-else>
        <div class="space-y-2">
          <Label :for="`ai-preset-${connectionId ?? 'new'}`">
            {{ t('aiPermissions.accessLevel') }}
          </Label>
          <Select :model-value="preset" @update:model-value="selectPreset(String($event))">
            <SelectTrigger :id="`ai-preset-${connectionId ?? 'new'}`" class="text-left">
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
          <p class="text-xs text-muted-foreground leading-relaxed">
            {{ t('aiPermissions.effective') }}:
            {{
              AI_ACTIONS.filter(action => effective[action])
                .map(action => t(`aiPermissions.${action}`))
                .join(', ') || t('aiPermissions.none')
            }}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="-ml-3 gap-2"
          :aria-expanded="custom"
          :aria-controls="`ai-actions-${connectionId ?? 'new'}`"
          @click="custom = !custom"
        >
          <span
            aria-hidden="true"
            class="i-lucide-chevron-right h-4 w-4"
            :class="{ 'rotate-90': custom }"
          />
          {{ t('aiPermissions.customize') }}
        </Button>
        <div
          v-if="custom"
          :id="`ai-actions-${connectionId ?? 'new'}`"
          class="border-t border-border"
        >
          <div
            v-for="action in AI_ACTIONS"
            :key="action"
            class="py-3 border-b border-border flex gap-3 items-center justify-between last:pb-0 last:border-b-0"
          >
            <div class="min-w-0 space-y-1">
              <Label :for="`ai-${connectionId ?? 'new'}-${action}`" class="leading-snug">
                {{ t(`aiPermissions.${action}`) }}
              </Label>
              <p
                :id="`ai-origin-${connectionId ?? 'new'}-${action}`"
                class="text-xs text-muted-foreground leading-snug"
              >
                {{ t(effective[action] ? 'aiPermissions.allow' : 'aiPermissions.deny') }} ·
                {{
                  t(
                    modelValue?.[action] === undefined
                      ? 'aiPermissions.fromSystem'
                      : 'aiPermissions.fromConnection',
                  )
                }}
              </p>
            </div>
            <Select
              :model-value="
                modelValue?.[action] === undefined
                  ? 'inherit'
                  : modelValue[action]
                    ? 'allow'
                    : 'deny'
              "
              @update:model-value="update(action, String($event))"
            >
              <SelectTrigger
                :id="`ai-${connectionId ?? 'new'}-${action}`"
                :aria-describedby="`ai-origin-${connectionId ?? 'new'}-${action}`"
                class="text-left w-36 shrink-0"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="value in ['inherit', 'allow', 'deny']"
                  :key="value"
                  :value="value"
                >
                  {{ t(`aiPermissions.${value === 'inherit' ? 'fromSystem' : value}`) }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </template>
    </div>
  </details>
</template>
