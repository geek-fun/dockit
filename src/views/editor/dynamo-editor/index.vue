<template>
  <div class="dynamo-editor">
    <tool-bar type="DYNAMO_EDITOR" />
    <ui-editor></ui-editor>
  </div>
</template>

<script setup lang="ts">
import ToolBar from '../../../components/tool-bar.vue';
import UiEditor from './components/ui-editor.vue';
</script>

<style lang="scss" scoped></style>
