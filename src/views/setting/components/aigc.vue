<template>
  <div class="space-y-8 pb-10">
    <div class="space-y-2">
      <h2 class="text-2xl font-semibold tracking-tight">{{ $t('setting.ai.title') }}</h2>
      <p class="max-w-3xl text-sm text-muted-foreground">
        {{ $t('setting.ai.description') }}
      </p>
    </div>

    <section class="space-y-4">
      <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div class="space-y-1">
          <h3 class="text-lg font-semibold">{{ $t('setting.ai.providers.addedTitle') }}</h3>
          <p class="text-sm text-muted-foreground">
            {{ $t('setting.ai.providers.addedDescription') }}
          </p>
        </div>
        <Button class="gap-2 self-start md:self-auto" @click="openCreateProviderDialog">
          <span class="i-carbon-add h-4 w-4" />
          {{ $t('setting.ai.providers.addProvider') }}
        </Button>
      </div>

      <Alert v-if="configuredProviders.length === 0" variant="info">
        <span class="i-carbon-information h-4 w-4" />
        <AlertDescription>
          {{ $t('setting.ai.providers.emptyState') }}
        </AlertDescription>
      </Alert>

      <div v-else class="rounded-3xl border border-border/70 bg-card/70 shadow-sm overflow-hidden">
        <div
          v-for="(provider, index) in configuredProviders"
          :key="provider.id"
          class="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between"
          :class="{ 'border-t border-border/60': index > 0 }"
        >
          <div class="min-w-0 space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <p class="truncate text-base font-semibold">{{ provider.label }}</p>
              <Badge :variant="provider.connected ? 'default' : 'secondary'">
                {{
                  provider.connected
                    ? $t('setting.ai.providers.connected')
                    : $t('setting.ai.providers.notConnected')
                }}
              </Badge>
              <Badge variant="outline">{{ provider.discoveredModels.length }} models</Badge>
              <Badge variant="outline">{{ providerAuthLabel(provider) }}</Badge>
            </div>
            <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>{{ providerEndpointSummary(provider) }}</span>
              <span>{{ providerSyncLabel(provider) }}</span>
              <span>{{ providerStatusMessage(provider) }}</span>
            </div>
          </div>

          <div class="flex shrink-0 flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              class="gap-2"
              @click="openEditProviderDialog(provider.id)"
            >
              <span class="i-carbon-edit h-4 w-4" />
              {{ $t('dialogOps.edit') }}
            </Button>
            <Button
              :disabled="providerActionState[provider.id] === 'testing'"
              variant="ghost"
              size="sm"
              class="gap-2"
              @click="testProvider(provider.id)"
            >
              <span
                v-if="providerActionState[provider.id] === 'testing'"
                class="i-carbon-renew h-4 w-4 animate-spin"
              />
              <span v-else class="i-carbon-checkmark-outline h-4 w-4" />
              {{ $t('setting.ai.providers.testConnection') }}
            </Button>
            <Button
              :disabled="providerSyncState[provider.id] === 'loading'"
              variant="ghost"
              size="sm"
              class="gap-2"
              @click="syncProviderModels(provider.id)"
            >
              <span
                v-if="providerSyncState[provider.id] === 'loading'"
                class="i-carbon-renew h-4 w-4 animate-spin"
              />
              <span v-else class="i-carbon-renew h-4 w-4" />
              {{ $t('setting.ai.providers.refreshModels') }}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="gap-2 text-destructive"
              @click="removeProvider(provider.id)"
            >
              <span class="i-carbon-trash-can h-4 w-4" />
              {{ $t('dialogOps.delete') }}
            </Button>
          </div>
        </div>
      </div>
    </section>

    <section class="space-y-4">
      <div class="space-y-1">
        <h3 class="text-lg font-semibold">{{ $t('setting.ai.chat.title') }}</h3>
        <p class="text-sm text-muted-foreground">{{ $t('setting.ai.chat.description') }}</p>
      </div>
      <div
        class="flex flex-col gap-3 rounded-3xl border border-border/70 bg-card/70 px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between"
      >
        <div class="min-w-0 space-y-1">
          <p class="text-base font-semibold">{{ $t('setting.ai.chat.autoCompactLabel') }}</p>
          <p class="text-sm text-muted-foreground">
            {{ $t('setting.ai.chat.autoCompactDescription') }}
          </p>
        </div>
        <Switch :model-value="autoCompactEnabled" @update:model-value="setAutoCompact" />
      </div>

      <div
        class="flex flex-col gap-3 rounded-3xl border border-border/70 bg-card/70 px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between"
      >
        <div class="min-w-0 space-y-1">
          <p class="text-base font-semibold">{{ $t('setting.ai.chat.maxIterationsLabel') }}</p>
          <p class="text-sm text-muted-foreground">
            {{ $t('setting.ai.chat.maxIterationsDescription') }}
          </p>
        </div>
        <Input
          type="number"
          min="1"
          max="1000"
          class="w-32"
          :model-value="maxIterations"
          @update:model-value="value => setMaxIterations(Number(value))"
        />
      </div>

      <div
        class="flex flex-col gap-3 rounded-3xl border border-border/70 bg-card/70 px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between"
      >
        <div class="min-w-0 space-y-1">
          <p class="text-base font-semibold">
            {{ $t('setting.ai.chat.wallClockBudgetLabel') }}
          </p>
          <p class="text-sm text-muted-foreground">
            {{ $t('setting.ai.chat.wallClockBudgetDescription') }}
          </p>
        </div>
        <Input
          type="number"
          min="1"
          max="240"
          class="w-32"
          :model-value="wallClockBudgetMin"
          @update:model-value="value => setWallClockBudgetMin(Number(value))"
        />
      </div>

      <div
        class="flex flex-col gap-3 rounded-3xl border border-border/70 bg-card/70 px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between"
      >
        <div class="min-w-0 space-y-1">
          <p class="text-base font-semibold">{{ $t('setting.ai.chat.tokenBudgetLabel') }}</p>
          <p class="text-sm text-muted-foreground">
            {{ $t('setting.ai.chat.tokenBudgetDescription') }}
          </p>
        </div>
        <Input
          type="number"
          min="1000"
          step="1000"
          class="w-40"
          :model-value="tokenBudget"
          @update:model-value="value => setTokenBudget(Number(value))"
        />
      </div>
    </section>

    <Dialog :open="providerDialogOpen" @update:open="handleProviderDialogOpenChange">
      <DialogContent class="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{{ providerDialogTitle }}</DialogTitle>
          <DialogDescription>
            {{ providerDialogDescription }}
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-5">
          <FormItem
            v-if="providerDialogMode === 'create'"
            :label="$t('setting.ai.providers.providerType')"
          >
            <Select
              :model-value="draftProviderKind ?? undefined"
              @update:model-value="updateDraftProviderKind($event)"
            >
              <SelectTrigger>
                <SelectValue :placeholder="$t('setting.ai.providers.selectProviderType')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="option in availableProviderOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </FormItem>

          <template v-if="draftProvider">
            <FormItem :label="$t('setting.ai.providers.displayName')">
              <Input
                v-model="draftProvider.label"
                :placeholder="$t('setting.ai.providers.displayNamePlaceholder')"
              />
            </FormItem>

            <div class="space-y-4">
              <FormItem
                v-if="showApiKeyField(draftProvider)"
                :label="$t('setting.ai.apiKey')"
                :error="draftProviderErrors.apiKey"
                :required="draftProvider.kind !== 'ollama' && draftProvider.kind !== 'lm-studio'"
              >
                <div class="relative">
                  <Input
                    v-model="apiKeyDisplayValue"
                    :type="showApiKey ? 'text' : 'password'"
                    :readonly="hasExistingApiKey"
                    class="pr-9"
                    :placeholder="$t('setting.ai.apiKeyPlaceholder')"
                    @click="beginReplaceApiKey"
                  />
                  <button
                    type="button"
                    class="absolute inset-y-0 right-0 flex items-center px-2.5 text-muted-foreground hover:text-foreground focus-visible:outline-none"
                    :aria-label="showApiKey ? 'Hide API key' : 'Show API key'"
                    @click.stop="showApiKey = !showApiKey"
                  >
                    <span
                      :class="showApiKey ? 'i-carbon-view-off' : 'i-carbon-view'"
                      class="h-4 w-4"
                    />
                  </button>
                </div>
              </FormItem>
            </div>

            <div class="grid gap-4 md:grid-cols-2">
              <FormItem
                v-if="showBaseUrlField(draftProvider)"
                :label="$t('setting.ai.providers.baseUrl')"
                :error="draftProviderErrors.baseUrl"
                :required="
                  draftProvider.kind === 'custom-openai' ||
                  draftProvider.kind === 'ollama' ||
                  draftProvider.kind === 'lm-studio'
                "
              >
                <Input
                  v-model="draftProvider.baseUrl"
                  type="url"
                  :placeholder="providerBaseUrlPlaceholder(draftProvider.kind)"
                />
              </FormItem>

              <FormItem :label="$t('setting.ai.proxy')" :error="draftProviderErrors.proxy">
                <div class="space-y-3">
                  <div class="flex items-center gap-4">
                    <button
                      type="button"
                      class="py-1 text-sm transition-colors whitespace-nowrap"
                      :class="draftProvider.proxyMode === 'none'
                        ? 'font-semibold text-foreground'
                        : 'font-normal text-muted-foreground hover:text-foreground'"
                      @click="draftProvider.proxyMode = 'none'"
                    >
                      {{ $t('setting.ai.providers.proxyNone') }}
                    </button>
                    <button
                      type="button"
                      class="py-1 text-sm transition-colors whitespace-nowrap"
                      :class="draftProvider.proxyMode === 'system'
                        ? 'font-semibold text-foreground'
                        : 'font-normal text-muted-foreground hover:text-foreground'"
                      @click="draftProvider.proxyMode = 'system'"
                    >
                      {{ $t('setting.ai.providers.proxySystem') }}
                    </button>
                    <button
                      type="button"
                      class="py-1 text-sm transition-colors whitespace-nowrap"
                      :class="draftProvider.proxyMode === 'manual'
                        ? 'font-semibold text-foreground'
                        : 'font-normal text-muted-foreground hover:text-foreground'"
                      @click="draftProvider.proxyMode = 'manual'"
                    >
                      {{ $t('setting.ai.providers.proxyManual') }}
                    </button>
                  </div>
                  <Input
                    v-if="draftProvider.proxyMode === 'manual'"
                    v-model="draftProvider.proxy"
                    placeholder="http://127.0.0.1:7890"
                  />
                </div>
              </FormItem>

              <FormItem
                v-if="showContextWindowField(draftProvider)"
                :label="$t('setting.ai.providers.contextWindowLabel')"
              >
                <Input
                  v-model="contextWindowOverrideInput"
                  type="number"
                  min="1024"
                  step="1024"
                  :placeholder="$t('setting.ai.providers.contextWindowPlaceholder')"
                />
                <p class="mt-1 text-xs text-muted-foreground">
                  {{ $t('setting.ai.providers.contextWindowDescription') }}
                </p>
              </FormItem>
            </div>

            <Alert v-if="draftProvider.kind === 'custom-anthropic'" variant="warning">
              <span class="i-carbon-warning h-4 w-4" />
              <AlertDescription>
                {{ $t('setting.ai.providers.customAnthropicDescription') }}
              </AlertDescription>
            </Alert>
          </template>
        </div>

        <DialogFooter class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex items-center gap-2">
            <Button
              v-if="draftProvider && draftProvider.kind !== 'custom-anthropic'"
              variant="ghost"
              :disabled="dialogTestState === 'testing'"
              @click="testDraftProvider"
            >
              <span
                v-if="dialogTestState === 'testing'"
                class="i-carbon-renew mr-2 h-4 w-4 animate-spin"
              />
              <span v-else class="i-carbon-checkmark-outline mr-2 h-4 w-4" />
              {{ $t('setting.ai.providers.testConnection') }}
            </Button>
            <span v-if="dialogTestState === 'success'" class="text-sm text-green-600">
              {{ $t('setting.ai.providers.testSuccess') }}
            </span>
            <span v-if="dialogTestState === 'failed'" class="text-sm text-destructive">
              {{ dialogTestError || $t('setting.ai.providers.testFailed') }}
            </span>
          </div>
          <div class="flex gap-2">
            <Button variant="secondary" @click="closeProviderDialog">
              {{ $t('dialogOps.cancel') }}
            </Button>
            <Button
              :disabled="!draftProvider || draftProvider.kind === 'custom-anthropic'"
              @click="saveDraftProvider"
            >
              {{ $t('dialogOps.save') }}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { cloneDeep } from 'lodash';
