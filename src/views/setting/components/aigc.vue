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
            {{ $t('dialogOps.reset') }}
          </n-button>
          <n-button type="success" @click="() => save('openai')" class="action-button">
            {{ $t('dialogOps.saveAndEnable') }}
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
            {{ $t('dialogOps.reset') }}
          </n-button>
          <n-button type="success" @click="() => save('deepseek')" class="action-button">
            {{ $t('dialogOps.saveAndEnable') }}
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
import { AiConfig, useAppStore } from '../../../store';
import { inputProps } from '../../../common';
import { ProviderEnum } from '../../../datasources';

const appStore = useAppStore();
const { fetchAiConfigs, saveAiConfig } = appStore;
const { aiConfigs } = storeToRefs(appStore);

const message = useMessage();

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

<style lang="scss" scoped>
.form-tab-pane {
  width: 96%;

  .action-button {
    margin-right: 10px;
  }
}
</style>
