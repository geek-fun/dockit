<template>
  <Dialog v-model:open="showIndexModal">
    <DialogContent class="sm:max-w-[800px]">
      <DialogHeader>
        <DialogTitle>{{ $t('manage.index.newIndexForm.title') }}</DialogTitle>
      </DialogHeader>
      <div class="modal-content">
        <Form>
          <Grid :cols="8" :x-gap="10" :y-gap="10">
            <GridItem :span="8">
              <FormItem :label="$t('manage.index.newIndexForm.indexName')" required>
                <Input
                  v-model="formData.indexName"
                  autocapitalize="off"
                  autocomplete="off"
                  :spellcheck="false"
                  autocorrect="off"
                  :placeholder="$t('manage.index.newIndexForm.indexName')"
                />
                <p v-if="errors.indexName" class="text-sm text-destructive mt-1">
                  {{ errors.indexName }}
                </p>
              </FormItem>
            </GridItem>

            <GridItem :span="4">
              <FormItem :label="$t('manage.index.newIndexForm.shards')">
                <InputNumber
                  v-model="formData.shards"
                  :placeholder="$t('manage.index.newIndexForm.shards')"
                />
              </FormItem>
            </GridItem>

            <GridItem :span="4">
              <FormItem :label="$t('manage.index.newIndexForm.replicas')">
                <InputNumber
                  v-model="formData.replicas"
                  :placeholder="$t('manage.index.newIndexForm.replicas')"
                />
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
                  <FormItem label="wait_for_active_shards">
                    <InputNumber v-model="formData.wait_for_active_shards" />
                  </FormItem>
                </GridItem>
                <GridItem :span="8">
                  <FormItem label="body">
                    <textarea v-model="formData.body" class="textarea-input" />
                    <p v-if="errors.body" class="text-sm text-destructive mt-1">
                      {{ errors.body }}
                    </p>
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
          <span v-if="createLoading" class="mr-2 h-4 w-4 animate-spin">⏳</span>
          {{ $t('dialogOps.create') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { useMessageService } from '@/composables';
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

const clusterManageStore = useClusterManageStore();
const { createIndex } = clusterManageStore;

const lang = useLang();
const message = useMessageService();

const showIndexModal = ref(false);
const createLoading = ref(false);

const defaultFormData = {
  indexName: '',
  shards: null as number | null,
  replicas: null as number | null,
  master_timeout: null as number | null,
  wait_for_active_shards: null as number | null,
  timeout: null as number | null,
  body: null as string | null,
};

const formData = ref<{
  indexName: string;
  shards: number | null;
  replicas: number | null;
  master_timeout: number | null;
  wait_for_active_shards: number | null;
  timeout: number | null;
  body: string | null;
}>({ ...defaultFormData });

const errors = ref<{ indexName?: string; body?: string }>({});

const isValidJson = (value: string | null): boolean => {
  if (!value) return true;
  try {
    jsonify.parse(value);
    return true;
  } catch {
    return false;
  }
};

const validateForm = () => {
  errors.value = {};

  if (!formData.value.indexName?.trim()) {
    errors.value.indexName = lang.t('manage.index.newIndexForm.indexRequired');
  }

  if (!isValidJson(formData.value.body)) {
    errors.value.body = lang.t('manage.index.newIndexForm.bodyJsonRequired');
  }

  return Object.keys(errors.value).length === 0;
};

const validationPassed = computed(() => {
  return !!formData.value.indexName?.trim() && isValidJson(formData.value.body);
});

const toggleModal = () => {
  if (showIndexModal.value) {
    closeModal();
  } else {
    showIndexModal.value = true;
  }
};

const closeModal = () => {
  showIndexModal.value = false;
  formData.value = { ...defaultFormData };
  errors.value = {};
};

const submitCreate = async (event: MouseEvent) => {
  event.preventDefault();
  if (!validateForm()) return;

  createLoading.value = true;
  try {
    await createIndex(formData.value);
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
