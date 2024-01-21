<template>
  <div class="basic-setting">
    <n-grid cols="4" item-responsive responsive="screen" x-gap="10" y-gap="10">
      <n-gi span="4">
        <div class="title">{{ $t('setting.theme') }}</div>
        <div class="content">
          <div
            v-for="item in themeTypeList"
            :key="item.type"
            class="content-item"
            :class="{
              active: activeType === item.type,
            }"
            @click="setThemeType(item.type)"
          >
            <div class="img-box">
              <img :src="item.img" :alt="item.name" />
            </div>
            <div class="item-desc">{{ $t(`setting.${item.name}`) }}</div>
            <div class="item-checked">
              <n-icon :size="18" color="#fff">
                <CheckOutlined />
              </n-icon>
            </div>
          </div>
        </div>
      </n-gi>
      <n-gi span="4">
        <div class="title">{{ $t('setting.language') }}</div>
        <div class="content">
          <n-radio-group v-model:value="langType" name="radiogroup" @update:value="langTypeChange">
            <n-radio v-for="langItem in langTypeList" :key="langItem.type" :value="langItem.type">
              {{ langItem.name === 'auto' ? $t('setting.auto') : langItem.name }}
            </n-radio>
          </n-radio-group>
        </div>
      </n-gi>
    </n-grid>
  </div>
</template>

<script setup lang="ts">
import lightImg from '../../../assets/img/theme-light.png';
import darkImg from '../../../assets/img/theme-dark.png';
import autoImg from '../../../assets/img/theme-auto.png';
import { useAppStore } from '../../../store';
import { lang } from '../../../lang';
import { CheckOutlined } from '@vicons/antd';

const themeTypeList = [
  {
    type: 0,
    img: autoImg,
    name: 'auto',
  },
  {
    type: 1,
    img: darkImg,
    name: 'dark',
  },
  {
    type: 2,
    img: lightImg,
    name: 'light',
  },
];
const langTypeList = [
  {
    type: 'auto',
    name: 'auto',
  },
  {
    type: 'zhCN',
    name: '简体中文',
  },
  {
    type: 'enUS',
    name: 'English',
  },
];

const appStore = useAppStore();
const activeType = ref(appStore.themeType);

const langType = ref(appStore.languageType);

const setThemeType = (type: number) => {
  activeType.value = type;
  appStore.setThemeType(type);
};

const langTypeChange = (value: string) => {
  langType.value = value;
  appStore.setLanguageType(value);
  lang.global.locale.value = appStore.languageName;
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
    .n-radio {
      margin: 10px;
    }
  }
}
</style>
