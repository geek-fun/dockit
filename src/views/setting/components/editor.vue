<template>
  <div class="editor-setting space-y-6 max-w-3xl">
    <!-- Font Size Setting -->
    <div class="py-4 px-5 border-border border rounded-lg bg-card space-y-3">
      <div>
        <h4 class="text-sm font-semibold">{{ $t('setting.editor.fontSize') }}</h4>
        <p class="text-xs text-muted-foreground mt-1">
          Adjust the font size for the code editor (8-32px)
        </p>
      </div>
      <InputNumber
        :model-value="editorConfig.fontSize"
        :min="8"
        :max="32"
        :step="1"
        class="w-[200px]"
        @update:model-value="updateFontSize"
      />
    </div>

    <!-- Font Weight Setting -->
    <div class="py-4 px-5 border-border border rounded-lg bg-card space-y-3">
      <div>
        <h4 class="text-sm font-semibold">{{ $t('setting.editor.fontWeight') }}</h4>
        <p class="text-xs text-muted-foreground mt-1">
          Select the font weight for better readability
        </p>
      </div>
      <RadioGroup
        :model-value="editorConfig.fontWeight"
        class="flex flex-row gap-3"
        @update:model-value="updateFontWeight"
      >
        <div
          :class="[
            'flex items-center gap-2.5 py-2.5 px-4 rounded-lg border cursor-pointer transition-all min-w-[120px]',
            editorConfig.fontWeight === 'normal'
              ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
              : 'border-input hover:border-primary/50 hover:bg-accent/50',
          ]"
          @click="updateFontWeight('normal')"
        >
          <RadioGroupItem id="font-normal" value="normal" />
          <Label for="font-normal" class="font-medium cursor-pointer text-sm">
            {{ $t('setting.editor.fontWeightNormal') }}
          </Label>
        </div>
        <div
          :class="[
            'flex items-center gap-2.5 py-2.5 px-4 rounded-lg border cursor-pointer transition-all min-w-[120px]',
            editorConfig.fontWeight === '500'
              ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
              : 'border-input hover:border-primary/50 hover:bg-accent/50',
          ]"
          @click="updateFontWeight('500')"
        >
          <RadioGroupItem id="font-medium" value="500" />
          <Label for="font-medium" class="font-medium cursor-pointer text-sm">
            {{ $t('setting.editor.fontWeightMedium') }}
          </Label>
        </div>
        <div
          :class="[
            'flex items-center gap-2.5 py-2.5 px-4 rounded-lg border cursor-pointer transition-all min-w-[120px]',
            editorConfig.fontWeight === 'bold'
              ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
              : 'border-input hover:border-primary/50 hover:bg-accent/50',
          ]"
          @click="updateFontWeight('bold')"
        >
          <RadioGroupItem id="font-bold" value="bold" />
          <Label for="font-bold" class="font-medium cursor-pointer text-sm">
            {{ $t('setting.editor.fontWeightBold') }}
          </Label>
        </div>
      </RadioGroup>
    </div>

    <!-- Line Numbers Toggle -->
    <div
      class="flex items-center justify-between py-4 px-5 border-border border rounded-lg bg-card hover:bg-accent/20 transition-colors"
    >
      <div class="space-y-0.5">
        <h4 class="text-sm font-semibold">{{ $t('setting.editor.showLineNumbers') }}</h4>
        <p class="text-xs text-muted-foreground">Display line numbers in the editor</p>
      </div>
      <Switch :checked="editorConfig.showLineNumbers" @update:checked="updateShowLineNumbers" />
    </div>

    <!-- Minimap Toggle -->
    <div
      class="flex items-center justify-between py-4 px-5 border-border border rounded-lg bg-card hover:bg-accent/20 transition-colors"
    >
      <div class="space-y-0.5">
        <h4 class="text-sm font-semibold">{{ $t('setting.editor.showMinimap') }}</h4>
        <p class="text-xs text-muted-foreground">Show code overview minimap on the right side</p>
      </div>
      <Switch :checked="editorConfig.showMinimap" @update:checked="updateShowMinimap" />
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

<style scoped></style>
