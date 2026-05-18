<template>
  <Dialog :open="props.show" @update:open="val => emit('update:show', val)">
    <DialogContent class="max-w-[520px]">
      <DialogHeader>
        <DialogTitle>{{ modalTitle }}</DialogTitle>
      </DialogHeader>

      <div class="pt-2 space-y-4">
        <!-- Streams -->
        <template v-if="activeTab === 'streams'">
          <FormItem :label="lang.t('manage.dynamo.enableStreams')">
            <Switch
              :checked="formValue.streamsEnabled"
              @update:checked="val => (formValue.streamsEnabled = val)"
            />
          </FormItem>
          <FormItem v-if="formValue.streamsEnabled" :label="lang.t('manage.dynamo.streamViewType')">
            <Select v-model="formValue.streamViewType">
              <SelectTrigger class="w-full">
                <SelectValue :placeholder="formValue.streamViewType" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="opt in streamViewTypeOptions"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </FormItem>
        </template>

        <!-- TTL -->
        <template v-else-if="activeTab === 'ttl'">
          <FormItem :label="lang.t('manage.dynamo.enableTtl')">
            <Switch
              :checked="formValue.ttlEnabled"
              @update:checked="val => (formValue.ttlEnabled = val)"
            />
          </FormItem>
          <FormItem v-if="formValue.ttlEnabled" :label="lang.t('manage.dynamo.ttlAttribute')">
            <Input
              v-model="formValue.ttlAttributeName"
              :placeholder="lang.t('manage.dynamo.ttlAttributePlaceholder')"
            />
          </FormItem>
        </template>

        <!-- PITR -->
        <template v-else-if="activeTab === 'pitr'">
          <FormItem :label="lang.t('manage.dynamo.enablePitr')">
            <Switch
              :checked="formValue.pitrEnabled"
              @update:checked="val => (formValue.pitrEnabled = val)"
            />
          </FormItem>
          <Alert v-if="formValue.pitrEnabled" variant="info">
            <AlertDescription>{{ lang.t('manage.dynamo.pitrWarning') }}</AlertDescription>
          </Alert>
        </template>

        <!-- Table Class -->
        <template v-else-if="activeTab === 'tableClass'">
          <FormItem :label="lang.t('manage.dynamo.tableClass')">
            <Select v-model="formValue.tableClass">
              <SelectTrigger class="w-full">
                <SelectValue :placeholder="formValue.tableClass" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in tableClassOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </FormItem>
          <Alert variant="info">
            <AlertDescription>{{ lang.t('manage.dynamo.tableClassInfo') }}</AlertDescription>
          </Alert>
        </template>

        <!-- Danger Zone -->
        <template v-else-if="activeTab === 'danger'">
          <!-- Truncate -->
          <div class="rounded-lg border border-destructive/40 overflow-hidden">
            <div
              class="px-4 py-3 bg-destructive/5 border-b border-destructive/20 flex items-center justify-between"
            >
              <div>
                <p class="text-sm font-medium">{{ lang.t('manage.dynamo.truncateTable') }}</p>
                <p class="text-xs text-muted-foreground mt-0.5">
                  {{ lang.t('manage.dynamo.truncateTableWarning') }}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                class="border-destructive/50 text-destructive hover:bg-destructive/10 shrink-0 ml-4"
                type="button"
                :disabled="truncateState !== 'idle'"
                @click="truncateState = 'confirm'"
              >
                {{ lang.t('manage.dynamo.truncateTable') }}
              </Button>
            </div>
            <div v-if="truncateState === 'confirm'" class="px-4 py-3 space-y-3">
              <p class="text-sm text-muted-foreground">
                {{ lang.t('manage.dynamo.truncateTableInfo') }}
                <span class="font-medium text-foreground">
                  {{ props.tableInfo?.itemCount?.toLocaleString() ?? '—' }}
                  {{ lang.t('manage.dynamo.items') }}
                </span>
                .
                {{ lang.t('manage.dynamo.truncateTableConfirmLabel') }}
              </p>
              <Input
                v-model="truncateConfirmInput"
                placeholder="truncate"
                autocapitalize="off"
                autocomplete="off"
                :spellcheck="false"
                autocorrect="off"
              />
              <div class="flex justify-end gap-2">
                <Button variant="ghost" size="sm" type="button" @click="resetTruncate">
                  {{ lang.t('dialogOps.cancel') }}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  type="button"
                  :disabled="truncateConfirmInput.toLowerCase() !== 'truncate' || truncateLoading"
                  @click="handleTruncate"
                >
                  <Spinner v-if="truncateLoading" class="mr-2 h-3 w-3" />
                  {{ lang.t('manage.dynamo.truncateTable') }}
                </Button>
              </div>
            </div>
            <div v-else-if="truncateState === 'loading'" class="px-4 py-4 flex items-center gap-3">
              <Spinner class="h-4 w-4" />
              <p class="text-sm text-muted-foreground">
                {{ lang.t('manage.dynamo.truncateTableInProgress') }}
              </p>
            </div>
            <div
              v-else-if="truncateState === 'success'"
              class="px-4 py-3 text-sm text-green-600 dark:text-green-400 flex items-center gap-2"
            >
              <span class="i-carbon-checkmark-filled h-4 w-4" />
              {{ lang.t('manage.dynamo.truncateTableSuccess') }}
              <span v-if="truncateResult" class="text-muted-foreground ml-1">
                ({{ truncateResult.deletedItems }} {{ lang.t('manage.dynamo.items') }})
              </span>
            </div>
            <div v-else-if="truncateState === 'error'" class="px-4 py-3 space-y-2">
              <Alert variant="destructive">
                <AlertDescription class="flex items-center justify-between">
                  <span>{{ truncateError }}</span>
                  <button
                    class="ml-2 hover:opacity-70 cursor-pointer"
                    type="button"
                    @click="resetTruncate"
                  >
                    <X class="w-4 h-4" />
                  </button>
                </AlertDescription>
              </Alert>
              <div class="flex justify-end">
                <Button variant="destructive" size="sm" type="button" @click="handleTruncate">
                  <Spinner v-if="truncateLoading" class="mr-2 h-3 w-3" />
                  {{ lang.t('dialogOps.retry') }}
                </Button>
              </div>
            </div>
          </div>

          <!-- Delete -->
          <div class="rounded-lg border border-destructive/40 overflow-hidden">
            <div
              class="px-4 py-3 bg-destructive/5 border-b border-destructive/20 flex items-center justify-between"
            >
              <div>
                <p class="text-sm font-medium">{{ lang.t('manage.dynamo.deleteTableTitle') }}</p>
                <p class="text-xs text-muted-foreground mt-0.5">
                  {{ lang.t('manage.dynamo.deleteTableWarning') }}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                class="border-destructive/50 text-destructive hover:bg-destructive/10 shrink-0 ml-4"
                type="button"
                :disabled="deleteState !== 'idle'"
                @click="deleteState = 'confirm'"
              >
                {{ lang.t('manage.dynamo.deleteTableTitle') }}
              </Button>
            </div>
            <div v-if="deleteState === 'confirm'" class="px-4 py-3 space-y-3">
              <p class="text-sm text-muted-foreground">
                {{ lang.t('manage.dynamo.deleteTableConfirmLabel') }}
                <span class="font-medium text-foreground">{{ props.tableName }}</span>
              </p>
              <Input
                v-model="deleteConfirmInput"
                :placeholder="props.tableName"
                autocapitalize="off"
                autocomplete="off"
                :spellcheck="false"
                autocorrect="off"
              />
              <div class="flex justify-end gap-2">
                <Button variant="ghost" size="sm" type="button" @click="resetDelete">
                  {{ lang.t('dialogOps.cancel') }}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  type="button"
                  :disabled="
                    deleteConfirmInput !== props.tableName ||
                    deleteLoading ||
                    deleteTimerElapsed < DELETE_MIN_DELAY
                  "
                  @click="handleDelete"
                >
                  <Spinner v-if="deleteLoading" class="mr-2 h-3 w-3" />
                  {{
                    deleteTimerElapsed < DELETE_MIN_DELAY
                      ? `${lang.t('manage.dynamo.deleteTableWait')} (${Math.ceil((DELETE_MIN_DELAY - deleteTimerElapsed) / 1000)}s)`
                      : lang.t('dialogOps.delete')
                  }}
                </Button>
              </div>
            </div>
            <div
              v-else-if="deleteState === 'success'"
              class="px-4 py-3 text-sm text-green-600 dark:text-green-400 flex items-center gap-2"
            >
              <span class="i-carbon-checkmark-filled h-4 w-4" />
              {{ lang.t('manage.dynamo.deleteTableSuccess') }}
            </div>
            <div v-else-if="deleteState === 'error'" class="px-4 py-3 space-y-2">
              <Alert variant="destructive">
                <AlertDescription class="flex items-center justify-between">
                  <span>{{ deleteError }}</span>
                  <button
                    class="ml-2 hover:opacity-70 cursor-pointer"
                    type="button"
                    @click="resetDelete"
                  >
                    <X class="w-4 h-4" />
                  </button>
                </AlertDescription>
              </Alert>
              <div class="flex justify-end">
                <Button variant="destructive" size="sm" type="button" @click="handleDelete">
                  <Spinner v-if="deleteLoading" class="mr-2 h-3 w-3" />
                  {{ lang.t('dialogOps.retry') }}
                </Button>
              </div>
            </div>
          </div>
        </template>
      </div>

      <Alert v-if="errorMessage" variant="destructive" class="mt-3">
        <AlertDescription class="flex items-center justify-between">
          <span>{{ errorMessage }}</span>
          <button
            class="ml-2 text-sm hover:opacity-70 cursor-pointer"
            aria-label="Dismiss"
            type="button"
            @click="errorMessage = ''"
          >
            <X class="w-4 h-4" />
          </button>
        </AlertDescription>
      </Alert>

      <Alert v-if="successMessage" class="mt-3">
        <AlertDescription>{{ successMessage }}</AlertDescription>
      </Alert>

      <DialogFooter v-if="activeTab !== 'danger'" class="mt-4">
        <Button variant="outline" :disabled="loading" @click="handleCancel">
          {{ lang.t('dialogOps.cancel') }}
        </Button>
        <Button type="submit" :disabled="loading" @click="handleSubmit">
          <Spinner v-if="loading" class="mr-2 h-4 w-4" />
          {{ lang.t('dialogOps.save') }}
        </Button>
      </DialogFooter>
      <DialogFooter v-else class="mt-4">
        <Button variant="outline" @click="handleCancel">
          {{ lang.t('dialogOps.close') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { X } from 'lucide-vue-next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { FormItem } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { MIN_LOADING_TIME, SUCCESS_MESSAGE_DELAY } from '../../../common';
import { useLang } from '../../../lang';
import {
  useDynamoManageStore,
  DynamoDBConnection,
  DatabaseType,
  TruncateResult,
} from '../../../store';
import { DynamoDBTableInfo } from '../../../datasources';

const lang = useLang();
const dynamoManageStore = useDynamoManageStore();

const DELETE_MIN_DELAY = 1000;

type DangerState = 'idle' | 'confirm' | 'loading' | 'success' | 'error';

// Form state
const formValue = ref({
  streamsEnabled: false,
  streamViewType: 'NEW_AND_OLD_IMAGES',
  ttlEnabled: false,
  ttlAttributeName: '',
  pitrEnabled: false,
  tableClass: 'STANDARD',
});

// Truncate state
const truncateState = ref<DangerState>('idle');
const truncateConfirmInput = ref('');
const truncateLoading = ref(false);
const truncateResult = ref<TruncateResult | null>(null);
const truncateError = ref('');

const resetTruncate = () => {
  truncateState.value = 'idle';
  truncateConfirmInput.value = '';
  truncateLoading.value = false;
  truncateResult.value = null;
  truncateError.value = '';
};

// Delete state
const deleteState = ref<DangerState>('idle');
const deleteConfirmInput = ref('');
const deleteLoading = ref(false);
const deleteError = ref('');
const deleteTimerElapsed = ref(0);
const deleteTimerRef = ref<ReturnType<typeof setInterval> | null>(null);

const resetDelete = () => {
  deleteState.value = 'idle';
  deleteConfirmInput.value = '';
  deleteLoading.value = false;
  deleteError.value = '';
  deleteTimerElapsed.value = 0;
  if (deleteTimerRef.value) {
    clearInterval(deleteTimerRef.value);
    deleteTimerRef.value = null;
  }
};

// Select options
const streamViewTypeOptions = [
  { value: 'NEW_AND_OLD_IMAGES', label: 'New and old images' },
  { value: 'NEW_IMAGE', label: 'New image' },
  { value: 'OLD_IMAGE', label: 'Old image' },
  { value: 'KEYS_ONLY', label: 'Keys only' },
];

const tableClassOptions = [
  { value: 'STANDARD', label: 'DynamoDB Standard' },
  { value: 'STANDARD_INFREQUENT_ACCESS', label: 'DynamoDB Standard-IA' },
];

type Props = {
  show: boolean;
  tableName: string;
  connection: DynamoDBConnection;
  tableInfo: DynamoDBTableInfo | undefined;
  pitrEnabled: boolean;
  defaultTab?: string;
  currentSettings: {
    streamsEnabled: boolean;
    streamViewType: string;
    ttlEnabled: boolean;
    ttlAttributeName: string;
    pitrEnabled: boolean;
    tableClass: string;
  };
};

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  (e: 'saved'): void;
  (e: 'truncated', result: TruncateResult): void;
  (e: 'deleted'): void;
}>();

const loading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const activeTab = computed(() => props.defaultTab || 'streams');

const modalTitle = computed(() => {
  const t = lang.t.bind(lang);
  const map: Record<string, string> = {
    streams: t('manage.dynamo.streams'),
    ttl: t('manage.dynamo.ttl'),
    pitr: t('manage.dynamo.pitr'),
    tableClass: t('manage.dynamo.tableClass'),
    danger: t('manage.dynamo.dangerZone'),
  };
  return map[activeTab.value] ?? t('manage.dynamo.tableSettings');
});

watch(
  () => props.show,
  newVal => {
    if (newVal) {
      formValue.value = {
        streamsEnabled: props.currentSettings.streamsEnabled,
        streamViewType: props.currentSettings.streamViewType || 'NEW_AND_OLD_IMAGES',
        ttlEnabled: props.currentSettings.ttlEnabled,
        ttlAttributeName: props.currentSettings.ttlAttributeName || '',
        pitrEnabled: props.currentSettings.pitrEnabled,
        tableClass: props.currentSettings.tableClass || 'STANDARD',
      };
      errorMessage.value = '';
      successMessage.value = '';
      loading.value = false;
      resetTruncate();
      resetDelete();
    }
  },
);

// Start delete timer when confirm panel opens
watch(deleteState, newState => {
  if (newState === 'confirm') {
    deleteTimerElapsed.value = 0;
    deleteTimerRef.value = setInterval(() => {
      deleteTimerElapsed.value += 100;
      if (deleteTimerElapsed.value >= DELETE_MIN_DELAY && deleteTimerRef.value) {
        clearInterval(deleteTimerRef.value);
        deleteTimerRef.value = null;
      }
    }, 100);
  } else {
    if (deleteTimerRef.value) {
      clearInterval(deleteTimerRef.value);
      deleteTimerRef.value = null;
    }
  }
});

onUnmounted(() => {
  if (deleteTimerRef.value) {
    clearInterval(deleteTimerRef.value);
  }
});

const handleCancel = () => {
  emit('update:show', false);
};

const handleSubmit = async () => {
  if (props.connection.type !== DatabaseType.DYNAMODB) {
    errorMessage.value = 'Invalid connection type';
    return;
  }

  const startTime = Date.now();
  errorMessage.value = '';
  successMessage.value = '';

  try {
    loading.value = true;

    const tab = activeTab.value;
    if (tab === 'streams') {
      await dynamoManageStore.updateStreams(props.connection, props.tableName, {
        enabled: formValue.value.streamsEnabled,
        streamViewType: formValue.value.streamViewType as
          | 'KEYS_ONLY'
          | 'NEW_IMAGE'
          | 'OLD_IMAGE'
          | 'NEW_AND_OLD_IMAGES',
      });
      successMessage.value = lang.t('manage.dynamo.updateStreamsSuccess');
    } else if (tab === 'ttl') {
      await dynamoManageStore.updateTimeToLive(props.connection, props.tableName, {
        enabled: formValue.value.ttlEnabled,
        attributeName: formValue.value.ttlAttributeName || undefined,
      });
      successMessage.value = lang.t('manage.dynamo.updateTtlSuccess');
    } else if (tab === 'pitr') {
      await dynamoManageStore.updateContinuousBackups(
        props.connection,
        props.tableName,
        formValue.value.pitrEnabled,
      );
      successMessage.value = lang.t('manage.dynamo.updatePitrSuccess');
    } else if (tab === 'tableClass') {
      await dynamoManageStore.updateTableConfig(props.connection, props.tableName, {
        tableClass: formValue.value.tableClass as 'STANDARD' | 'STANDARD_INFREQUENT_ACCESS',
      });
      successMessage.value = lang.t('manage.dynamo.updateTableConfigSuccess');
    }

    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));

    setTimeout(() => {
      emit('update:show', false);
      emit('saved');
    }, SUCCESS_MESSAGE_DELAY);
  } catch (error: unknown) {
    const err = error as { details?: string; status?: number; message?: string };
    errorMessage.value = err?.details
      ? `status: ${err?.status ?? 'unknown'}, details: ${err.details}`
      : err?.message || String(error);
  } finally {
    loading.value = false;
  }
};

