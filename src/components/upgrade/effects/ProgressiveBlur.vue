<template>
  <div class="progressive-blur" :style="{ height }" aria-hidden="true">
    <div class="pb-layer pb-layer--1" />
    <div class="pb-layer pb-layer--2" />
    <div class="pb-layer pb-layer--3" />
  </div>
</template>

<script lang="ts" setup>
withDefaults(defineProps<{ height?: string }>(), { height: '42%' });
</script>

<style scoped>
.progressive-blur {
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  pointer-events: none;
}

.pb-layer {
  position: absolute;
  inset: 0;
}

.pb-layer--1 {
  backdrop-filter: blur(3px);
  -webkit-mask-image: linear-gradient(to top, rgba(0, 0, 0, 0.9), transparent);
  mask-image: linear-gradient(to top, rgba(0, 0, 0, 0.9), transparent);
}

.pb-layer--2 {
  height: 72%;
  backdrop-filter: blur(8px);
  -webkit-mask-image: linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent);
  mask-image: linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent);
}

.pb-layer--3 {
  height: 46%;
  backdrop-filter: blur(16px);
  -webkit-mask-image: linear-gradient(to top, rgba(0, 0, 0, 1), transparent);
  mask-image: linear-gradient(to top, rgba(0, 0, 0, 1), transparent);
}
</style>
