<template>
  <div>
    <Tabs default-value="OpenAI">
      <TabsList>
        <TabsTrigger value="OpenAI">OpenAI</TabsTrigger>
        <TabsTrigger value="DeepSeek">DeepSeek</TabsTrigger>
        <TabsTrigger value="others">{{ $t('setting.ai.others') }}</TabsTrigger>
      </TabsList>
      <TabsContent value="OpenAI">
        <Form class="form-tab-pane">
          <FormItem :label="$t('setting.ai.model')">
            <Input v-model="openAi.model" :placeholder="$t('setting.ai.modelPlaceholder')" />
          </FormItem>
          <FormItem :label="$t('setting.ai.apiKey')">
            <Input
              v-model="openAi.apiKey"
              type="password"
              :placeholder="$t('setting.ai.apiKeyPlaceholder')"
            />
          </FormItem>
          <FormItem :label="$t('setting.ai.prompt')">
            <textarea
              v-model="openAi.prompt"
              class="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50"
              :placeholder="$t('setting.ai.defaultPrompt')"
            />
          </FormItem>
          <Separator class="my-4" />
          <FormItem :label="$t('setting.ai.proxy')">
            <Input v-model="openAi.httpProxy" placeholder="http://127.0.0.1:7890" />
          </FormItem>
          <div class="flex gap-2">
            <Button variant="destructive" @click="() => reset('openai')">
              {{ $t('dialogOps.reset') }}
            </Button>
            <Button variant="default" @click="() => save('openai')">
              {{ $t('dialogOps.saveAndEnable') }}
            </Button>
          </div>
        </Form>
      </TabsContent>
      <TabsContent value="DeepSeek">
        <Form class="form-tab-pane">
          <FormItem :label="$t('setting.ai.model')">
            <Input v-model="deepSeek.model" :placeholder="$t('setting.ai.modelPlaceholder')" />
          </FormItem>
          <FormItem :label="$t('setting.ai.apiKey')">
            <Input
              v-model="deepSeek.apiKey"
              type="password"
              :placeholder="$t('setting.ai.apiKeyPlaceholder')"
            />
          </FormItem>
          <FormItem :label="$t('setting.ai.prompt')">
            <textarea
              v-model="deepSeek.prompt"
              class="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50"
              :placeholder="$t('setting.ai.defaultPrompt')"
            />
          </FormItem>
          <Separator class="my-4" />
          <FormItem :label="$t('setting.ai.proxy')">
            <Input v-model="deepSeek.httpProxy" placeholder="http://127.0.0.1:7890" />
          </FormItem>
          <div class="flex gap-2">
            <Button variant="destructive" @click="() => reset('deepseek')">
              {{ $t('dialogOps.reset') }}
            </Button>
            <Button variant="default" @click="() => save('deepseek')">
              {{ $t('dialogOps.saveAndEnable') }}
            </Button>
          </div>
        </Form>
      </TabsContent>
      <TabsContent value="others">Coming soon</TabsContent>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useMessageService } from '@/composables';
import { cloneDeep } from 'lodash';
import { AiConfig, useAppStore } from '../../../store';
import { ProviderEnum } from '../../../datasources';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Form, FormItem } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const appStore = useAppStore();
const { fetchAiConfigs, saveAiConfig } = appStore;
const { aiConfigs } = storeToRefs(appStore);

const message = useMessageService();

const openAiConfig =
  aiConfigs.value.find(({ provider }) => provider === ProviderEnum.OPENAI) ?? ({} as AiConfig);
const deepSeekConfig =
  aiConfigs.value.find(({ provider }) => provider === ProviderEnum.DEEP_SEEK) ?? ({} as AiConfig);

const openAi = ref(cloneDeep(openAiConfig));
const deepSeek = ref(cloneDeep(deepSeekConfig));

const messageWrapper = async (fn: () => Promise<void>) =>
  fn()
    .then(() => message.success(''))
    .catch(err => {
      message.error((err as Error).message, {
        closable: true,
        keepAliveOnHover: true,
      });
    });

const reset = async (provider: 'openai' | 'deepseek') => {
  if (provider === 'openai') {
    openAi.value = cloneDeep(openAiConfig);
    await messageWrapper(() => saveAiConfig(openAi.value));
  } else {
    deepSeek.value = cloneDeep(deepSeekConfig);
    await messageWrapper(() => saveAiConfig(deepSeek.value));
  }
};

const save = async (provider: 'openai' | 'deepseek') => {
  await messageWrapper(async () => {
    await saveAiConfig({
      ...(provider === 'openai' ? openAi.value : deepSeek.value),
      provider: provider === 'openai' ? ProviderEnum.OPENAI : ProviderEnum.DEEP_SEEK,
      enabled: true,
    });
  });
};

fetchAiConfigs();
</script>

<style scoped>
.form-tab-pane {
  width: 96%;
}
</style>
