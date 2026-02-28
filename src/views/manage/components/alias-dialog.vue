<template>
  <Dialog v-model:open="showModal">
    <DialogContent class="sm:max-w-[800px]">
      <DialogHeader>
        <DialogTitle>{{ $t('manage.index.newAliasForm.title') }}</DialogTitle>
      </DialogHeader>
      <div class="modal-content">
        <Form>
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
                <Select
                  v-model="formData.indexName"
                  @update:open="(open: boolean) => !open && handleBlur('indexName')"
                >
                  <SelectTrigger>
                    <SelectValue :placeholder="$t('manage.index.newAliasForm.indexName')" />
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
          <Collapse class="mt-4">
            <CollapseItem title="Advanced" name="Advanced">
              <Grid :cols="8" :x-gap="10" :y-gap="10">
                <GridItem :span="4">
                  <FormItem label="master_timeout">
                    <div class="flex items-center gap-2">
                      <InputNumber v-model="formData.master_timeout" class="flex-1" />
                      <span class="text-sm text-muted-foreground">s</span>
                    </div>
                  </FormItem>
                </GridItem>
                <GridItem :span="4">
                  <FormItem label="timeout">
                    <div class="flex items-center gap-2">
                      <InputNumber v-model="formData.timeout" class="flex-1" />
                      <span class="text-sm text-muted-foreground">s</span>
                    </div>
                  </FormItem>
                </GridItem>
                <GridItem :span="4">
                  <FormItem label="is_write_index">
                    <Switch v-model:checked="formData.is_write_index" />
                  </FormItem>
                </GridItem>
                <GridItem :span="4">
                  <FormItem label="routing">
                    <InputNumber v-model="formData.routing" />
                  </FormItem>
                </GridItem>
                <GridItem :span="4">
                  <FormItem label="search_routing">
                    <InputNumber v-model="formData.search_routing" />
                  </FormItem>
                </GridItem>
                <GridItem :span="4">
                  <FormItem label="index_routing">
                    <InputNumber v-model="formData.index_routing" />
                  </FormItem>
                </GridItem>
                <GridItem :span="8">
                  <FormItem label="filter" :error="getError('filter', fieldErrors.filter)">
                    <textarea
                      v-model="formData.filter"
                      class="textarea-input"
                      @blur="handleBlur('filter')"
                    />
                  </FormItem>
                </GridItem>
              </Grid>
            </CollapseItem>
          </Collapse>
        </Form>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="closeModal">{{ $t('dialogOps.cancel') }}</Button>
        <Button :disabled="!validationPassed || createLoading" @click="submitCreate">
          <Loader2 v-if="createLoading" class="mr-2 h-4 w-4 animate-spin" />
          {{ $t('dialogOps.create') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Loader2 } from 'lucide-vue-next';
import { useMessageService, useFormValidation } from '@/composables';
import { CustomError, jsonify } from '../../../common';
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
import { InputNumber } from '@/components/ui/input-number';
import { Form, FormItem } from '@/components/ui/form';
import { Grid, GridItem } from '@/components/ui/grid';
import { Collapse, CollapseItem } from '@/components/ui/collapse';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

const clusterManageStore = useClusterManageStore();
const { createAlias } = clusterManageStore;
const { indexWithAliases } = storeToRefs(clusterManageStore);
const lang = useLang();
const message = useMessageService();
const { handleBlur, getError, markSubmitted, resetValidation } = useFormValidation();

const showModal = ref(false);
const createLoading = ref(false);

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

const toggleModal = () => {
  if (showModal.value) {
    closeModal();
  } else {
    showModal.value = true;
  }
};

const closeModal = () => {
  showModal.value = false;
  formData.value = { ...defaultFormData };
  resetValidation();
};

const submitCreate = async (event: MouseEvent) => {
  event.preventDefault();
  markSubmitted();
  if (!validationPassed.value) return;

  createLoading.value = true;
  try {
    await createAlias({
      ...formData.value,
      filter: formData.value.filter ? jsonify.parse(formData.value.filter) : undefined,
    });
    message.success(lang.t('dialogOps.createSuccess'));
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
