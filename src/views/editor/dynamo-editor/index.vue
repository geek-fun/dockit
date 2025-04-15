<template>
  <div class="dynamo-editor">
    <n-tabs type="segment">
      <n-tab-pane name="query" tab="Query">
        <n-empty :description="$t('connection.dynamodb.queryComingSoon')" />
      </n-tab-pane>
      <n-tab-pane name="tables" tab="Tables">
        <n-empty :description="$t('connection.dynamodb.tablesComingSoon')" />
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<script setup lang="ts"></script>

<style lang="scss" scoped></style>
