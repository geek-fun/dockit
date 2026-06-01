<template>
  <Dialog v-model:open="showModal">
    <DialogContent class="sm:max-w-[800px]">
      <DialogHeader>
        <DialogTitle>{{ $t('manage.index.newAliasForm.title') }}</DialogTitle>
      </DialogHeader>

      <div v-if="isSuccess" class="text-center py-4">
        <div class="text-green-500 text-4xl mb-2">✓</div>
        <p class="text-sm font-medium">{{ lang.t('dialogOps.createSuccess') }}</p>
      </div>

      <Alert v-else-if="isError" variant="destructive" class="mb-3">
        <AlertDescription class="flex items-center justify-between">
          <span>{{ message }}</span>
          <button class="ml-2 text-sm hover:opacity-70 cursor-pointer" @click="reset()">
            <X class="w-4 h-4" />
          </button>
        </AlertDescription>
      </Alert>

      <Form v-if="isIdle" @submit.prevent="submitCreate">
        <div class="modal-content">
          <Grid :cols="8" :x-gap="10" :y-gap="10">
            <GridItem :span="8">
              <FormItem
                :label="$t('manage.index.newAliasForm.aliasName')"
                required
                :error="getError('aliasName', fieldErrors.aliasName)"
              >
                <Input
                  v-model="formData.aliasName"
                  autocapitalize="off"
                  autocomplete="off"
                  :spellcheck="false"
                  autocorrect="off"
                  :placeholder="$t('manage.index.newAliasForm.aliasName')"
                  @blur="handleBlur('aliasName')"
                />
              </FormItem>
            </GridItem>
            <GridItem :span="8">
              <FormItem
                :label="$t('manage.index.newAliasForm.indexName')"
                required
                :error="getError('indexName', fieldErrors.indexName)"
              >
                <SearchableSelect
                  v-model="formData.indexName"
                  :options="indices"
                  :placeholder="$t('manage.index.newAliasForm.indexName')"
                  @update:model-value="handleBlur('indexName')"
                />
              </FormItem>
            </GridItem>
          </Grid>
          <Collapse class="mt-4">
            <CollapseItem :title="$t('manage.index.newAliasForm.advanced')" name="Advanced">
              <Grid :cols="8" :x-gap="10" :y-gap="10">
                <GridItem :span="4">
                  <FormItem :label="$t('manage.index.newAliasForm.masterTimeout')">
                    <div class="flex items-center gap-2">
                      <InputNumber
                        v-model="formData.master_timeout"
                        class="flex-1"
                        placeholder="30"
                      />
                      <span class="text-sm text-muted-foreground">s</span>
                    </div>
                    <p class="text-xs text-muted-foreground mt-1">
                      {{ $t('manage.index.newAliasForm.masterTimeoutDesc') }}
                    </p>
                  </FormItem>
                </GridItem>
                <GridItem :span="4">
                  <FormItem :label="$t('manage.index.newAliasForm.timeout')">
                    <div class="flex items-center gap-2">
                      <InputNumber v-model="formData.timeout" class="flex-1" placeholder="30" />
                      <span class="text-sm text-muted-foreground">s</span>
                    </div>
                    <p class="text-xs text-muted-foreground mt-1">
                      {{ $t('manage.index.newAliasForm.timeoutDesc') }}
                    </p>
                  </FormItem>
                </GridItem>
                <GridItem :span="4">
                  <FormItem :label="$t('manage.index.newAliasForm.isWriteIndex')">
                    <Switch v-model:checked="formData.is_write_index" />
                    <p class="text-xs text-muted-foreground mt-1">
                      {{ $t('manage.index.newAliasForm.isWriteIndexDesc') }}
                    </p>
                  </FormItem>
                </GridItem>
                <GridItem :span="4">
                  <FormItem :label="$t('manage.index.newAliasForm.routing')">
                    <InputNumber v-model="formData.routing" placeholder="" />
                    <p class="text-xs text-muted-foreground mt-1">
                      {{ $t('manage.index.newAliasForm.routingDesc') }}
                    </p>
                  </FormItem>
                </GridItem>
                <GridItem :span="4">
                  <FormItem :label="$t('manage.index.newAliasForm.searchRouting')">
                    <InputNumber v-model="formData.search_routing" placeholder="" />
                    <p class="text-xs text-muted-foreground mt-1">
                      {{ $t('manage.index.newAliasForm.searchRoutingDesc') }}
                    </p>
                  </FormItem>
                </GridItem>
                <GridItem :span="4">
                  <FormItem :label="$t('manage.index.newAliasForm.indexRouting')">
                    <InputNumber v-model="formData.index_routing" placeholder="" />
                    <p class="text-xs text-muted-foreground mt-1">
                      {{ $t('manage.index.newAliasForm.indexRoutingDesc') }}
                    </p>
                  </FormItem>
                </GridItem>
                <GridItem :span="8">
                  <FormItem label="filter" :error="getError('filter', fieldErrors.filter)">
                    <textarea
                      v-model="formData.filter"
                      class="textarea-input"
                      :placeholder="$t('manage.index.newAliasForm.filterPlaceholder')"
                      @blur="handleBlur('filter')"
                    />
                  </FormItem>
                </GridItem>
              </Grid>
            </CollapseItem>
          </Collapse>
        </div>
        <DialogFooter>
          <Button variant="outline" :disabled="createLoading" @click="closeModal">
            {{ isSuccess ? $t('dialogOps.close') : $t('dialogOps.cancel') }}
          </Button>
          <Button
            v-if="isError"
            variant="destructive"
            :disabled="createLoading"
            @click="handleRetry"
          >
            <Loader2 v-if="createLoading" class="mr-2 h-4 w-4 animate-spin" />
            {{ $t('dialogOps.retry') }}
          </Button>
          <Button v-else-if="isIdle" type="submit" :disabled="!validationPassed || createLoading">
            <Loader2 v-if="createLoading" class="mr-2 h-4 w-4 animate-spin" />
            {{ $t('dialogOps.create') }}
          </Button>
        </DialogFooter>
      </Form>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Loader2, X } from 'lucide-vue-next';
