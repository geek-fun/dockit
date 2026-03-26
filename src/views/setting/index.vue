<template>
  <div class="setting-container">
    <Tabs default-value="Basic" orientation="vertical" class="h-full flex">
      <TabsList
        class="flex flex-col h-full w-[200px] justify-start rounded-none border-r border-border bg-background p-2 gap-1"
      >
        <TabsTrigger
          value="Basic"
          class="w-full justify-end rounded-md data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-sm py-2.5 px-4 text-sm hover:bg-accent/50 transition-all"
        >
          {{ $t('setting.basic') }}
        </TabsTrigger>
        <TabsTrigger
          value="Editor"
          class="w-full justify-end rounded-md data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-sm py-2.5 px-4 text-sm hover:bg-accent/50 transition-all"
        >
          {{ $t('setting.editor.title') }}
        </TabsTrigger>
        <TabsTrigger
          value="AI"
          class="w-full justify-end rounded-md data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-sm py-2.5 px-4 text-sm hover:bg-accent/50 transition-all"
        >
          {{ $t('setting.ai.title') }}
        </TabsTrigger>
        <TabsTrigger
          value="About"
          class="w-full justify-end rounded-md data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-sm py-2.5 px-4 text-sm hover:bg-accent/50 transition-all"
        >
          {{ $t('setting.about') }}
        </TabsTrigger>
      </TabsList>
      <div class="flex-1 overflow-y-auto">
        <div class="px-8 py-6">
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

<style scoped>
.setting-container {
  height: 100%;
  width: 100%;
}
</style>
