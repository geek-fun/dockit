<template>
  <Dialog v-model:open="showModal">
    <DialogContent class="sm:max-w-[800px]">
      <DialogHeader>
        <DialogTitle>{{ $t('manage.index.switchAliasForm.title') }}</DialogTitle>
      </DialogHeader>
      <div class="modal-content">
        <Form>
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
                <Select
                  v-model="formData.targetIndex"
                  @update:open="(open: boolean) => !open && handleBlur('targetIndex')"
                >
                  <SelectTrigger>
                    <SelectValue :placeholder="$t('manage.index.switchAliasForm.targetIndex')" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="idx in indices" :key="idx.value" :value="idx.value">
                      {{ idx.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            </GridItem>
          </Grid>
        </Form>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="closeModal">{{ $t('dialogOps.cancel') }}</Button>
        <Button :disabled="!validationPassed || createLoading" @click="submitCreate">
          <Loader2 v-if="createLoading" class="mr-2 h-4 w-4 animate-spin" />
          {{ $t('dialogOps.confirm') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Loader2 } from 'lucide-vue-next';
import { useMessageService, useFormValidation } from '@/composables';
import { CustomError } from '../../../common';
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
import { Input } from '@/components/ui/input';
import { Form, FormItem } from '@/components/ui/form';
import { Grid, GridItem } from '@/components/ui/grid';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const clusterManageStore = useClusterManageStore();
const { switchAlias, fetchAliases } = clusterManageStore;
const { indexWithAliases } = storeToRefs(clusterManageStore);
const lang = useLang();
const message = useMessageService();
const { handleBlur, getError, markSubmitted, resetValidation } = useFormValidation();

const showModal = ref(false);
const createLoading = ref(false);

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

const toggleModal = (aliasName: string, sourceIndex: string) => {
  if (showModal.value) {
    closeModal();
  } else {
    formData.value = { aliasName, sourceIndex, targetIndex: '' };
    showModal.value = true;
  }
};

const closeModal = () => {
  showModal.value = false;
  formData.value = { aliasName: '', sourceIndex: '', targetIndex: '' };
  resetValidation();
};

const submitCreate = async (event: MouseEvent) => {
  event.preventDefault();
  markSubmitted();
  if (!validationPassed.value) return;

  createLoading.value = true;
  try {
    const { aliasName, sourceIndex, targetIndex } = formData.value;
    await switchAlias(aliasName, sourceIndex, targetIndex);
    await fetchAliases();
    message.success(lang.t('dialogOps.switchSuccess'));
    closeModal();
  } catch (err) {
    message.error((err as CustomError).details, {
      closable: true,
      keepAliveOnHover: true,
      duration: 7200,
    });
  } finally {
    createLoading.value = false;
  }
};

const indices = computed(() =>
  indexWithAliases.value.map(index => ({
    label: index.index,
    value: index.index,
  })),
);

defineExpose({ toggleModal });
</script>

<style scoped>
.modal-content {
  padding: 1rem 0;
}
</style>
