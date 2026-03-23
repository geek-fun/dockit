<template>
  <div class="basic-setting space-y-8">
    <!-- Theme Section -->
    <div class="space-y-4">
      <div>
        <h3 class="text-lg font-semibold">{{ $t('setting.theme') }}</h3>
        <p class="text-sm text-muted-foreground mt-1">{{ $t('setting.themeDesc') }}</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card
          v-for="theme in themeTypes"
          :key="theme.type"
          :class="[
            'cursor-pointer transition-all hover:border-primary/50',
            themeType === theme.type
              ? 'border-primary ring-2 ring-primary/20'
              : 'border-border hover:shadow-md',
          ]"
          @click="setTheme(theme.type)"
        >
          <CardContent class="p-4 space-y-3">
            <div class="relative aspect-video rounded-md overflow-hidden border bg-muted">
              <img :src="theme.img" :alt="theme.name" class="w-full h-full object-cover" />
              <div
                v-if="themeType === theme.type"
                class="absolute top-2 right-2 h-6 w-6 rounded-full bg-primary flex items-center justify-center shadow-lg"
              >
                <span class="i-carbon-checkmark w-4 h-4 text-primary-foreground" />
              </div>
            </div>
            <div class="text-center">
              <p class="font-medium">{{ $t(`setting.${theme.name}`) }}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- Language Section -->
    <div class="space-y-4">
      <div>
        <h3 class="text-lg font-semibold">{{ $t('setting.language') }}</h3>
        <p class="text-sm text-muted-foreground mt-1">{{ $t('setting.languageDesc') }}</p>
      </div>
      <RadioGroup
        :model-value="languageType"
        class="flex flex-row gap-3"
        @update:model-value="langTypeChange"
      >
        <div
          v-for="langItem in langTypes"
          :key="langItem.type"
          :class="[
            'flex items-center gap-2.5 py-2.5 px-4 rounded-lg border cursor-pointer transition-all min-w-[140px]',
            languageType === langItem.type
              ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
              : 'border-input hover:border-primary/50 hover:bg-accent/50',
          ]"
          @click="langTypeChange(langItem.type)"
        >
          <RadioGroupItem :id="`lang-${langItem.type}`" :value="langItem.type" />
          <Label :for="`lang-${langItem.type}`" class="font-medium cursor-pointer text-sm">
            {{ langItem.name === 'auto' ? $t('setting.auto') : langItem.name }}
          </Label>
        </div>
      </RadioGroup>
    </div>

    <!-- History Section -->
    <div class="space-y-4">
      <div>
        <h3 class="text-lg font-semibold">{{ $t('setting.history.title') }}</h3>
      </div>
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-1.5">
          <Label class="text-sm font-medium">{{ $t('setting.history.historyCap') }}</Label>
          <p class="text-xs text-muted-foreground">{{ $t('setting.history.historyCapDesc') }}</p>
          <InputNumber
            :model-value="historyConfig.historyCap"
            :min="HISTORY_CAP_MIN"
            :max="HISTORY_CAP_MAX"
            :step="10"
            class="w-36"
            @update:model-value="
              val => setHistoryConfig({ historyCap: val ?? HISTORY_CAP_DEFAULT })
            "
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import lightImg from '../../../assets/img/theme-light.png';
import darkImg from '../../../assets/img/theme-dark.png';
import autoImg from '../../../assets/img/theme-auto.png';
import { LanguageType, ThemeType, useAppStore } from '../../../store';
import { HISTORY_CAP_MIN, HISTORY_CAP_MAX, HISTORY_CAP_DEFAULT } from '../../../common';
import { lang } from '../../../lang';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { InputNumber } from '@/components/ui/input-number';

const appStore = useAppStore();
const { setThemeType, setHistoryConfig } = appStore;
const { themeType, languageType, historyConfig } = storeToRefs(appStore);

const themeTypes = [
  { type: ThemeType.AUTO, img: autoImg, name: 'auto' },
  { type: ThemeType.DARK, img: darkImg, name: 'dark' },
  { type: ThemeType.LIGHT, img: lightImg, name: 'light' },
];
const langTypes = [
  { type: LanguageType.AUTO, name: 'auto' },
  { type: LanguageType.ZH_CN, name: '简体中文' },
  { type: LanguageType.EN_US, name: 'English' },
];

const setTheme = (type: ThemeType) => {
  setThemeType(type);
};

const langTypeChange = (value: string) => {
  // Validate that the value is a valid LanguageType before assigning
  if (Object.values(LanguageType).includes(value as LanguageType)) {
    languageType.value = value as LanguageType;
    lang.global.locale.value =
      languageType.value === LanguageType.ZH_CN ? LanguageType.ZH_CN : LanguageType.EN_US;
  }
};
</script>

<style scoped>
.basic-setting {
  max-width: 1200px;
}
</style>
