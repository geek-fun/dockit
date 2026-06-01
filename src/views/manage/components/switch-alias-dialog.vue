<template>
  <Dialog v-model:open="showModal">
    <DialogContent class="sm:max-w-[800px]">
      <DialogHeader>
        <DialogTitle>{{ $t('manage.index.switchAliasForm.title') }}</DialogTitle>
      </DialogHeader>
      <div v-if="isSuccess" class="text-center py-4">
        <div class="text-green-500 text-4xl mb-2">✓</div>
        <p class="text-sm font-medium">{{ lang.t('dialogOps.switchSuccess') }}</p>
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
              <FormItem :label="$t('manage.index.switchAliasForm.aliasName')">
                <Input
                  v-model="formData.aliasName"
                  disabled
                  autocapitalize="off"
                  autocomplete="off"
                  :spellcheck="false"
                  autocorrect="off"
                />
              </FormItem>
              <FormItem :label="$t('manage.index.switchAliasForm.sourceIndex')" class="mt-4">
                <Input
                  v-model="formData.sourceIndex"
                  disabled
                  autocapitalize="off"
                  autocomplete="off"
                  :spellcheck="false"
                  autocorrect="off"
                />
              </FormItem>
            </GridItem>
            <GridItem :span="8">
              <FormItem
                :label="$t('manage.index.switchAliasForm.targetIndex')"
                required
                :error="getError('targetIndex', fieldErrors.targetIndex)"
              >
                <SearchableSelect
                  v-model="formData.targetIndex"
                  :options="indices"
                  :placeholder="$t('manage.index.switchAliasForm.targetIndex')"
                  @update:model-value="handleBlur('targetIndex')"
                />
              </FormItem>
            </GridItem>
          </Grid>
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
            {{ $t('dialogOps.confirm') }}
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
import { Form, FormItem } from '@/components/ui/form';
import { Grid, GridItem } from '@/components/ui/grid';
import { SearchableSelect } from '@/components/ui/combobox';

const clusterManageStore = useClusterManageStore();
const { switchAlias, fetchAliases } = clusterManageStore;
const { indexWithAliases } = storeToRefs(clusterManageStore);
const lang = useLang();
const { handleBlur, getError, markSubmitted, resetValidation } = useFormValidation();

const showModal = ref(false);
const createLoading = ref(false);
const { message, isIdle, isSuccess, isError, succeed, fail, reset } = useDialogResult();

const formData = ref<{
  aliasName: string;
  sourceIndex: string;
  targetIndex: string;
}>({ aliasName: '', sourceIndex: '', targetIndex: '' });

const fieldErrors = computed(() => ({
  targetIndex: !formData.value.targetIndex?.trim()
    ? lang.t('manage.index.newAliasForm.indexRequired')
    : undefined,
}));

const validationPassed = computed(() => {
  return !fieldErrors.value.targetIndex;
});

const handleRetry = () => {
  reset();
  submitCreate(new MouseEvent('click'));
};

const toggleModal = (aliasName: string, sourceIndex: string) => {
  if (showModal.value) {
    closeModal();
  } else {
    reset();
    formData.value = { aliasName, sourceIndex, targetIndex: '' };
    showModal.value = true;
  }
};

const closeModal = () => {
  showModal.value = false;
  formData.value = { aliasName: '', sourceIndex: '', targetIndex: '' };
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
    const { aliasName, sourceIndex, targetIndex } = formData.value;
    await switchAlias(aliasName, sourceIndex, targetIndex);
    await fetchAliases();
    succeed();
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
</style>
