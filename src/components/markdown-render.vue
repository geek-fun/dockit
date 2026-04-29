<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div ref="rootEl" v-html="parsedMarkdown"></div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js'; // https://highlightjs.org

import { useAppStore, useCodeActionStore } from '../store';

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

const codeActionStore = useCodeActionStore();
const { insertBuffer } = storeToRefs(codeActionStore);

const rootEl = ref<HTMLElement | null>(null);
const parsedMarkdown = ref('');

const md = new MarkdownIt({
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
      <svg class='code-action-btn' data-tooltip='Copy' onclick="document.dispatchEvent(new CustomEvent('chatbot-code-actions', {detail: {code: '${encodedCode}', action: 'copy'}}))" xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M28 10v18H10V10h18m0-2H10a2 2 0 0 0-2 2v18a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2z' fill='currentColor'></path><path d='M4 18H2V4a2 2 0 0 1 2-2h14v2H4z' fill='currentColor'></path></svg>
      <svg class='code-action-btn' data-tooltip='Insert to editor' onclick="document.dispatchEvent(new CustomEvent('chatbot-code-actions', {detail: {code: '${encodedCode}', action: 'insert'}}))" xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M28 12H10a2.002 2.002 0 0 1-2-2V4a2.002 2.002 0 0 1 2-2h18a2.002 2.002 0 0 1 2 2v6a2.002 2.002 0 0 1-2 2zM10 4v6h18V4z' fill='currentColor'></path><path d='M28 30H10a2.002 2.002 0 0 1-2-2v-6a2.002 2.002 0 0 1 2-2h18a2.002 2.002 0 0 1 2 2v6a2.002 2.002 0 0 1-2 2zm-18-8v6h18v-6z' fill='currentColor'></path><path d='M9 16l-5.586-5.586L2 11.828L6.172 16L2 20.172l1.414 1.414L9 16z' fill='currentColor'></path></svg>
    </div><code class='hljs'>${highlightedCode}</code>`;
  },
});

md.renderer.rules['code'] = (tokens, idx, _options, _env, _self) => {
  const token = tokens[idx];
  const code = token.content.trim();
  return `${code}`;
};

watch(
  () => props.markdown,
  newMarkdown => {
    parsedMarkdown.value = md.render(`${newMarkdown}`);
  },
  { immediate: true },
);

const onCodeAction = (event: Event) => {
  const { detail } = event as unknown as { detail: { action: string; code: string } };
  try {
    const decoded = decodeURIComponent(escape(atob(detail.code)));
    if (detail.action === 'copy') {
      navigator.clipboard.writeText(decoded);
    } else if (detail.action === 'insert') {
      insertBuffer.value = decoded;
    }
  } catch (_e) {
    // decode failed
  }
};

onMounted(() => {
  document.addEventListener('chatbot-code-actions', onCodeAction);
});

onUnmounted(() => {
  document.removeEventListener('chatbot-code-actions', onCodeAction);
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
</style>