const handleTruncate = async () => {
  if (props.connection.type !== DatabaseType.DYNAMODB) return;
  if (truncateConfirmInput.value.toLowerCase() !== 'truncate') return;

  const startTime = Date.now();
  try {
    truncateLoading.value = true;
    truncateState.value = 'loading';

    const result = await dynamoManageStore.truncateTable(props.connection, props.tableName);
    truncateResult.value = result;

    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));

    truncateState.value = 'success';
    setTimeout(() => {
      emit('truncated', result);
    }, SUCCESS_MESSAGE_DELAY);
  } catch (error: unknown) {
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));

    truncateState.value = 'error';
    const err = error as { details?: string; status?: number; message?: string };
    truncateError.value = err?.details
      ? `status: ${err?.status ?? 'unknown'}, details: ${err.details}`
      : err?.message || String(error);
  } finally {
    truncateLoading.value = false;
  }
};

const handleDelete = async () => {
  if (props.connection.type !== DatabaseType.DYNAMODB) return;
  if (deleteConfirmInput.value !== props.tableName) return;

  const startTime = Date.now();
  try {
    deleteLoading.value = true;

    await dynamoManageStore.deleteTable(props.connection, props.tableName);

    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));

    deleteState.value = 'success';
    setTimeout(() => {
      emit('update:show', false);
      emit('deleted');
    }, SUCCESS_MESSAGE_DELAY);
  } catch (error: unknown) {
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));

    deleteState.value = 'error';
    const err = error as { details?: string; status?: number; message?: string };
    deleteError.value = err?.details
      ? `status: ${err?.status ?? 'unknown'}, details: ${err.details}`
      : err?.message || String(error);
  } finally {
    deleteLoading.value = false;
  }
};
</script>
