<template>
  <div id="editor" ref="editorRef"></div>
</template>
<script setup lang="ts">
import * as monaco from 'monaco-editor';
import { useAppStore } from '../../store';
const appStore = useAppStore();
/**
 * refer https://github.com/wobsoriano/codeplayground
 * https://github.com/wobsoriano/codeplayground/blob/master/src/components/MonacoEditor.vue
 */
monaco.languages.register({ id: 'search' });
monaco.languages.setMonarchTokensProvider('search', {
  // Set defaultToken to invalid to see what you do not tokenize yet
  defaultToken: 'invalid',
  tokenPostfix: '.search',

  // keywords of elasticsearch
  keywords: [
    'GET',
    'POST',
    'PUT',
    'DELETE',
    'HEAD',
    'OPTIONS',
    'PATCH',
    'TRACE',
    'index',
    'indices',
    'type',
    'types',
    'from',
    'size',
    'explain',
    'analyze',
    'default_operator',
    'df',
    'analyzer',
    'lenient',
    'lowercase_expanded_terms',
    'analyze_wildcard',
    'all_shards',
    'allow_no_indices',
    'expand_wildcards',
    'preference',
    'routing',
    'ignore_unavailable',
    'allow_no_indices',
    'ignore_throttled',
    'search_type',
    'batched_reduce_size',
    'ccs_minimize_roundtrips',
    'max_concurrent_shard_requests',
    'pre_filter_shard_size',
    'rest_total_hits_as_int',
    'scroll',
    'search_type',
    'typed_keys',
    'wait_for_active_shards',
    'wait_for_completion',
    'requests_per_second',
    'slices',
    'timeout',
    'terminate_after',
    'stats',
    'version',
    'version_type',
    'if_seq_no',
    'if_primary_term',
    'refresh',
    'routing',
    'parent',
    'preference',
    'realtime',
    'refresh',
    'retry_on_conflict',
    'timeout',
    'version',
    'version_type',
    'if_seq_no',
    'if_primary_term',
    'pipeline',
    'wait_for_active_shards',
    'wait_for_completion',
    'requests_per_second',
    'slices',
    'timeout',
    'terminate_after',
    'stats',
    'version',
    'version_type',
    'if_seq_no',
    'if_primary_term',
    'refresh',
    'routing',
    'parent',
    'preference',
    'realtime',
    'refresh',
    'retry_on_conflict',
    'timeout',
    'version',
    'version_type',
    'if_seq_no',
    'if_primary_term',
    'pipeline',
    'wait_for_active_shards',
    'wait_for_completion',
    'requests_per_second',
    'slices',
    'timeout',
    'terminate_after',
    'stats',
    'version',
    'version_type',
    '_search',
  ],

  typeKeywords: ['any', 'boolean', 'number', 'object', 'string', 'undefined'],

  // we include these common regular expressions
  symbols: /[=><!~?:&|+\-*\\^%]+/,
  escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
  digits: /\d+(_+\d+)*/,
  octaldigits: /[0-7]+(_+[0-7]+)*/,
  binarydigits: /[0-1]+(_+[0-1]+)*/,
  hexdigits: /[[0-9a-fA-F]+(_+[0-9a-fA-F]+)*/,

  // The main tokenizer for our languages
  tokenizer: {
    root: [
      [/^(GET|DELETE|POST|PUT)\s\w+/, 'action-execute-decoration'],
      [/[{}]/, 'delimiter.bracket'],
      { include: 'common' },
    ],

    common: [
      // identifiers and keywords
      [
        /[a-z_$][\w$]*/,
        {
          cases: {
            '@typeKeywords': 'keyword',
            '@keywords': 'keyword',
            '@default': 'identifier',
          },
        },
      ],

      // whitespace
      { include: '@whitespace' },
      // json block
      { include: '@json' },
    ],

    json: [
      // JSON strings
      [/"(?:\\.|[^\\"])*"/, 'string'],

      // JSON numbers
      [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],

      // JSON booleans
      [/\b(?:true|false)\b/, 'keyword'],

      // JSON null
      [/\bnull\b/, 'keyword'],

      // JSON property names
      [/"(?:\\.|[^\\"])*"(?=\s*:)/, 'key'],

      // JSON punctuation
      [/[{}[\],:]/, 'delimiter'],

      // JSON whitespace
      { include: '@whitespace' },
    ],

    whitespace: [
      [/[ \t\r\n]+/, ''],
      [/\/\*\*(?!\/)/, 'comment.doc'],
      [/\/\*/, 'comment', '@comment'],
      [/\/\/.*$/, 'comment'],
    ],

    comment: [
      [/[^/*]+/, 'comment'],
      [/\*\//, 'comment', '@pop'],
      [/[/*]/, 'comment'],
    ],
  },
});

// DOM
const editorRef = ref();

const editorView = ref();
const themeMedia = window.matchMedia('(prefers-color-scheme: light)');
const systemTheme = ref(themeMedia.matches);
themeMedia.addListener(e => {
  systemTheme.value = e.matches;
});

// set Editoer theme name
const editorTheme = computed(() => {
  // 'vs-dark',
  let isDark = appStore.themeType === 0 ? !systemTheme.value : appStore.themeType === 1;
  return isDark ? 'vs-dark' : 'vs-light';
});

watch(
  () => editorTheme.value,
  () => {
    editorView.value.updateOptions({ theme: editorTheme.value });
  },
);

const code = `// Type source code in your language here...
GET students/_search
{
  "query": {
    "bool": {
      "filter": [
        { "term":  { "honors": true }},
        { "range": { "graduation_year": { "gte": 2020, "lte": 2022 }}}
      ]
    }
  }
}

GET cat/_index

GET students/_search
{
  "query": {
    "bool": {
      "filter": [
        { "term":  { "honors": true }},
        { "range": { "graduation_year": { "gte": 2020, "lte": 2022 }}}
      ]
    }
  }
}
`;
const executionGutterClass = 'execute-button-decoration';

let executeDecorations = [];
const refreshActionMarks = (editor: monaco.Editor) => {
  // Get the model of the editor
  const model = editor.getModel();

  // Tokenize the entire content of the model
  const tokens = monaco.editor.tokenize(model!.getValue(), model!.getLanguageId());
  tokens.forEach((lineTokens, lineIndex) => {
    lineTokens.forEach(token => {
      if (token.type === 'action-execute-decoration.search') {
        const lineNumber = lineIndex + 1;
        const decoration = {
          id: lineNumber,
          range: new monaco.Range(lineNumber, 1, lineNumber, 1),
          options: { isWholeLine: true, linesDecorationsClassName: executionGutterClass },
        };
        const targetLine = executeDecorations.indexOf(item => item.id === lineNumber);
        executeDecorations = executeDecorations.map(item => {
          if (item.id === lineNumber) {
            return decoration;
          }
          return item;
        });
        if (targetLine) {
          executeDecorations.splice(executeDecorations.indexOf(targetLine), 1, decoration);
        } else {
          executeDecorations.push(decoration);
        }
        executeDecorations = executeDecorations.sort((a, b) => a.id - b.id);

        editor.deltaDecorations([], executeDecorations);
      }
    });
  });
};
const executeQueryAction = (
  editor: monaco.Editor,
  position: { column: number; lineNumber: number },
) => {
  const model = editor.getModel();
  const lineContent = model.getLineContent(position.lineNumber);
  // eslint-disable-next-line no-console
  console.log(`lineContent ${lineContent}`);
  // eslint-disable-next-line no-console
  console.log(`executeQueryAction ${JSON.stringify(executeDecorations)}`);
};

onMounted(() => {
  const editor = monaco.editor.create(editorRef.value, {
    automaticLayout: true,
    theme: editorTheme.value,
    value: code,
    language: 'search',
  });
  editorView.value = editor;
  // Register language injection rule
  editor.onMouseDown(e => {
    refreshActionMarks(editor);
    if (
      e.event.leftButton &&
      e.target.type === 4 &&
      Object.values(e.target!.element!.classList).includes(executionGutterClass)
    ) {
      executeQueryAction(editor, e.target.position);
    }
  });
});
</script>

<style lang="scss">
#editor {
  width: 100%;
  height: 100%;
}
.execute-button-decoration {
  background: red;
  cursor: pointer;
  width: 15px !important;
  margin-left: 3px;
}
</style>
