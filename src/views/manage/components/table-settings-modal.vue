<template>
  <Dialog :open="props.show" @update:open="val => emit('update:show', val)">
    <DialogContent class="max-w-[600px]">
      <DialogHeader>
        <DialogTitle>{{ lang.t('manage.dynamo.tableSettingsTitle') }}</DialogTitle>
      </DialogHeader>

      <Tabs default-value="streams" class="w-full">
        <TabsList class="grid w-full grid-cols-4">
          <TabsTrigger value="streams">{{ lang.t('manage.dynamo.streams') }}</TabsTrigger>
          <TabsTrigger value="ttl">{{ lang.t('manage.dynamo.ttl') }}</TabsTrigger>
          <TabsTrigger value="pitr">{{ lang.t('manage.dynamo.pitr') }}</TabsTrigger>
          <TabsTrigger value="tableClass">{{ lang.t('manage.dynamo.tableClass') }}</TabsTrigger>
        </TabsList>

        <!-- Streams Tab -->
        <TabsContent value="streams">
          <Form class="space-y-4 pt-4">
            <FormItem :label="lang.t('manage.dynamo.enableStreams')">
              <Switch
                :checked="formValue.streamsEnabled"
                @update:checked="val => (formValue.streamsEnabled = val)"
              />
            </FormItem>
            <FormItem
              v-if="formValue.streamsEnabled"
              :label="lang.t('manage.dynamo.streamViewType')"
            >
              <Select v-model="formValue.streamViewType">
                <SelectTrigger class="w-full">
                  <SelectValue :placeholder="formValue.streamViewType" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="option in streamViewTypeOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          </Form>
        </TabsContent>

        <!-- TTL Tab -->
        <TabsContent value="ttl">
          <Form class="space-y-4 pt-4">
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
          </Form>
        </TabsContent>

        <!-- PITR Tab -->
        <TabsContent value="pitr">
          <Form class="space-y-4 pt-4">
            <FormItem :label="lang.t('manage.dynamo.enablePitr')">
              <Switch
                :checked="formValue.pitrEnabled"
                @update:checked="val => (formValue.pitrEnabled = val)"
              />
            </FormItem>
            <Alert v-if="formValue.pitrEnabled" variant="info" class="mt-2">
              <AlertDescription>{{ lang.t('manage.dynamo.pitrWarning') }}</AlertDescription>
            </Alert>
          </Form>
        </TabsContent>

        <!-- Table Class Tab -->
        <TabsContent value="tableClass">
          <Form class="space-y-4 pt-4">
            <FormItem :label="lang.t('manage.dynamo.tableClass')">
              <Select v-model="formValue.tableClass">
                <SelectTrigger class="w-full">
                  <SelectValue :placeholder="formValue.tableClass" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="option in tableClassOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
            <Alert variant="info" class="mt-2">
              <AlertDescription>{{ lang.t('manage.dynamo.tableClassInfo') }}</AlertDescription>
            </Alert>
          </Form>
        </TabsContent>
      </Tabs>

      <Alert v-if="errorMessage" variant="destructive" class="mt-3">
        <AlertDescription class="flex items-center justify-between">
          <span>{{ errorMessage }}</span>
          <button class="ml-2 text-sm hover:opacity-70 cursor-pointer" @click="errorMessage = ''">
            <X class="w-4 h-4" />
          </button>
        </AlertDescription>
      </Alert>

      <DialogFooter class="mt-4">
        <Button variant="outline" :disabled="loading" @click="handleCancel">
          {{ lang.t('dialogOps.cancel') }}
        </Button>
        <Button :disabled="loading" @click="handleSubmit">
          <Spinner v-if="loading" class="mr-2 h-4 w-4" />
          {{ lang.t('dialogOps.save') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { X } from 'lucide-vue-next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Form, FormItem } from '@/components/ui/form';
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
import { MIN_LOADING_TIME } from '../../../common';
import { useLang } from '../../../lang';

const lang = useLang();

interface Props {
  show: boolean;
  tableName: string;
  currentSettings: {
    streamsEnabled: boolean;
    streamViewType: string;
    ttlEnabled: boolean;
    ttlAttributeName: string;
    pitrEnabled: boolean;
    tableClass: string;
  };
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  (e: 'saved'): void;
}>();

const loading = ref(false);
const errorMessage = ref('');

const formValue = ref({
  streamsEnabled: false,
  streamViewType: 'NEW_AND_OLD_IMAGES',
  ttlEnabled: false,
  ttlAttributeName: '',
  pitrEnabled: false,
  tableClass: 'STANDARD',
});

const streamViewTypeOptions = [
  { label: 'KEYS_ONLY', value: 'KEYS_ONLY' },
  { label: 'NEW_IMAGE', value: 'NEW_IMAGE' },
  { label: 'OLD_IMAGE', value: 'OLD_IMAGE' },
  { label: 'NEW_AND_OLD_IMAGES', value: 'NEW_AND_OLD_IMAGES' },
];

const tableClassOptions = [
  { label: 'DynamoDB Standard', value: 'STANDARD' },
  { label: 'DynamoDB Standard-IA', value: 'STANDARD_INFREQUENT_ACCESS' },
];

// Reset form when modal opens
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
      loading.value = false;
    }
  },
);

const handleCancel = () => {
  emit('update:show', false);
};

const handleSubmit = async () => {
  const startTime = Date.now();

  try {
    loading.value = true;

    // TODO: Call backend APIs to update table settings when implemented
    // For now, simulate the operation
    await new Promise(resolve => setTimeout(resolve, MIN_LOADING_TIME));

    // Ensure minimum loading time
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    emit('update:show', false);
    emit('saved');
  } catch (error: unknown) {
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    const err = error as { details?: string; status?: number; message?: string };
    errorMessage.value = err?.details
      ? `status: ${err?.status ?? 'unknown'}, details: ${err.details}`
      : err?.message || String(error);
  } finally {
    loading.value = false;
  }
};
</script>
