<template>
  <n-config-provider :theme="getTheme">
    <n-loading-bar-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <n-message-provider>
            <slot></slot>
            <NaiveProviderContent />
          </n-message-provider>
        </n-notification-provider>
      </n-dialog-provider>
    </n-loading-bar-provider>
  </n-config-provider>
</template>

<script lang="ts" setup>
const NaiveProviderContent = defineComponent({
  render() {
    return h('div');
  },
});
const getTheme = ''
</script>
