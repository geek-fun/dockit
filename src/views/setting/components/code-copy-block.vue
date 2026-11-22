<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/components/ui/button';

defineProps<{ code: string; label: string }>();

const { t } = useI18n();
const copied = ref(false);

const copy = async (code: string) => {
  try {
    await navigator.clipboard.writeText(code);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = code;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
};
</script>

<template>
  <div class="relative min-w-0">
    <pre
      class="font-mono text-xs bg-muted rounded-md px-3 py-2 pr-10 overflow-x-auto leading-relaxed"
      >{{ code }}</pre>
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      class="absolute top-1 right-1"
      :aria-label="label"
      @click="copy"
    >
      <span
        aria-hidden="true"
        class="h-3.5 w-3.5"
        :class="copied ? 'i-lucide-check text-green-500' : 'i-lucide-copy'"
      />
    </Button>
    <span v-if="copied" role="status" class="sr-only">
      {{ t('setting.mcp.install.copied') }}
    </span>
  </div>
</template>