import { storeToRefs } from 'pinia';
import { useLang } from '@/lang';
import { useDialogService, useMessageService } from '@/composables';
import { type ProviderConfig, type ProviderKind, useAppStore } from '@/store';
import { chatBotApi } from '@/datasources';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormItem } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

type ProviderErrorMap = Partial<Record<'apiKey' | 'baseUrl' | 'proxy', string>>;

const API_KEY_SENTINEL = '__UNCHANGED__';

const appStore = useAppStore();
const { llmSettings } = storeToRefs(appStore);
const lang = useLang();
const dialog = useDialogService();
const message = useMessageService();

const providerActionState = reactive<Record<string, 'idle' | 'testing'>>({});
const providerSyncState = reactive<Record<string, 'idle' | 'loading'>>({});

const autoCompactEnabled = computed(() => llmSettings.value.chat?.autoCompact ?? true);
const maxIterations = computed(() => llmSettings.value.chat?.maxIterations ?? 200);
const wallClockBudgetMin = computed(() => llmSettings.value.chat?.wallClockBudgetMin ?? 30);
const tokenBudget = computed(() => llmSettings.value.chat?.tokenBudget ?? 20_000_000);

const ensureChatConfig = () => {
  if (!llmSettings.value.chat) {
    llmSettings.value.chat = {
      autoCompact: true,
      maxIterations: 200,
      wallClockBudgetMin: 30,
      tokenBudget: 20_000_000,
    };
  }
  return llmSettings.value.chat;
};

