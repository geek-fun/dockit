<template>
  <div class="basic-setting">
    <div class="title">外观设置</div>
    <div class="theme">
      <div
        class="theme-item"
        v-for="item in themeTypeList"
        :key="item.type"
        :class="{
          active: activeType === item.type,
        }"
        @click="setThemeType(item.type)"
      >
        <div class="img-box">
          <img :src="item.img" :alt="item.name" />
        </div>
        <div class="item-desc">{{ item.name }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import lightImg from '@/assets/img/theme-light.png'
import darkImg from '@/assets/img/theme-dark.png'
import autoImg from '@/assets/img/theme-auto.png'
import { useAppStore } from '@/store';
const appStore = useAppStore();
const activeType = ref(appStore.themeType);
const themeTypeList = ref([
  {
    type: 0,
    img: autoImg,
    name: '跟随系统',
  },
  {
    type: 1,
    img: darkImg,
    name: '暗黑主题',
  },
  {
    type: 2,
    img: lightImg,
    name: '月白主题',
  },
]);

const setThemeType = (type: number) => {
  activeType.value = type;
  appStore.setThemeType(type);
};
</script>

<style lang="scss" scoped>
.basic-setting {
  .title {
    font-weight: bold;
    margin-bottom: 5px;
  }
  .theme {
    display: flex;
    flex-wrap: wrap;
    .theme-item {
      width: 140px;
      height: 120px;
      margin: 10px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
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
        transition: .3s;
      }
      &.active {
        position: relative;
        &::after {
          content: '√';
          position: absolute;
          height: 20px;
          width: 20px;
          left: 10px;
          top: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          background-color: #2478ec;
          font-size: 12px;
          border-radius: 50%;
        }
        .img-box {
          box-shadow: 0 0 8px #2478ec;
        }
        .item-desc {
          font-weight: bold;
        }
      }
    }
  }
}
</style>
