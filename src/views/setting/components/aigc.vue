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

            <Tabs
              v-if="supportsAuthTabs(draftProvider.kind)"
              :model-value="providerAuthTab"
              @update:model-value="updateProviderAuthTab"
            >
              <TabsList class="grid w-full grid-cols-2">
                <TabsTrigger value="website">
                  {{ $t('setting.ai.providers.websiteTab') }}
                </TabsTrigger>
                <TabsTrigger value="api-key">
                  {{ $t('setting.ai.providers.apiKeyTab') }}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="website" class="m-0 pt-4">
                <Alert variant="info">
                  <span class="i-carbon-information h-4 w-4" />
                  <AlertDescription>
                    {{ $t('setting.ai.providers.openrouterAuthDesc') }}
                  </AlertDescription>
                </Alert>

                <div
                  class="mt-4 flex items-center justify-between rounded-2xl border border-border/80 bg-muted/30 p-4"
                >
                  <div>
                    <p class="text-sm font-medium">
                      {{ $t('setting.ai.providers.openrouterAuthTitle') }}
                    </p>
                    <p class="text-sm text-muted-foreground">
                      {{ $t('setting.ai.providers.websiteTabDescription') }}
                    </p>
                  </div>
                  <Button variant="default" @click="openOpenRouterWebsite">
                    {{ $t('setting.ai.providers.openRouterConnect') }}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="api-key" class="m-0 pt-4 space-y-4">
                <FormItem
                  :label="$t('setting.ai.apiKey')"
                  :error="draftProviderErrors.apiKey"
                  required
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
              </TabsContent>
            </Tabs>

            <div v-else class="space-y-4">
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
                <Input v-model="draftProvider.proxy" placeholder="http://127.0.0.1:7890" />
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
              {{ $t('setting.ai.providers.testFailed') }}
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
import { open } from '@tauri-apps/plugin-shell';
import { storeToRefs } from 'pinia';
import { useLang } from '@/lang';
import { useDialogService, useMessageService } from '@/composables';
import { type ProviderConfig, type ProviderKind, useAppStore } from '@/store';
import { chatBotApi, ProviderEnum } from '@/datasources';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type ProviderErrorMap = Partial<Record<'apiKey' | 'baseUrl' | 'proxy', string>>;
type ProviderAuthTab = 'website' | 'api-key';

const API_KEY_SENTINEL = '__UNCHANGED__';

const appStore = useAppStore();
const { llmSettings } = storeToRefs(appStore);
const lang = useLang();
const dialog = useDialogService();
const message = useMessageService();

const providerActionState = reactive<Record<string, 'idle' | 'testing'>>({});
const providerSyncState = reactive<Record<string, 'idle' | 'loading'>>({});

const providerDialogOpen = ref(false);
const providerDialogMode = ref<'create' | 'edit'>('create');
const editingProviderId = ref<string | null>(null);
const showApiKey = ref(false);
const draftProviderKind = ref<ProviderKind | null>(null);
const providerAuthTab = ref<ProviderAuthTab>('api-key');
const draftProvider = ref<ProviderConfig | null>(null);
const draftProviderErrors = reactive<ProviderErrorMap>({});

const dialogTestState = ref<'idle' | 'testing' | 'success' | 'failed'>('idle');

const normalizeBaseUrl = (url: string): string => {
  const trimmed = url.trim();
  if (!trimmed) return '';

  const withoutSlashes = trimmed.replace(/\/+$/, '');

  if (withoutSlashes.endsWith('/v1')) {
    return withoutSlashes;
  }

  return `${withoutSlashes}/v1`;
};

const providerPresets: Record<ProviderKind, Partial<ProviderConfig>> = {
  openai: { label: 'OpenAI', authMode: 'api-key', baseUrl: 'https://api.openai.com/v1' },
  deepseek: { label: 'DeepSeek', authMode: 'api-key', baseUrl: 'https://api.deepseek.com/v1' },
  openrouter: { label: 'OpenRouter', authMode: 'oauth', baseUrl: 'https://openrouter.ai/api/v1' },
  ollama: { label: 'Ollama', authMode: 'none', baseUrl: 'http://127.0.0.1:11434' },
  'lm-studio': { label: 'LM Studio', authMode: 'none', baseUrl: 'http://127.0.0.1:1234/v1' },
  'custom-openai': { label: 'Custom OpenAI-Compatible', authMode: 'api-key', baseUrl: '' },
  'custom-anthropic': { label: 'Custom Anthropic-Compatible', authMode: 'api-key', baseUrl: '' },
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
  proxy: provider.proxy ?? '',
  enabled: true,
});

