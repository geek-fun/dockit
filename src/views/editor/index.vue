<template>
  <div id="editor" ref="editor"></div>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import * as monaco from 'monaco-editor';

/**
 * refer https://github.com/wobsoriano/codeplayground
 * https://github.com/wobsoriano/codeplayground/blob/master/src/components/MonacoEditor.vue
 */
monaco.languages.register({ id: 'custom' });

const editor = ref();

onMounted(() => {
  monaco.editor.create(editor.value, {
    value: `// Type source code in your language here...
class MyClass {
  @attribute
  void main() {
    Console.writeln( "Hello Monarch world\n");
  }
}`,
    language: 'custom',
  });
});
</script>

<style scoped>
#editor {
  width: 100vw;
  height: 100vh;
}
</style>
