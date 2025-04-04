<template>
  <div>
    <n-tabs type="line" animated>
      <n-tab-pane name="OpenAI" tab="OpenAI">
        <n-form class="form-tab-pane">
          <n-form-item-row :label="$t('setting.ai.model')">
            <n-input
              v-model:value="openAi.model"
              :placeholder="$t('setting.ai.modelPlaceholder')"
              :input-props="inputProps"
            />
          </n-form-item-row>
          <n-form-item-row :label="$t('setting.ai.apiKey')">
            <n-input
              type="password"
              show-password-on="click"
              v-model:value="openAi.apiKey"
              :placeholder="$t('setting.ai.apiKeyPlaceholder')"
              :input-props="inputProps"
            />
          </n-form-item-row>
          <n-form-item-row :label="$t('setting.ai.prompt')">
            <n-input
              type="textarea"
              v-model:value="openAi.prompt"
              :placeholder="$t('setting.ai.defaultPrompt')"
              :input-props="inputProps"
            />
          </n-form-item-row>
          <n-divider />
          <n-form-item-row :label="$t('setting.ai.proxy')">
            <n-input
              v-model:value="openAi.httpProxy"
              placeholder="http://127.0.0.1:7890"
              :input-props="inputProps"
            />
          </n-form-item-row>
          <n-button type="error" @click="() => reset('openai')" class="action-button">
            {{ $t('setting.ai.form.reset') }}
          </n-button>
          <n-button type="success" @click="() => save('openai')" class="action-button">
            {{ $t('setting.ai.form.save') }}
          </n-button>
        </n-form>
      </n-tab-pane>
      <n-tab-pane name="DeepSeek" tab="DeepSeek">
        <n-form class="form-tab-pane">
          <n-form-item-row :label="$t('setting.ai.model')">
            <n-input
              v-model:value="deepSeek.model"
              :placeholder="$t('setting.ai.modelPlaceholder')"
              :input-props="inputProps"
            />
          </n-form-item-row>
          <n-form-item-row :label="$t('setting.ai.apiKey')">
            <n-input
              type="password"
              show-password-on="click"
              v-model:value="deepSeek.apiKey"
              :placeholder="$t('setting.ai.apiKeyPlaceholder')"
              :input-props="inputProps"
            />
          </n-form-item-row>
          <n-form-item-row :label="$t('setting.ai.prompt')">
            <n-input
              type="textarea"
              v-model:value="deepSeek.prompt"
              :placeholder="$t('setting.ai.defaultPrompt')"
              :input-props="inputProps"
            />
          </n-form-item-row>
          <n-divider />
          <n-form-item-row :label="$t('setting.ai.proxy')">
            <n-input
              v-model:value="deepSeek.httpProxy"
              placeholder="http://127.0.0.1:7890"
              :input-props="inputProps"
            />
          </n-form-item-row>
          <n-button type="error" @click="() => reset('deepseek')" class="action-button">
            {{ $t('setting.ai.form.reset') }}
          </n-button>
          <n-button type="success" @click="() => save('deepseek')" class="action-button">
            {{ $t('setting.ai.form.save') }}
          </n-button>
        </n-form>
      </n-tab-pane>
      <n-tab-pane :name="$t('setting.ai.others')" :tab="$t('setting.ai.others')">
        Coming soon
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useMessage } from 'naive-ui';
import { cloneDeep } from 'lodash';
import { AiConfig, ProviderEnum, useAppStore, useChatStore } from '../../../store';
import { inputProps } from '../../../common';

const appStore = useAppStore();
const { fetchAigcConfigs, saveAigcConfig } = appStore;
const { aigcConfigs } = storeToRefs(appStore);

const chatStore = useChatStore();
const { fetchChats, modifyAssistant } = chatStore;
const message = useMessage();

const openAiConfig =
  aigcConfigs.value.find(({ provider }) => provider === ProviderEnum.OPENAI) ?? ({} as AiConfig);
const deepSeekConfig =
  aigcConfigs.value.find(({ provider }) => provider === ProviderEnum.DEEP_SEEK) ?? ({} as AiConfig);

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
    await messageWrapper(() => saveAigcConfig(openAi.value));
  } else {
    deepSeek.value = cloneDeep(deepSeekConfig);
    await messageWrapper(() => saveAigcConfig(deepSeek.value));
  }
};

const save = async (provider: 'openai' | 'deepseek') => {
  await messageWrapper(async () => {
    await saveAigcConfig(provider === 'openai' ? openAi.value : deepSeek.value);
    await modifyAssistant();
  });
};

fetchAigcConfigs();
fetchChats();
</script>

<style lang="scss" scoped>
.form-tab-pane {
  width: 96%;

  .action-button {
    margin-right: 10px;
  }
}
</style>
