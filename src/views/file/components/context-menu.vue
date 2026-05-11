<template>
  <div
    ref="menuRef"
    class="context-menu focus:outline-none"
    role="menu"
    tabindex="-1"
    :style="{ top: `${position?.y}px`, left: `${position?.x}px` }"
    @keydown.down.prevent="handleMenuKeyDown"
    @keydown.up.prevent="handleMenuKeyDown"
    @keydown.enter.prevent="handleMenuKeyDown"
    @keydown.space.prevent="handleMenuKeyDown"
    @keydown.escape.prevent="handleMenuKeyDown"
  >
    <ul>
      <li
        v-for="(action, index) in actions"
        :key="action.action"
        role="menuitem"
        tabindex="-1"
        :class="['menu-item', index === highlightedMenuIndex && 'bg-accent']"
        @click="handleAction(action.action)"
      >
        {{ action.label }}
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ContextMenuAction } from '../../../store';
import { useLang } from '../../../lang';
import { ref, watchEffect, nextTick } from 'vue';

const props = defineProps({
  position: { type: Object, default: undefined },
  file: { type: Object, default: undefined },
});

const lang = useLang();

const actions = ref<Array<{ label: string; action: ContextMenuAction }>>([]);
const highlightedMenuIndex = ref(-1);
const menuRef = ref<HTMLElement | null>(null);

const emits = defineEmits(['context-menu-action-emit', 'close']);

const closeMenu = () => {
  highlightedMenuIndex.value = -1;
  emits('close');
};

watchEffect(() => {
  if (props.position && actions.value.length > 0) {
    highlightedMenuIndex.value = 0;
    nextTick(() => {
      const firstItem = menuRef.value?.querySelector('[role="menuitem"]');
      (firstItem as HTMLElement)?.focus();
    });
  }
});

watchEffect(() => {
  if (props.file) {
    actions.value = [
      {
        label: lang.t('file.contextMenu.open'),
        action: ContextMenuAction.CONTEXT_MENU_ACTION_OPEN,
      },
      {
        label: lang.t('file.contextMenu.rename'),
        action: ContextMenuAction.CONTEXT_MENU_ACTION_RENAME,
      },
      {
        label: lang.t('file.contextMenu.delete'),
        action: ContextMenuAction.CONTEXT_MENU_ACTION_DELETE,
      },
    ];
  } else {
    actions.value = [
      { label: lang.t('file.newFile'), action: ContextMenuAction.CONTEXT_MENU_ACTION_NEW_FILE },
      { label: lang.t('file.newFolder'), action: ContextMenuAction.CONTEXT_MENU_ACTION_NEW_FOLDER },
    ];
  }
});

const handleAction = async (action: ContextMenuAction) => {
  emits('context-menu-action-emit', action);
  closeMenu();
};

const handleMenuKeyDown = (e: KeyboardEvent) => {
  const items = actions.value;
  if (!items.length) return;

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      highlightedMenuIndex.value =
        highlightedMenuIndex.value < items.length - 1 ? highlightedMenuIndex.value + 1 : 0;
      nextTick(() => {
        const menuItems = menuRef.value?.querySelectorAll('[role="menuitem"]');
        if (menuItems && menuItems[highlightedMenuIndex.value]) {
          (menuItems[highlightedMenuIndex.value] as HTMLElement).focus();
        }
      });
      break;
    case 'ArrowUp':
      e.preventDefault();
      highlightedMenuIndex.value =
        highlightedMenuIndex.value > 0 ? highlightedMenuIndex.value - 1 : items.length - 1;
      nextTick(() => {
        const menuItems = menuRef.value?.querySelectorAll('[role="menuitem"]');
        if (menuItems && menuItems[highlightedMenuIndex.value]) {
          (menuItems[highlightedMenuIndex.value] as HTMLElement).focus();
        }
      });
      break;
    case 'Enter':
    case ' ':
      e.preventDefault();
      if (highlightedMenuIndex.value >= 0) {
        handleAction(items[highlightedMenuIndex.value].action);
      }
      break;
    case 'Escape':
      e.preventDefault();
      closeMenu();
      break;
  }
};
</script>

<style scoped>
.context-menu {
  position: absolute;
  background-color: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  box-shadow: 0 0 1px rgba(0, 0, 0, 0.1);
  z-index: 1000;

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    min-width: 150px;

    li {
      padding: 8px 12px;
      cursor: pointer;

      &:hover {
        background: hsl(var(--border));
      }
    }
  }
}
</style>
