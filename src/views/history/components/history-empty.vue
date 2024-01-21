<template>
  <div class="history-empty-content">
    <div class="icon-box">
      <n-icon>
        <FileSearchOutlined />
      </n-icon>
    </div>
    <div class="main-desc">{{ $t('history.empty') }}</div>
    <div class="second-desc">{{ $t('history.emptyDesc') }}</div>
  </div>
</template>

<script lang="ts" setup>
import { FileSearchOutlined } from '@vicons/antd';
</script>

<style lang="scss" scoped>
.history-empty-content {
  width: 80%;
  padding-top: 15%;
  box-sizing: border-box;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  color: var(--gray-color);
  .icon-box {
    .n-icon {
      font-size: 50px;
    }
  }
  .main-desc {
    font-size: 18px;
    font-weight: 600;
    margin: 10px 0;
  }
  .second-desc {
    text-align: center;
  }
}
</style>
