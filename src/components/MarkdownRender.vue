<template>
  <div v-html="parsedMarkdown"></div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js'; // https://highlightjs.org
import 'highlight.js/styles/default.css';
import { Bot } from '@vicons/carbon';
const props = defineProps({
  markdown: {
    type: String,
    required: true,
  },
});
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

    return `
      <pre>
        <div class='code-actions'>
        <n-tooltip trigger='hover'>
          <template #trigger>
            <n-button>
            <bot/>
            <n-icon>
    </n-icon></n-button>
          </template>
            Copy Code Block
        </n-tooltip>
          <button>Insert Code Block at Cursor</button>
        </div>
        <code class='hljs'>${highlightedCode}</code>
      </pre>
    `;
  },
});

watch(
  () => props.markdown,
  newMarkdown => {
    parsedMarkdown.value = md.render(`${newMarkdown}`);
    console.log('new markdown', newMarkdown);
  },
  { immediate: true },
);
</script>

<style lang="scss">
pre {
  position: relative;
  padding: 15px;
  border-radius: 5px;

  &:hover {
    .code-actions {
      display: flex;
    }
  }
  .code-actions {
    position: absolute;
    right: 0;
    top: 0;
    display: none;
    border-radius: 5px;
    padding: 5px;

    button {
      margin: 0 5px;
      padding: 5px 10px;
      border: none;
      border-radius: 3px;
      cursor: pointer;

      &:hover {
      }
    }
  }
}
</style>