const persistChatConfig = async (rollback: () => void) => {
  try {
    await appStore.persistLlmSettings();
  } catch (err) {
    rollback();
    message.error(`Failed to persist: ${(err as Error).message || 'Unknown error'}`, {
      closable: true,
      keepAliveOnHover: true,
    });
  }
};

const setAutoCompact = async (value: boolean) => {
  const chat = ensureChatConfig();
  const previous = chat.autoCompact;
  chat.autoCompact = value;
  await persistChatConfig(() => {
    chat.autoCompact = previous;
  });
};

const setMaxIterations = async (value: number) => {
  const chat = ensureChatConfig();
  const previous = chat.maxIterations;
  chat.maxIterations = Math.max(1, Math.floor(value));
  await persistChatConfig(() => {
    chat.maxIterations = previous;
  });
};

const setWallClockBudgetMin = async (value: number) => {
  const chat = ensureChatConfig();
  const previous = chat.wallClockBudgetMin;
  chat.wallClockBudgetMin = Math.max(1, Math.floor(value));
  await persistChatConfig(() => {
    chat.wallClockBudgetMin = previous;
  });
};

const setTokenBudget = async (value: number) => {
  const chat = ensureChatConfig();
  const previous = chat.tokenBudget;
  chat.tokenBudget = Math.max(1_000, Math.floor(value));
  await persistChatConfig(() => {
    chat.tokenBudget = previous;
  });
};

