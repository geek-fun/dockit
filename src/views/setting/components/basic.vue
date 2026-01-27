<template>
  <div class="basic-setting">
    <div class="grid grid-cols-4 gap-4">
      <div class="col-span-4">
        <div class="title">{{ $t('setting.theme') }}</div>
        <div class="content">
          <div
            v-for="theme in themeTypes"
            :key="theme.type"
            class="content-item"
            :class="{ active: themeType === theme.type }"
            @click="setTheme(theme.type)"
          >
            <div class="img-box">
              <img :src="theme.img" :alt="theme.name" />
            </div>
            <div class="item-desc">{{ $t(`setting.${theme.name}`) }}</div>
            <div class="item-checked">
              <CheckOutlined class="w-4 h-4 text-white" />
            </div>
          </div>
        </div>
      </div>
      <div class="col-span-4">
        <div class="title">{{ $t('setting.language') }}</div>
        <div class="content">
          <RadioGroup
            v-model="languageType"
            class="flex flex-row gap-4"
            @update:model-value="langTypeChange"
          >
            <div v-for="langItem in langTypes" :key="langItem.type" class="flex items-center gap-2">
              <RadioGroupItem :id="`lang-${langItem.type}`" :value="langItem.type" />
              <Label :for="`lang-${langItem.type}`">
                {{ langItem.name === 'auto' ? $t('setting.auto') : langItem.name }}
              </Label>
            </div>
          </RadioGroup>
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
import { CheckOutlined } from '@vicons/antd';
import { lang } from '../../../lang';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

const appStore = useAppStore();
const { setThemeType } = appStore;
const { themeType, languageType } = storeToRefs(appStore);

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

<style lang="scss" scoped>
.basic-setting {
  .title {
    font-weight: bold;
    margin-bottom: 5px;
  }
  .content {
    display: flex;
    flex-wrap: wrap;
    padding: 10px 0;
    .content-item {
      width: 140px;
      height: 120px;
      margin: 10px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      position: relative;
      .img-box {
        flex: 1;
        height: 0;
        border-radius: 5px;
        overflow: hidden;
        transition: 0.3s;
        box-shadow: 0 0 8px transparent;
        img {
          height: 100%;
          width: 100%;
        }
      }
      .item-desc {
        height: 32px;
        line-height: 32px;
        text-align: center;
        transition: 0.3s;
      }
      .item-checked {
        position: absolute;
        top: 5px;
        right: 5px;
        opacity: 0;
        transition: 0.3s;
        height: 25px;
        width: 25px;
        border-radius: 50%;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: var(--theme-color);
        box-shadow: 0 0 5px rgba(0, 0, 0, 0.5);
      }
      &.active {
        .img-box {
          box-shadow: 0 0 8px #2478ec;
        }
        .item-desc {
          font-weight: bold;
        }
        .item-checked {
          opacity: 1;
        }
      }
    }
  }
}
</style>
