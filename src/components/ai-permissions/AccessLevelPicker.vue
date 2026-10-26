<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const props = defineProps<{
  id: string;
  modelValue: string;
  inherit?: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const { t } = useI18n();
const options = computed(() => [
  ...(props.inherit ? ['inherit'] : []),
  'none',
  'read',
  'data',
  'full',
  'custom',
]);
</script>

<template>
  <div class="space-y-2">
    <Label :id="`${id}-label`">{{ t('aiPermissions.accessLevel') }}</Label>
    <RadioGroup
      :model-value="modelValue"
      :disabled="disabled"
      :aria-labelledby="`${id}-label`"
      class="access-level-options"
      @update:model-value="emit('update:modelValue', String($event))"
    >
      <Label
        v-for="value in options"
        :key="value"
        :for="`${id}-${value}`"
        class="text-sm font-medium px-3 py-2.5 border rounded-lg flex gap-2.5 items-center cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
        :class="[
          modelValue === value ? 'border-primary bg-primary/5' : 'border-input hover:bg-accent/50',
          disabled && 'cursor-not-allowed opacity-50',
        ]"
      >
        <RadioGroupItem
          :id="`${id}-${value}`"
          :value="value"
          :aria-labelledby="`${id}-${value}-title`"
          :aria-describedby="`${id}-description`"
          class="shrink-0"
        />
        <span :id="`${id}-${value}-title`" class="min-w-0 leading-snug">
          {{ t(`aiPermissions.${value === 'read' ? 'readPreset' : value}`) }}
        </span>
      </Label>
    </RadioGroup>
    <p :id="`${id}-description`" class="text-xs text-muted-foreground leading-relaxed">
      {{ t(`aiPermissions.${modelValue}Help`) }}
    </p>
  </div>
</template>

<style scoped>
.access-level-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 9.5rem), 1fr));
  gap: 0.5rem;
}
</style>
