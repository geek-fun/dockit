<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div @click="handleActionClick" v-html="parsedMarkdown"></div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js'; // https://highlightjs.org

import { useAppStore } from '../store';
import { useTabStore } from '@/store/tabStore';
import { useMessageService } from '@/composables';

const props = defineProps({
  markdown: {
    type: String,
    required: true,
  },
});

const appStore = useAppStore();
const { uiThemeType } = storeToRefs(appStore);

watch(
  () => uiThemeType.value,
  async () => {
    if (uiThemeType.value === 'dark') {
      await import('highlight.js/styles/atom-one-dark.css');
    } else {
      await import('highlight.js/styles/atom-one-light.css');
    }
  },
  { immediate: true },
);

const tabStore = useTabStore();
const message = useMessageService();
const { t } = useI18n();

const parsedMarkdown = ref('');

const md = new MarkdownIt({
  linkify: true,
  breaks: true,
  highlight: (str, lang) => {
    let highlightedCode = '';
    if (lang && hljs.getLanguage(lang)) {
      try {
        highlightedCode = hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
      } catch (_e) {
        // highlight failed, fallback to escaped HTML
      }
    } else {
      highlightedCode = md.utils.escapeHtml(str);
    }
    // encodeURIComponent + btoa to safely encode any Unicode content
    const encodedCode = btoa(unescape(encodeURIComponent(str)));
    return `<div class='code-actions-bar'>
      <svg class='code-action-btn' data-tooltip='Copy' data-action='copy' data-code='${encodedCode}' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M28 10v18H10V10h18m0-2H10a2 2 0 0 0-2 2v18a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2z' fill='currentColor'></path><path d='M4 18H2V4a2 2 0 0 1 2-2h14v2H4z' fill='currentColor'></path></svg>
      <svg class='code-action-btn' data-tooltip='Insert to editor' data-action='insert' data-code='${encodedCode}' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M28 12H10a2.002 2.002 0 0 1-2-2V4a2.002 2.002 0 0 1 2-2h18a2.002 2.002 0 0 1 2 2v6a2.002 2.002 0 0 1-2 2zM10 4v6h18V4z' fill='currentColor'></path><path d='M28 30H10a2.002 2.002 0 0 1-2-2v-6a2.002 2.002 0 0 1 2-2h18a2.002 2.002 0 0 1 2 2v6a2.002 2.002 0 0 1-2 2zm-18-8v6h18v-6z' fill='currentColor'></path><path d='M9 16l-5.586-5.586L2 11.828L6.172 16L2 20.172l1.414 1.414L9 16z' fill='currentColor'></path></svg>
    </div><code class='hljs'>${highlightedCode}</code>`;
  },
});

md.use(taskLists, { enabled: true, label: true, labelAfter: true });

// Wrap <table> in a scrollable div so wide tables don't overflow narrow containers.
md.renderer.rules.table_open = () => '<div class="table-wrapper"><table>';
md.renderer.rules.table_close = () => '</table></div>';

md.renderer.rules['code'] = (tokens, idx, _options, _env, _self) => {
  const token = tokens[idx];
  const code = token.content.trim();
  return `${code}`;
};

const RENDER_THROTTLE_MS = 100;
let pendingValue: string | null = null;
let lastRenderAt = 0;
let trailingTimer: ReturnType<typeof setTimeout> | null = null;

const runRender = (value: string) => {
  parsedMarkdown.value = DOMPurify.sanitize(md.render(value));
  lastRenderAt = Date.now();
  pendingValue = null;
};

const scheduleRender = (value: string) => {
  pendingValue = value;
  const elapsed = Date.now() - lastRenderAt;
  if (elapsed >= RENDER_THROTTLE_MS) {
    if (trailingTimer) {
      clearTimeout(trailingTimer);
      trailingTimer = null;
    }
    runRender(value);
    return;
  }
  if (trailingTimer) return;
  trailingTimer = setTimeout(() => {
    trailingTimer = null;
    if (pendingValue !== null) runRender(pendingValue);
  }, RENDER_THROTTLE_MS - elapsed);
};

watch(
  () => props.markdown,
  newMarkdown => {
    scheduleRender(`${newMarkdown}`);
  },
  { immediate: true },
);

const handleActionClick = (e: MouseEvent) => {
  const btn = (e.target as HTMLElement).closest('.code-action-btn') as HTMLElement | null;
  if (!btn) return;
  const action = btn.getAttribute('data-action');
  const encoded = btn.getAttribute('data-code');
  if (!action || !encoded) return;
  try {
    const decoded = decodeURIComponent(escape(atob(encoded)));
    if (action === 'copy') {
      navigator.clipboard.writeText(decoded);
      message.success(t('aside.chatBotCodeCopied'));
    } else if (action === 'insert') {
      tabStore.setPendingInsertQuery(decoded);
      message.success(t('aside.chatBotCodeInserted'));
    }
  } catch (_e) {
    // decode failed
  }
};

onUnmounted(() => {
  if (trailingTimer) {
    clearTimeout(trailingTimer);
    trailingTimer = null;
    if (pendingValue !== null) runRender(pendingValue);
  }
});
</script>

<style>
pre {
  margin: 0;
  padding: 0;
  position: relative;
}

pre code {
  display: block;
}

/* Action bar: sits as a block row at the top-right of the pre, no overlap with code */
.code-actions-bar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
  pointer-events: none;
  height: 24px;
  box-sizing: border-box;
}

pre:hover .code-actions-bar {
  opacity: 1;
  pointer-events: auto;
}

.code-action-btn {
  width: 15px;
  height: 15px;
  cursor: pointer;
  color: hsl(var(--muted-foreground));
  transition: color 0.12s ease;
  flex-shrink: 0;
  position: relative;
}

.code-action-btn:hover {
  color: hsl(var(--foreground));
}

/* CSS tooltip */
.code-action-btn::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: calc(100% + 5px);
  right: 0;
  background: hsl(var(--popover));
  color: hsl(var(--popover-foreground));
  border: 1px solid hsl(var(--border));
  font-size: 11px;
  white-space: nowrap;
  padding: 3px 7px;
  border-radius: 4px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.1s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  font-family: ui-sans-serif, system-ui, sans-serif;
}

.code-action-btn:hover::after {
  opacity: 1;
}

.table-wrapper {
  overflow-x: auto;
  margin: 8px 0;
  -webkit-overflow-scrolling: touch;
}

.table-wrapper::-webkit-scrollbar {
  height: 4px;
}

.table-wrapper::-webkit-scrollbar-track {
  background: transparent;
}

.table-wrapper::-webkit-scrollbar-thumb {
  background: hsl(var(--border));
  border-radius: 2px;
}

.table-wrapper table {
  margin: 0;
}
</style>
