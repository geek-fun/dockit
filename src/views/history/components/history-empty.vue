<template>
  <div class="history-empty-content">
    <div class="icon-box">
      <span class="i-carbon-search h-12 w-12 text-muted-foreground" />
    </div>
    <div class="main-desc">{{ $t('history.empty') }}</div>
    <div class="second-desc">{{ $t('history.emptyDesc') }}</div>
    <Button variant="outline" size="sm" class="empty-cta" @click="goToEditor">
      <span class="i-carbon-play h-4 w-4 mr-1.5" />
      {{ $t('history.goToEditor') }}
    </Button>
  </div>
</template>

<script lang="ts" setup>
import { useRouter } from 'vue-router';
import { Button } from '@/components/ui/button';

const router = useRouter();

const goToEditor = () => {
  router.push('/connect');
};
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
  color: hsl(var(--muted-foreground));
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

.empty-cta {
  margin-top: 16px;
}
</style>
