<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="shortcuts-dialog-content">
      <DialogHeader>
        <DialogTitle>{{ lang.t('shortcuts.title') }}</DialogTitle>
        <DialogDescription>{{ lang.t('shortcuts.description') }}</DialogDescription>
      </DialogHeader>

      <div class="shortcuts-container">
        <!-- Common shortcuts section -->
        <div class="shortcuts-section">
          <h4 class="section-title">{{ lang.t('shortcuts.common') }}</h4>
          <table class="shortcuts-table">
            <tbody>
              <tr>
                <td class="shortcut-action">{{ lang.t('shortcuts.showShortcuts') }}</td>
                <td class="shortcut-keys">
                  <kbd>{{ cmdKey }}</kbd>
                  <span class="key-separator">+</span>
                  <kbd>Shift</kbd>
                  <span class="key-separator">+</span>
                  <kbd>/</kbd>
                </td>
              </tr>
              <tr>
                <td class="shortcut-action">{{ lang.t('shortcuts.execute') }}</td>
                <td class="shortcut-keys">
                  <kbd>{{ cmdKey }}</kbd>
                  <span class="key-separator">+</span>
                  <kbd>Enter</kbd>
                </td>
              </tr>
              <tr>
                <td class="shortcut-action">{{ lang.t('shortcuts.format') }}</td>
                <td class="shortcut-keys">
                  <kbd>{{ cmdKey }}</kbd>
                  <span class="key-separator">+</span>
                  <kbd>I</kbd>
                </td>
              </tr>
              <tr>
                <td class="shortcut-action">{{ lang.t('shortcuts.autocomplete') }}</td>
                <td class="shortcut-keys">
                  <kbd>{{ cmdKey }}</kbd>
                  <span class="key-separator">+</span>
                  <kbd>Space</kbd>
                </td>
              </tr>
              <tr>
                <td class="shortcut-action">{{ lang.t('shortcuts.comment') }}</td>
                <td class="shortcut-keys">
                  <kbd>{{ cmdKey }}</kbd>
                  <span class="key-separator">+</span>
                  <kbd>/</kbd>
                </td>
              </tr>
              <tr>
                <td class="shortcut-action">{{ lang.t('shortcuts.toggleFold') }}</td>
                <td class="shortcut-keys">
                  <kbd>{{ cmdKey }}</kbd>
                  <span class="key-separator">+</span>
                  <template v-if="isMac">
                    <kbd>⌥</kbd>
                  </template>
                  <template v-else>
                    <kbd>Shift</kbd>
                  </template>
                  <span class="key-separator">+</span>
                  <kbd>L</kbd>
                </td>
              </tr>
              <tr>
                <td class="shortcut-action">{{ lang.t('shortcuts.foldAll') }}</td>
                <td class="shortcut-keys">
                  <kbd>{{ cmdKey }}</kbd>
                  <span class="key-separator">+</span>
                  <kbd>K</kbd>
                  <span class="key-separator">,</span>
                  <kbd>{{ cmdKey }}</kbd>
                  <span class="key-separator">+</span>
                  <kbd>-</kbd>
                </td>
              </tr>
              <tr>
                <td class="shortcut-action">{{ lang.t('shortcuts.expandAll') }}</td>
                <td class="shortcut-keys">
                  <kbd>{{ cmdKey }}</kbd>
                  <span class="key-separator">+</span>
                  <kbd>K</kbd>
                  <span class="key-separator">,</span>
                  <kbd>{{ cmdKey }}</kbd>
                  <span class="key-separator">+</span>
                  <kbd>J</kbd>
                </td>
              </tr>
              <tr>
                <td class="shortcut-action">{{ lang.t('shortcuts.saveFile') }}</td>
                <td class="shortcut-keys">
                  <kbd>{{ cmdKey }}</kbd>
                  <span class="key-separator">+</span>
                  <kbd>S</kbd>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- ES Editor specific shortcuts -->
        <div v-if="editorType === 'ES_EDITOR'" class="shortcuts-section">
          <h4 class="section-title">{{ lang.t('shortcuts.esSpecific') }}</h4>
          <table class="shortcuts-table">
            <tbody>
              <tr>
                <td class="shortcut-action">{{ lang.t('shortcuts.openDocs') }}</td>
                <td class="shortcut-keys">
                  <template v-if="isMac">
                    <kbd>{{ cmdKey }}</kbd>
                    <span class="key-separator">+</span>
                    <kbd>D</kbd>
                  </template>
                  <template v-else>
                    <kbd>Ctrl</kbd>
                    <span class="key-separator">+</span>
                    <kbd>Shift</kbd>
                    <span class="key-separator">+</span>
                    <kbd>D</kbd>
                  </template>
                </td>
              </tr>
              <tr>
                <td class="shortcut-action">{{ lang.t('shortcuts.prevRequest') }}</td>
                <td class="shortcut-keys">
                  <kbd>{{ cmdKey }}</kbd>
                  <span class="key-separator">+</span>
                  <kbd>↑</kbd>
                </td>
              </tr>
              <tr>
                <td class="shortcut-action">{{ lang.t('shortcuts.nextRequest') }}</td>
                <td class="shortcut-keys">
                  <kbd>{{ cmdKey }}</kbd>
                  <span class="key-separator">+</span>
                  <kbd>↓</kbd>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" size="sm" @click="closeDialog">
          {{ lang.t('dialogOps.close') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { platform } from '@tauri-apps/plugin-os';
import { useLang } from '../lang';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const props = defineProps<{
  open: boolean;
  editorType?: string;
}>();

const emits = defineEmits<{
  'update:open': [value: boolean];
}>();

const lang = useLang();
const isOpen = ref(props.open);

// Platform-aware key display — wrapped in try/catch for non-Tauri environments
const cmdKey = computed(() => {
  try {
    return platform() === 'macos' ? '⌘' : 'Ctrl';
  } catch {
    return 'Ctrl';
  }
});

const isMac = computed(() => {
  try {
    return platform() === 'macos';
  } catch {
    return false;
  }
});

// Sync open state with parent
watch(
  () => props.open,
  newVal => {
    isOpen.value = newVal;
  },
);

watch(isOpen, newVal => {
  emits('update:open', newVal);
});

const closeDialog = () => {
  isOpen.value = false;
};
</script>

<style scoped>
.shortcuts-dialog-content {
  max-width: 500px;
}

.shortcuts-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.shortcuts-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--foreground));
  margin: 0;
  padding-bottom: 4px;
  border-bottom: 1px solid hsl(var(--border));
}

.shortcuts-table {
  width: 100%;
  border-collapse: collapse;
}

.shortcuts-table tbody tr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
}

.shortcuts-table tbody tr:not(:last-child) {
  border-bottom: 1px solid hsl(var(--border) / 0.5);
}

.shortcut-action {
  font-size: 13px;
  color: hsl(var(--foreground));
  flex: 1;
}

.shortcut-keys {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 22px;
  padding: 2px 6px;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: 500;
  line-height: 1;
  color: hsl(var(--foreground));
  background: hsl(var(--muted));
  border: 1px solid hsl(var(--border));
  border-radius: 4px;
  box-shadow: 0 1px 0 hsl(var(--border));
}

.key-separator {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.platform-note {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  margin-left: 4px;
}
</style>