const contextWindowOverrideInput = computed<string>({
  get: () =>
    draftProvider.value?.contextWindowOverride
      ? String(draftProvider.value.contextWindowOverride)
      : '',
  set: raw => {
    if (!draftProvider.value) return;
    const trimmed = raw.trim();
    if (!trimmed) {
      draftProvider.value.contextWindowOverride = undefined;
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isFinite(parsed) && parsed >= 1024) {
      draftProvider.value.contextWindowOverride = parsed;
    }
  },
});

const providerDialogOpen = ref(false);
const providerDialogMode = ref<'create' | 'edit'>('create');
const editingProviderId = ref<string | null>(null);
const showApiKey = ref(false);
const draftProviderKind = ref<ProviderKind | null>(null);
const providerAuthTab = ref<string>('api-key');
const draftProvider = ref<ProviderConfig | null>(null);
const draftProviderErrors = reactive<ProviderErrorMap>({});

const dialogTestState = ref<'idle' | 'testing' | 'success' | 'failed'>('idle');
const dialogTestError = ref<string | null>(null);

const normalizeBaseUrl = (url: string): string => {
  const trimmed = url.trim();
  if (!trimmed) return '';

  const withoutSlashes = trimmed.replace(/\/+$/, '');

  if (withoutSlashes.endsWith('/v1')) {
    return withoutSlashes;
  }

  return `${withoutSlashes}/v1`;
};