const createDraftProvider = (kind: ProviderKind) => {
  const preset = providerPresets[kind];
  return normalizeProviderDraft({
    id: kind,
    kind,
    label: preset.label ?? kind,
    authMode: preset.authMode ?? 'api-key',
    apiKey: '',
    baseUrl: preset.baseUrl ?? '',
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

  if (
    showApiKeyField(draftProvider.value) &&
    providerAuthTab.value === 'api-key' &&
    !apiKeyUnchanged &&
    !apiKeyValue
  ) {
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

const supportsAuthTabs = (kind: ProviderKind) => kind === 'openrouter';

const updateProviderAuthTab = (value: string | number) => {
  providerAuthTab.value = value as ProviderAuthTab;
  dialogTestState.value = 'idle';
  if (!draftProvider.value) return;
  draftProvider.value.authMode = providerAuthTab.value === 'website' ? 'oauth' : 'api-key';
};

const updateDraftProviderKind = (value: string | number) => {
  draftProviderKind.value = value as ProviderKind;
  draftProvider.value = createDraftProvider(draftProviderKind.value);
  providerAuthTab.value = draftProvider.value.kind === 'openrouter' ? 'website' : 'api-key';
  dialogTestState.value = 'idle';
  resetDraftProviderErrors();
};

const openCreateProviderDialog = () => {
  providerDialogMode.value = 'create';
  editingProviderId.value = null;
  draftProviderKind.value = availableProviderOptions.value[0]?.value ?? null;
  draftProvider.value = draftProviderKind.value
    ? createDraftProvider(draftProviderKind.value)
    : null;
  providerAuthTab.value = draftProvider.value?.kind === 'openrouter' ? 'website' : 'api-key';
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
  providerAuthTab.value = provider.authMode === 'oauth' ? 'website' : 'api-key';
  resetDraftProviderErrors();
  providerDialogOpen.value = true;
};

const draftKindToEnum = (kind: ProviderKind): ProviderEnum => {
  switch (kind) {
    case 'deepseek':
      return ProviderEnum.DEEP_SEEK;
    case 'openrouter':
      return ProviderEnum.OPENROUTER;
    case 'ollama':
      return ProviderEnum.OLLAMA;
    case 'lm-studio':
      return ProviderEnum.LM_STUDIO;
    default:
      return ProviderEnum.OPENAI;
  }
};

const testDraftProvider = async () => {
  if (!draftProvider.value) return;
  dialogTestState.value = 'testing';
  const draft = draftProvider.value;
  const draftApiKey = draft.apiKey?.trim();
  const originalProvider = llmSettings.value.providers.find(p => p.id === draft.id);
  const resolvedApiKey =
    providerAuthTab.value === 'website'
      ? ''
      : draftApiKey === API_KEY_SENTINEL
        ? (originalProvider?.apiKey?.trim() ?? '')
        : (draftApiKey ?? '');

  const isValid = await chatBotApi.validateConfig({
    provider: draftKindToEnum(draft.kind),
    apiKey: resolvedApiKey,
    model: '',
    httpProxy: draft.proxy?.trim() || undefined,
    baseUrl: draft.baseUrl?.trim() || undefined,
  });
  dialogTestState.value = isValid ? 'success' : 'failed';
};

const closeProviderDialog = () => {
  providerDialogOpen.value = false;
  editingProviderId.value = null;
  draftProviderKind.value = null;
  draftProvider.value = null;
  providerAuthTab.value = 'api-key';
  dialogTestState.value = 'idle';
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

  const isWebsiteAuth =
    draftProvider.value.kind === 'openrouter' && providerAuthTab.value === 'website';

  // Sentinel means user didn't change the key — keep existing value
  const draftApiKey = draftProvider.value.apiKey?.trim();
  const originalProvider = llmSettings.value.providers.find(p => p.id === draftProvider.value!.id);
  const resolvedApiKey = isWebsiteAuth
    ? ''
    : draftApiKey === API_KEY_SENTINEL
      ? (originalProvider?.apiKey ?? '')
      : (draftApiKey ?? '');

  await appStore.updateProviderConfig(draftProvider.value.id, {
    label: draftProvider.value.label.trim() || providerPresets[draftProvider.value.kind].label,
    authMode:
      draftProvider.value.kind === 'openrouter'
        ? providerAuthTab.value === 'website'
          ? 'oauth'
          : 'api-key'
        : draftProvider.value.authMode,
    apiKey: resolvedApiKey,
    baseUrl: normalizeBaseUrl(draftProvider.value.baseUrl ?? ''),
    proxy: draftProvider.value.proxy?.trim() ?? '',
    enabled: true,
    connected:
      draftProvider.value.kind === 'ollama' || draftProvider.value.kind === 'lm-studio'
        ? draftProvider.value.connected
        : false,
  });

  if (isWebsiteAuth) {
    await openOpenRouterWebsite();
  }

  closeProviderDialog();
  message.success('Provider saved.');
};

const removeProvider = (providerId: string) => {
  dialog.warning({
    title: lang.t('dialogOps.warning'),
    content: lang.t('setting.ai.removeProviderNotice'),
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
    case 'oauth':
      return 'Website auth';
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

const openOpenRouterWebsite = async () => {
  await open('https://openrouter.ai/settings/keys');
};

onMounted(async () => {
  await appStore.fetchLlmSettings();
});
</script>
