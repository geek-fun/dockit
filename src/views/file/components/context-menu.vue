<template>
  <div class="context-menu" :style="{ top: `${position?.y}px`, left: `${position?.x}px` }">
    <ul>
      <li v-for="action in actions" @click="handleAction(action.action)">{{ action.label }}</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ContextMenuAction } from '../../../store';
import { useLang } from '../../../lang';

const props = defineProps({
  position: Object,
  file: Object,
});

const lang = useLang();

const actions = ref<Array<{ label: string; action: ContextMenuAction }>>([]);

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

const emits = defineEmits(['context-menu-action-emit']);

const handleAction = async (action: ContextMenuAction) => {
  emits('context-menu-action-emit', action);
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
