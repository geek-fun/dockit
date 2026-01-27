<template>
  <div class="editor-setting">
    <div class="grid grid-cols-4 gap-4">
      <div class="col-span-4">
        <div class="title">{{ $t('setting.editor.fontSize') }}</div>
        <div class="content">
          <InputNumber
            v-model="editorConfig.fontSize"
            :min="8"
            :max="32"
            :step="1"
            class="w-[200px]"
            @update:model-value="updateFontSize"
          />
        </div>
      </div>
      <div class="col-span-4">
        <div class="title">{{ $t('setting.editor.fontWeight') }}</div>
        <div class="content">
          <RadioGroup
            v-model="editorConfig.fontWeight"
            class="flex flex-row gap-4"
            @update:model-value="updateFontWeight"
          >
            <div class="flex items-center gap-2">
              <RadioGroupItem value="normal" id="font-normal" />
              <Label for="font-normal">{{ $t('setting.editor.fontWeightNormal') }}</Label>
            </div>
            <div class="flex items-center gap-2">
              <RadioGroupItem value="500" id="font-medium" />
              <Label for="font-medium">{{ $t('setting.editor.fontWeightMedium') }}</Label>
            </div>
            <div class="flex items-center gap-2">
              <RadioGroupItem value="bold" id="font-bold" />
              <Label for="font-bold">{{ $t('setting.editor.fontWeightBold') }}</Label>
            </div>
          </RadioGroup>
        </div>
      </div>
      <div class="col-span-4">
        <div class="title">{{ $t('setting.editor.showLineNumbers') }}</div>
        <div class="content">
          <Switch
            :checked="editorConfig.showLineNumbers"
            @update:checked="updateShowLineNumbers"
          />
        </div>
      </div>
      <div class="col-span-4">
        <div class="title">{{ $t('setting.editor.showMinimap') }}</div>
        <div class="content">
          <Switch
            :checked="editorConfig.showMinimap"
            @update:checked="updateShowMinimap"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useAppStore } from '../../../store';
import { InputNumber } from '@/components/ui/input-number';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

const appStore = useAppStore();
const { setEditorConfig } = appStore;
const { editorConfig } = storeToRefs(appStore);

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
    padding: 10px 0;
  }
}
</style>
