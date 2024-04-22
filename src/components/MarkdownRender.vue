<template>
  <div v-html="parsedMarkdown"></div>
</template>

<script setup lang="ts">
import { defineProps, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js'; // https://highlightjs.org
import 'highlight.js/styles/default.css';
import { useChatStore } from '../store';

const props = defineProps({
  markdown: {
    type: String,
    required: true,
  },
});

const chatStore = useChatStore();
const { insertBoard } = storeToRefs(chatStore);

const parsedMarkdown = ref('');
const md = new MarkdownIt({
  highlight: function (str, lang) {
    let highlightedCode = '';
    if (lang && hljs.getLanguage(lang)) {
      try {
        highlightedCode = hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
      } catch (__) {}
    } else {
      highlightedCode = md.utils.escapeHtml(str);
    }
    const encodedCode = btoa(str);
    return `
    <div class="code-actions">
        <svg class="code-action-copy"  onclick="document.dispatchEvent(new CustomEvent('chatbot-code-actions', {detail: {code: '${encodedCode}', action: 'copy'}}))"    xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 32 32"><path d="M28 10v18H10V10h18m0-2H10a2 2 0 0 0-2 2v18a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2z" fill="currentColor"></path><path d="M4 18H2V4a2 2 0 0 1 2-2h14v2H4z" fill="currentColor"></path></svg>
        <svg class="code-action-insert" onclick="document.dispatchEvent(new CustomEvent('chatbot-code-actions', {detail: {code: '${encodedCode}', action: 'insert'}}))"   xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 32 32"><path d="M28 12H10a2.002 2.002 0 0 1-2-2V4a2.002 2.002 0 0 1 2-2h18a2.002 2.002 0 0 1 2 2v6a2.002 2.002 0 0 1-2 2zM10 4v6h18V4z" fill="currentColor"></path><path d="M28 30H10a2.002 2.002 0 0 1-2-2v-6a2.002 2.002 0 0 1 2-2h18a2.002 2.002 0 0 1 2 2v6a2.002 2.002 0 0 1-2 2zm-18-8v6h18v-6z" fill="currentColor"></path><path d="M9 16l-5.586-5.586L2 11.828L6.172 16L2 20.172l1.414 1.414L9 16z" fill="currentColor"></path></svg>
    </div>
    <code class='hljs'>${highlightedCode}</code>

    `;
  },
});

md.renderer.rules['code'] = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const code = token.content.trim();
  console.log('code block', code);
  return `${code}`;
};

watch(
  () => props.markdown,
  newMarkdown => {
    parsedMarkdown.value = md.render(`${newMarkdown}`);
    console.log('new markdown', newMarkdown);
  },
  { immediate: true },
);
onMounted(() => {
  document.addEventListener('chatbot-code-actions', event => {
    const { detail } = event as unknown as { detail: { action: string; code: string } };
    if (detail.action === 'copy') {
      navigator.clipboard.writeText(atob(detail.code));
    } else if (detail.action === 'insert') {
      insertBoard.value = atob(detail.code);
    }
  });
});
</script>

<style lang="scss">
pre {
  margin: 0;
  padding: 0;
  .code-actions {
    float: right;
    width: 40px;
    height: 18px;
    display: flex;
    border-radius: 5px;
    .code-action-copy {
      width: 18px;
      height: 18px;
      cursor: pointer;
      margin-right: 5px;
    }
    .code-action-insert {
      width: 18px;
      height: 18px;
      cursor: pointer;
    }
  }
}
</style>
