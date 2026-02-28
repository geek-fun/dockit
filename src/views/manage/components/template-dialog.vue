<template>
  <Dialog v-model:open="showModal">
    <DialogContent class="sm:max-w-[800px]">
      <DialogHeader>
        <DialogTitle>{{ $t('manage.index.newTemplateForm.title') }}</DialogTitle>
      </DialogHeader>
      <Tabs :default-value="TemplateType.INDEX_TEMPLATE" @update:model-value="handleTabSwitch">
        <TabsList class="grid w-full grid-cols-2">
          <TabsTrigger :value="TemplateType.INDEX_TEMPLATE">
            {{ $t('manage.index.newTemplateForm.indexTemplate') }}
          </TabsTrigger>
          <TabsTrigger :value="TemplateType.COMPONENT_TEMPLATE">
            {{ $t('manage.index.newTemplateForm.componentTemplate') }}
          </TabsTrigger>
        </TabsList>
        <TabsContent :value="TemplateType.INDEX_TEMPLATE">
          <Form class="mt-4">
            <Grid :cols="8" :x-gap="10" :y-gap="10">
              <GridItem :span="8">
                <FormItem :label="$t('manage.index.newTemplateForm.templateName')" required>
                  <Input
                    v-model="indexFormData.name"
                    autocapitalize="off"
                    autocomplete="off"
                    :spellcheck="false"
                    autocorrect="off"
                    :placeholder="$t('manage.index.newTemplateForm.templateName')"
                  />
                  <p v-if="indexErrors.name" class="text-sm text-destructive mt-1">
                    {{ indexErrors.name }}
                  </p>
                </FormItem>
              </GridItem>
              <GridItem :span="4">
                <FormItem label="master_timeout">
                  <div class="flex items-center gap-2">
                    <InputNumber v-model="indexFormData.master_timeout" class="flex-1" />
                    <span class="text-sm text-muted-foreground">s</span>
                  </div>
                </FormItem>
              </GridItem>
              <GridItem :span="4">
                <FormItem label="create">
                  <Switch v-model:checked="indexFormData.create" />
                </FormItem>
              </GridItem>
              <GridItem :span="8">
                <FormItem label="body" required>
                  <textarea
                    v-model="indexFormData.body"
                    class="textarea-input"
                    placeholder="Enter JSON body"
                  />
                  <p v-if="indexErrors.body" class="text-sm text-destructive mt-1">
                    {{ indexErrors.body }}
                  </p>
                </FormItem>
              </GridItem>
            </Grid>
          </Form>
        </TabsContent>
        <TabsContent :value="TemplateType.COMPONENT_TEMPLATE">
          <Form class="mt-4">
            <Grid :cols="8" :x-gap="10" :y-gap="10">
              <GridItem :span="8">
                <FormItem :label="$t('manage.index.newTemplateForm.templateName')" required>
                  <Input
                    v-model="componentFormData.name"
                    autocapitalize="off"
                    autocomplete="off"
                    :spellcheck="false"
                    autocorrect="off"
                    :placeholder="$t('manage.index.newTemplateForm.templateName')"
                  />
                  <p v-if="componentErrors.name" class="text-sm text-destructive mt-1">
                    {{ componentErrors.name }}
                  </p>
                </FormItem>
              </GridItem>
              <GridItem :span="4">
                <FormItem label="master_timeout">
                  <div class="flex items-center gap-2">
                    <InputNumber v-model="componentFormData.master_timeout" class="flex-1" />
                    <span class="text-sm text-muted-foreground">s</span>
                  </div>
                </FormItem>
              </GridItem>
              <GridItem :span="4">
                <FormItem label="create">
                  <Switch v-model:checked="componentFormData.create" />
                </FormItem>
              </GridItem>
              <GridItem :span="8">
                <FormItem label="body" required>
                  <textarea
                    v-model="componentFormData.body"
                    class="textarea-input"
                    placeholder="Enter JSON body"
                  />
                  <p v-if="componentErrors.body" class="text-sm text-destructive mt-1">
                    {{ componentErrors.body }}
                  </p>
                </FormItem>
              </GridItem>
            </Grid>
          </Form>
        </TabsContent>
      </Tabs>
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
import { TemplateType } from '../../../datasources';
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
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const clusterManageStore = useClusterManageStore();
const { createTemplate } = clusterManageStore;

const lang = useLang();
const message = useMessageService();

const showModal = ref(false);
const createLoading = ref(false);

const templateType = ref(TemplateType.INDEX_TEMPLATE);

const defaultFormData = {
  name: '',
  create: undefined as boolean | undefined,
  master_timeout: null as number | null,
  body: null as string | null,
};

type TemplateFormData = {
  name: string;
  create?: boolean;
  master_timeout: number | null;
  body: string | null;
};
const indexFormData = ref<TemplateFormData>({ ...defaultFormData });
const componentFormData = ref<TemplateFormData>({ ...defaultFormData });

const indexErrors = ref<{ name?: string; body?: string }>({});
const componentErrors = ref<{ name?: string; body?: string }>({});

const isValidJson = (value: string | null): boolean => {
  if (!value) return false;
  try {
    jsonify.parse(value);
    return true;
  } catch {
    return false;
  }
};

const validateForm = (formData: TemplateFormData): { name?: string; body?: string } => {
  const errors: { name?: string; body?: string } = {};

  if (!formData.name?.trim()) {
    errors.name = lang.t('manage.index.newTemplateForm.templateRequired');
  }

  if (!formData.body?.trim()) {
    errors.body = lang.t('manage.index.newTemplateForm.bodyJsonRequired');
  } else if (!isValidJson(formData.body)) {
    errors.body = lang.t('manage.index.newTemplateForm.bodyJsonRequired');
  }

  return errors;
};

const validationPassed = computed(() => {
  const currentFormData =
    templateType.value === TemplateType.INDEX_TEMPLATE
      ? indexFormData.value
      : componentFormData.value;

  return (
    !!currentFormData.name?.trim() &&
    !!currentFormData.body?.trim() &&
    isValidJson(currentFormData.body)
  );
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
  indexFormData.value = { ...defaultFormData };
  componentFormData.value = { ...defaultFormData };
  indexErrors.value = {};
  componentErrors.value = {};
};

const submitCreate = async (event: MouseEvent) => {
  event.preventDefault();

  const currentFormData =
    templateType.value === TemplateType.INDEX_TEMPLATE
      ? indexFormData.value
      : componentFormData.value;

  const errors = validateForm(currentFormData);

  if (templateType.value === TemplateType.INDEX_TEMPLATE) {
    indexErrors.value = errors;
  } else {
    componentErrors.value = errors;
  }

  if (Object.keys(errors).length > 0) {
    return;
  }

  createLoading.value = true;
  try {
    await createTemplate({
      ...currentFormData,
      type: templateType.value,
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

const handleTabSwitch = (tabName: string | number) => {
  templateType.value = tabName as TemplateType;
};

defineExpose({ toggleModal });
</script>

<style scoped>
.card-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
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