const providerPresets: Record<
  ProviderKind,
  Partial<ProviderConfig> & { apiCompatibility?: ProviderConfig['apiCompatibility'] }
> = {
  openai: {
    label: 'OpenAI',
    authMode: 'api-key',
    baseUrl: 'https://api.openai.com/v1',
    apiCompatibility: 'openai-compatible',
  },
  deepseek: {
    label: 'DeepSeek',
    authMode: 'api-key',
    baseUrl: 'https://api.deepseek.com/v1',
    apiCompatibility: 'openai-compatible',
  },
  openrouter: {
    label: 'OpenRouter',
    authMode: 'api-key',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiCompatibility: 'openai-compatible',
  },
  anthropic: {
    label: 'Anthropic',
    authMode: 'api-key',
    baseUrl: 'https://api.anthropic.com/v1',
    apiCompatibility: 'anthropic',
  },
  gemini: {
    label: 'Google Gemini',
    authMode: 'api-key',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiCompatibility: 'openai-compatible',
  },
  grok: {
    label: 'Grok',
    authMode: 'api-key',
    baseUrl: 'https://api.x.ai/v1',
    apiCompatibility: 'openai-compatible',
  },
  mistral: {
    label: 'Mistral',
    authMode: 'api-key',
    baseUrl: 'https://api.mistral.ai/v1',
    apiCompatibility: 'openai-compatible',
  },
  'azure-openai': {
    label: 'Azure OpenAI',
    authMode: 'api-key',
    baseUrl: '',
    apiCompatibility: 'openai-compatible',
  },
  ollama: {
    label: 'Ollama',
    authMode: 'none',
    baseUrl: 'http://127.0.0.1:11434',
    apiCompatibility: 'local',
  },
  'lm-studio': {
    label: 'LM Studio',
    authMode: 'none',
    baseUrl: 'http://127.0.0.1:1234/v1',
    apiCompatibility: 'openai-compatible',
  },
  'custom-openai': {
    label: 'Custom OpenAI-Compatible',
    authMode: 'api-key',
    baseUrl: '',
    apiCompatibility: 'openai-compatible',
  },
  'custom-anthropic': {
    label: 'Custom Anthropic-Compatible',
    authMode: 'api-key',
    baseUrl: '',
    apiCompatibility: 'anthropic',
  },
};

const configuredProviders = computed(() =>
  llmSettings.value.providers.filter(provider => provider.enabled),
);

const hasExistingApiKey = computed(() => draftProvider.value?.apiKey === API_KEY_SENTINEL);

