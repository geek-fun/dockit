<template>
  <div class="editor-setting">
    <n-grid cols="4" item-responsive responsive="screen" x-gap="10" y-gap="10">
      <n-gi span="4">
        <div class="title">{{ $t('setting.editor.fontSize') }}</div>
        <div class="content">
          <n-input-number
            v-model:value="fontSize"
            :min="8"
            :max="32"
            :step="1"
            @update:value="updateFontSize"
          />
        </div>
      </n-gi>
      <n-gi span="4">
        <div class="title">{{ $t('setting.editor.fontWeight') }}</div>
        <div class="content">
          <n-radio-group
            v-model:value="fontWeight"
            name="fontWeightGroup"
            @update:value="updateFontWeight"
          >
            <n-radio value="normal">{{ $t('setting.editor.fontWeightNormal') }}</n-radio>
            <n-radio value="500">{{ $t('setting.editor.fontWeightMedium') }}</n-radio>
            <n-radio value="bold">{{ $t('setting.editor.fontWeightBold') }}</n-radio>
          </n-radio-group>
        </div>
      </n-gi>
      <n-gi span="4">
        <div class="title">{{ $t('setting.editor.showLineNumbers') }}</div>
        <div class="content">
          <n-switch v-model:value="showLineNumbers" @update:value="updateShowLineNumbers" />
        </div>
      </n-gi>
      <n-gi span="4">
        <div class="title">{{ $t('setting.editor.showMinimap') }}</div>
        <div class="content">
          <n-switch v-model:value="showMinimap" @update:value="updateShowMinimap" />
        </div>
      </n-gi>
    </n-grid>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useAppStore } from '../../../store';

const appStore = useAppStore();
const { setEditorConfig } = appStore;
const { editorConfig } = storeToRefs(appStore);

const fontSize = ref(editorConfig.value.fontSize);
const fontWeight = ref(editorConfig.value.fontWeight);
const showLineNumbers = ref(editorConfig.value.showLineNumbers);
const showMinimap = ref(editorConfig.value.showMinimap);

const updateFontSize = (value: number | null) => {
  if (value !== null) {
    setEditorConfig({ fontSize: value });
  }
};

const updateFontWeight = (value: string) => {
  setEditorConfig({ fontWeight: value });
};

const updateShowLineNumbers = (value: boolean) => {
  setEditorConfig({ showLineNumbers: value });
};

const updateShowMinimap = (value: boolean) => {
  setEditorConfig({ showMinimap: value });
};
</script>

<style lang="scss" scoped>
.editor-setting {
  .title {
    font-weight: bold;
    margin-bottom: 5px;
  }
  .content {
    display: flex;
    flex-wrap: wrap;
    .n-input-number {
      width: 200px;
    }
    .n-radio {
      margin: 10px;
    }
  }
}
</style>
