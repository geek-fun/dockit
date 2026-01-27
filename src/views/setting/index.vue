<template>
  <div class="setting-container">
    <Tabs default-value="Basic" orientation="vertical" class="h-full flex">
      <TabsList
        class="flex flex-col h-full w-[200px] justify-start rounded-none border-r border-border bg-transparent p-0"
      >
        <TabsTrigger
          value="Basic"
          class="w-full justify-end rounded-none border-r-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3"
        >
          {{ $t('setting.basic') }}
        </TabsTrigger>
        <TabsTrigger
          value="Editor"
          class="w-full justify-end rounded-none border-r-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3"
        >
          {{ $t('setting.editor.title') }}
        </TabsTrigger>
        <TabsTrigger
          value="AI"
          class="w-full justify-end rounded-none border-r-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3"
        >
          {{ $t('setting.ai.title') }}
        </TabsTrigger>
        <TabsTrigger
          value="About"
          class="w-full justify-end rounded-none border-r-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3"
        >
          {{ $t('setting.about') }}
        </TabsTrigger>
      </TabsList>
      <div class="flex-1 pl-8 py-4">
        <TabsContent value="Basic" class="m-0">
          <basic-setting />
        </TabsContent>
        <TabsContent value="Editor" class="m-0">
          <editor-setting />
        </TabsContent>
        <TabsContent value="AI" class="m-0">
          <aigc />
        </TabsContent>
        <TabsContent value="About" class="m-0">
          <about-us />
        </TabsContent>
      </div>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import BasicSetting from './components/basic.vue';
import EditorSetting from './components/editor.vue';
import Aigc from './components/aigc.vue';
import AboutUs from './components/about-us.vue';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
</script>

<style lang="scss" scoped>
.setting-container {
  height: 100%;
  width: 100%;
}
</style>