const API_KEY_MASK = '••••••••••••';

// Sentinel state (existing saved key, not yet replaced):
//   - eye closed → show mask dots (type=password, readonly)
//   - eye open   → show real stored key (type=text, readonly)
// Once the user clicks the field, sentinel is cleared and they type a fresh value.
const apiKeyDisplayValue = computed<string>({
  get: () => {
    if (!hasExistingApiKey.value) return draftProvider.value?.apiKey ?? '';
    if (showApiKey.value) {
      return llmSettings.value.providers.find(p => p.id === draftProvider.value?.id)?.apiKey ?? '';
    }
    return API_KEY_MASK;
  },
  set: (val: string) => {
    // Ignore writes of the mask constant (readonly state emitting its own value back)
    if (val === API_KEY_MASK) return;
    if (draftProvider.value) draftProvider.value.apiKey = val;
  },
});

const beginReplaceApiKey = () => {
  if (hasExistingApiKey.value && draftProvider.value) {
    draftProvider.value.apiKey = '';
    showApiKey.value = false;
  }
};

const availableProviderOptions = computed(() =>
  llmSettings.value.providers
    .filter(provider => !provider.enabled)
    .map(provider => ({ value: provider.kind, label: provider.label })),
);

const providerDialogTitle = computed(() =>
  providerDialogMode.value === 'create'
    ? 'Add provider'
    : `Edit ${draftProvider.value?.label ?? 'provider'}`,
);

const providerDialogDescription = computed(() =>
  providerDialogMode.value === 'create'
    ? 'Choose a provider type, then configure the shared credentials and network options once for both AI Assistant and Data Studio.'
    : 'Update the shared provider credentials, auth method, and network settings used across DocKit.',
);

const resetDraftProviderErrors = () => {
  draftProviderErrors.apiKey = undefined;
  draftProviderErrors.baseUrl = undefined;
  draftProviderErrors.proxy = undefined;
};

const normalizeProviderDraft = (provider: ProviderConfig): ProviderConfig => ({
  ...cloneDeep(provider),
  apiKey: provider.apiKey ? API_KEY_SENTINEL : '',
  baseUrl: provider.baseUrl ?? '',
  proxyMode: provider.proxyMode ?? 'none',
  proxy: provider.proxy ?? '',
  enabled: true,
});

