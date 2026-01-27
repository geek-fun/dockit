<template>
  <div class="history-empty-content">
    <div class="icon-box">
      <Icon :size="48" class="text-muted-foreground">
        <FileSearchOutlined />
      </Icon>
    </div>
    <div class="main-desc">{{ $t('history.empty') }}</div>
    <div class="second-desc">{{ $t('history.emptyDesc') }}</div>
  </div>
</template>

<script lang="ts" setup>
import { FileSearchOutlined } from '@vicons/antd';
import { Icon } from '@/components/ui/icon';
</script>

<style scoped>
.history-empty-content {
  width: 80%;
  padding-top: 15%;
  box-sizing: border-box;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  color: var(--gray-color);
}

.history-empty-content .icon-box {
  font-size: 50px;
}

.history-empty-content .main-desc {
  font-size: 18px;
  font-weight: 600;
  margin: 10px 0;
}

.history-empty-content .second-desc {
  text-align: center;
}
</style>