import { useFormValidation, useDialogResult, formatApiError } from '@/composables';
import { jsonify, withLoadingDelay } from '../../../common';
import { useClusterManageStore } from '../../../store';
import { useLang } from '../../../lang';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { InputNumber } from '@/components/ui/input-number';
import { Form, FormItem } from '@/components/ui/form';
import { Grid, GridItem } from '@/components/ui/grid';
import { Collapse, CollapseItem } from '@/components/ui/collapse';
import { SearchableSelect } from '@/components/ui/combobox';
import { Switch } from '@/components/ui/switch';

const clusterManageStore = useClusterManageStore();
const { createAlias, refreshStates } = clusterManageStore;
const { indexWithAliases } = storeToRefs(clusterManageStore);
const lang = useLang();
const { handleBlur, getError, markSubmitted, resetValidation } = useFormValidation();

const showModal = ref(false);
const createLoading = ref(false);
const { message, isIdle, isSuccess, isError, succeed, fail, reset } = useDialogResult();

const defaultFormData = {
  aliasName: '',
  indexName: '',
  master_timeout: null as number | null,
  timeout: null as number | null,
  is_write_index: undefined as boolean | undefined,
  filter: null as string | null,
  routing: null as number | null,
  search_routing: null as number | null,
  index_routing: null as number | null,
};

const formData = ref<{
  aliasName: string;
  indexName: string;
  master_timeout: number | null;
  timeout: number | null;
  is_write_index?: boolean;
  filter: string | null;
  routing: number | null;
  search_routing: number | null;
  index_routing: number | null;
}>({ ...defaultFormData });

const isValidJson = (value: string | null): boolean => {
  if (!value) return true;
  try {
    jsonify.parse(value);
    return true;
  } catch {
    return false;
  }
};

const fieldErrors = computed(() => ({
  aliasName: !formData.value.aliasName?.trim()
    ? lang.t('manage.index.newAliasForm.aliasRequired')
    : undefined,
  indexName: !formData.value.indexName?.trim()
    ? lang.t('manage.index.newAliasForm.indexRequired')
    : undefined,
  filter: !isValidJson(formData.value.filter)
    ? lang.t('manage.index.newAliasForm.filterJsonRequired')
    : undefined,
}));

const validationPassed = computed(() => {
  return !fieldErrors.value.aliasName && !fieldErrors.value.indexName && !fieldErrors.value.filter;
});

const handleRetry = () => {
  reset();
  submitCreate(new MouseEvent('click'));
};

const toggleModal = () => {
  if (showModal.value) {
    closeModal();
  } else {
    reset();
    showModal.value = true;
  }
};

const closeModal = () => {
  showModal.value = false;
  formData.value = { ...defaultFormData };
  resetValidation();
  reset();
};

const submitCreate = async (event: MouseEvent) => {
  event.preventDefault();
  markSubmitted();
  if (!validationPassed.value) return;

  createLoading.value = true;
  reset();
  try {
    await withLoadingDelay(
      createAlias({
        ...formData.value,
        filter: formData.value.filter ? jsonify.parse(formData.value.filter) : undefined,
      }),
    );
    succeed();
    await refreshStates();
    setTimeout(() => closeModal(), 1500);
  } catch (err) {
    fail(formatApiError(err));
  } finally {
    createLoading.value = false;
  }
};

const indices = computed(() =>
  indexWithAliases.value
    .map(index => ({
      label: index.index,
      value: index.index,
    }))
    .sort((a, b) => a.label.localeCompare(b.label)),
);

defineExpose({ toggleModal });
</script>

<style scoped>
.modal-content {
  padding: 1rem 0;
}

.textarea-input {
  display: flex;
  min-height: 200px;
  max-height: 300px;
  width: 100%;
  border-radius: 0.375rem;
  border: 1px solid hsl(var(--input));
  background-color: hsl(var(--background));
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  resize: vertical;
}

.textarea-input:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px hsl(var(--ring));
}

.textarea-input:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.textarea-input::placeholder {
  color: hsl(var(--muted-foreground));
}
</style>