const createDraftProvider = (kind: ProviderKind) => {
  const preset = providerPresets[kind];
  return normalizeProviderDraft({
    id: kind,
    kind,
    apiCompatibility: preset.apiCompatibility ?? 'openai-compatible',
    label: preset.label ?? kind,
    authMode: preset.authMode ?? 'api-key',
    apiKey: '',
    baseUrl: preset.baseUrl ?? '',
    proxyMode: 'none',
    proxy: '',
    headers: {},
    enabled: true,
    connected: false,
    discoveredModels: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
};

const validateDraftProvider = () => {
  resetDraftProviderErrors();
  if (!draftProvider.value) return false;

  const apiKeyValue = draftProvider.value.apiKey?.trim();
  const apiKeyUnchanged = apiKeyValue === API_KEY_SENTINEL;

  if (showApiKeyField(draftProvider.value) && !apiKeyUnchanged && !apiKeyValue) {
    draftProviderErrors.apiKey = 'API key is required for this provider.';
  }

  if (showBaseUrlField(draftProvider.value) && !draftProvider.value.baseUrl?.trim()) {
    draftProviderErrors.baseUrl = 'Base URL is required for this provider.';
  }

  if (draftProvider.value.baseUrl?.trim()) {
    try {
      new URL(draftProvider.value.baseUrl);
    } catch {
      draftProviderErrors.baseUrl = 'Enter a valid URL.';
    }
  }

  if (draftProvider.value.proxy?.trim()) {
    try {
      new URL(draftProvider.value.proxy);
    } catch {
      draftProviderErrors.proxy = 'Enter a valid proxy URL.';
    }
  }

  return !draftProviderErrors.apiKey && !draftProviderErrors.baseUrl && !draftProviderErrors.proxy;
};

const showApiKeyField = (provider: ProviderConfig) =>
  provider.kind !== 'ollama' &&
  provider.kind !== 'lm-studio' &&
  provider.kind !== 'custom-anthropic';

const showBaseUrlField = (provider: ProviderConfig) =>
  provider.kind === 'ollama' ||
  provider.kind === 'lm-studio' ||
  provider.kind === 'custom-openai' ||
  provider.kind === 'custom-anthropic';

const showContextWindowField = (provider: ProviderConfig) => provider.apiCompatibility === 'local';

const updateDraftProviderKind = (value: string | number) => {
  draftProviderKind.value = value as ProviderKind;
  draftProvider.value = createDraftProvider(draftProviderKind.value);
  providerAuthTab.value = 'api-key';
  dialogTestState.value = 'idle';
  dialogTestError.value = null;
  resetDraftProviderErrors();
};

const openCreateProviderDialog = () => {
  providerDialogMode.value = 'create';
  editingProviderId.value = null;
  draftProviderKind.value = availableProviderOptions.value[0]?.value ?? null;
  draftProvider.value = draftProviderKind.value
    ? createDraftProvider(draftProviderKind.value)
    : null;
  providerAuthTab.value = 'api-key';
  resetDraftProviderErrors();
  providerDialogOpen.value = true;
};

const openEditProviderDialog = (providerId: string) => {
  const provider = llmSettings.value.providers.find(item => item.id === providerId);
  if (!provider) return;

  providerDialogMode.value = 'edit';
  editingProviderId.value = providerId;
  draftProviderKind.value = provider.kind;
  draftProvider.value = normalizeProviderDraft(provider);
  providerAuthTab.value = 'api-key';
  resetDraftProviderErrors();
  providerDialogOpen.value = true;
};

const testDraftProvider = async () => {
  if (!draftProvider.value) return;
  dialogTestState.value = 'testing';
  dialogTestError.value = null;
  const draft = draftProvider.value;
  const draftApiKey = draft.apiKey?.trim();
  const originalProvider = llmSettings.value.providers.find(p => p.id === draft.id);
  const resolvedApiKey =
    draftApiKey === API_KEY_SENTINEL
      ? (originalProvider?.apiKey?.trim() ?? '')
      : (draftApiKey ?? '');

  const result = await chatBotApi.validateConfig({
    provider: draft.apiCompatibility ?? 'openai-compatible',
    apiKey: resolvedApiKey,
    model: '',
    httpProxy: draft.proxy?.trim() || undefined,
    proxyMode: draft.proxyMode,
    baseUrl: draft.baseUrl?.trim() || undefined,
  });
  dialogTestState.value = result.valid ? 'success' : 'failed';
  dialogTestError.value = result.error ?? null;
};

const closeProviderDialog = () => {
  providerDialogOpen.value = false;
  editingProviderId.value = null;
  draftProviderKind.value = null;
  draftProvider.value = null;
  providerAuthTab.value = 'api-key';
  dialogTestState.value = 'idle';
  dialogTestError.value = null;
  showApiKey.value = false;
  resetDraftProviderErrors();
};

const handleProviderDialogOpenChange = (openValue: boolean) => {
  if (!openValue) {
    closeProviderDialog();
    return;
  }
  providerDialogOpen.value = true;
};

const saveDraftProvider = async () => {
  if (!draftProvider.value || !validateDraftProvider()) {
    return;
  }

  // Sentinel means user didn't change the key — keep existing value
  const draftApiKey = draftProvider.value.apiKey?.trim();
  const originalProvider = llmSettings.value.providers.find(p => p.id === draftProvider.value!.id);
  const resolvedApiKey =
    draftApiKey === API_KEY_SENTINEL ? (originalProvider?.apiKey ?? '') : (draftApiKey ?? '');

  await appStore.updateProviderConfig(draftProvider.value.id, {
    label: draftProvider.value.label.trim() || providerPresets[draftProvider.value.kind].label,
    authMode: draftProvider.value.authMode,
    apiKey: resolvedApiKey,
    baseUrl: normalizeBaseUrl(draftProvider.value.baseUrl ?? ''),
    proxy: draftProvider.value.proxy?.trim() ?? '',
      proxyMode: draftProvider.value.proxyMode ?? 'none',
    contextWindowOverride: draftProvider.value.contextWindowOverride,
    enabled: true,
    connected:
      draftProvider.value.kind === 'ollama' || draftProvider.value.kind === 'lm-studio'
        ? draftProvider.value.connected
        : false,
  });

  closeProviderDialog();
  message.success('Provider saved.');
};

const removeProvider = (providerId: string) => {
  dialog.warning({
    title: lang.t('dialogOps.warning'),
    content: lang.t('setting.ai.providers.removeProviderNotice'),
    positiveText: lang.t('dialogOps.delete'),
    negativeText: lang.t('dialogOps.cancel'),
    onPositiveClick: async () => {
      await appStore.resetProviderConfig(providerId);
      message.success('Provider removed.');
    },
  });
};

const syncProviderModels = async (providerId: string) => {
  providerSyncState[providerId] = 'loading';
  try {
    const models = await appStore.syncProviderModels(providerId);
    message.success(
      models.length > 0 ? 'Model catalog refreshed.' : 'No models found for this provider.',
    );
  } catch (err) {
    message.error((err as Error).message, { closable: true, keepAliveOnHover: true });
  } finally {
    providerSyncState[providerId] = 'idle';
  }
};

const testProvider = async (providerId: string) => {
  providerActionState[providerId] = 'testing';
  try {
    const isValid = await appStore.testProvider(providerId);
    if (isValid) {
      message.success('Provider connection successful.');
      return;
    }
    message.error('Unable to connect with the current provider configuration.', {
      closable: true,
      keepAliveOnHover: true,
    });
  } finally {
    providerActionState[providerId] = 'idle';
  }
};

const providerAuthLabel = (provider: ProviderConfig) => {
  switch (provider.authMode) {
    case 'none':
      return 'Local endpoint';
    default:
      return 'API key';
  }
};

const providerEndpointSummary = (provider: ProviderConfig) => {
  if (provider.kind === 'ollama') {
    return provider.baseUrl || 'http://127.0.0.1:11434';
  }
  if (provider.kind === 'lm-studio') {
    return provider.baseUrl || 'http://127.0.0.1:1234/v1';
  }
  if (provider.kind === 'custom-openai' || provider.kind === 'custom-anthropic') {
    return provider.baseUrl || 'Custom endpoint';
  }
  return provider.proxy?.trim() ? `Proxy: ${provider.proxy}` : 'Managed endpoint';
};

const providerStatusMessage = (provider: ProviderConfig) => {
  if (provider.connected) {
    return 'Ready for AI Assistant and Data Studio.';
  }
  if (provider.discoveredModels.length > 0) {
    return 'Models are available. Run connection test to verify credentials.';
  }
  return 'Refresh models after saving credentials to populate the shared catalog.';
};

const providerSyncLabel = (provider: ProviderConfig) => {
  if (provider.discoveredModels.length === 0) {
    return 'No models synced yet';
  }
  return `${provider.discoveredModels.length} models available`;
};

const providerBaseUrlPlaceholder = (kind: ProviderKind) => {
  switch (kind) {
    case 'ollama':
      return 'http://127.0.0.1:11434';
    case 'lm-studio':
      return 'http://127.0.0.1:1234/v1';
    case 'custom-openai':
      return 'https://your-endpoint.example/v1';
    case 'custom-anthropic':
      return 'https://your-endpoint.example';
    default:
      return 'https://api.example.com/v1';
  }
};

onMounted(async () => {
  await appStore.fetchLlmSettings();
});
</script>
